/**
 * Appointments: the vet, the farrier, an inspector, a contractor, on a set
 * day.
 *
 *  - Everyone on the farm sees them, except visits to a rental unit, which
 *    only people who manage rentals, the people listed, and that unit's
 *    tenants see.
 *  - Adding or changing one needs work.manage, or rentals.manage for a
 *    rental-unit visit.
 *  - The day before, the people listed (and, for a rental-unit visit, its
 *    tenants) get one reminder.
 */
import 'server-only';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/db';
import { animalGroups, appointments, assets, contacts, landUnits, leaseTenants, leases, rentalUnits, type AppointmentLink, type AppointmentStatus } from '@/db/schema';
import { uid } from '@/lib/ids';
import { addDays, fmtDate, todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { publishChange } from '@/lib/realtime/bus';
import { pushToPeople } from '@/lib/notify/events';
import { DataError } from './errors';
import { getSetting, setSetting } from './settings';

type Row = typeof appointments.$inferSelect;
export type AppointmentView = Row & { contactName: string | null; contactPhone: string | null; linkLabel: string | null; linkHref: string | null; canEdit: boolean };
export type AppointmentInput = {
  title: string; date: string; time?: string; contactId?: string | null; linkType?: AppointmentLink | null; linkId?: string | null; notes?: string; people?: string[];
};

/** The active tenants of a rental unit. */
async function tenantsOf(unitId: string): Promise<string[]> {
  const today = todayISO();
  const rows = await db.select({ userId: leaseTenants.userId, end: leases.endDate, start: leases.startDate }).from(leaseTenants)
    .innerJoin(leases, eq(leases.id, leaseTenants.leaseId)).where(eq(leases.unitId, unitId));
  return [...new Set(rows.filter((r) => r.start <= today && (!r.end || r.end >= today)).map((r) => r.userId))];
}

function canEdit(user: SessionUser, linkType: AppointmentLink | null | undefined): boolean {
  return linkType === 'rental_unit' ? can(user, 'rentals.manage') || can(user, 'work.manage') : can(user, 'work.manage');
}

async function canSee(viewer: SessionUser, a: Row): Promise<boolean> {
  if (a.linkType === 'rental_unit') {
    if (can(viewer, 'rentals.manage') || a.people.includes(viewer.id)) return true;
    return !!a.linkId && (await tenantsOf(a.linkId)).includes(viewer.id);
  }
  return can(viewer, 'farm.view');
}

/** Names and pages for what appointments are about. */
async function linkInfo(rows: Row[]): Promise<Map<string, { label: string; href: string }>> {
  const ids = (t: AppointmentLink) => rows.filter((r) => r.linkType === t && r.linkId).map((r) => r.linkId!);
  const [g, u, a, l] = await Promise.all([
    ids('animal_group').length ? db.select({ id: animalGroups.id, name: animalGroups.name }).from(animalGroups).where(inArray(animalGroups.id, ids('animal_group'))) : [],
    ids('rental_unit').length ? db.select({ id: rentalUnits.id, name: rentalUnits.name }).from(rentalUnits).where(inArray(rentalUnits.id, ids('rental_unit'))) : [],
    ids('asset').length ? db.select({ id: assets.id, name: assets.name }).from(assets).where(inArray(assets.id, ids('asset'))) : [],
    ids('land_unit').length ? db.select({ id: landUnits.id, name: landUnits.name }).from(landUnits).where(inArray(landUnits.id, ids('land_unit'))) : [],
  ]);
  const out = new Map<string, { label: string; href: string }>();
  for (const x of g) out.set(`animal_group:${x.id}`, { label: x.name, href: `/farm/animals/${x.id}` });
  for (const x of u) out.set(`rental_unit:${x.id}`, { label: x.name, href: `/more/rentals/${x.id}` });
  for (const x of a) out.set(`asset:${x.id}`, { label: x.name, href: `/maintenance/${x.id}` });
  for (const x of l) out.set(`land_unit:${x.id}`, { label: x.name, href: `/farm/land/${x.id}` });
  return out;
}

async function hydrate(viewer: SessionUser, rows: Row[]): Promise<AppointmentView[]> {
  const visible: Row[] = [];
  for (const r of rows) if (await canSee(viewer, r)) visible.push(r);
  if (!visible.length) return [];
  const contactIds = [...new Set(visible.map((r) => r.contactId).filter((x): x is string => !!x))];
  const [cs, links] = await Promise.all([
    contactIds.length ? db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone }).from(contacts).where(inArray(contacts.id, contactIds)) : Promise.resolve([]),
    linkInfo(visible),
  ]);
  const contact = new Map(cs.map((c) => [c.id, c]));
  return visible.map((r) => {
    const link = r.linkType && r.linkId ? links.get(`${r.linkType}:${r.linkId}`) : undefined;
    const c = r.contactId ? contact.get(r.contactId) : undefined;
    return { ...r, contactName: c?.name ?? null, contactPhone: c?.phone || null, linkLabel: link?.label ?? null, linkHref: link?.href ?? null, canEdit: canEdit(viewer, r.linkType) };
  });
}

/** Scheduled appointments between two dates (inclusive), soonest first, that this person may see. */
export async function listAppointments(viewer: SessionUser, from: string, to: string, opts: { linkType?: AppointmentLink; linkId?: string; includeDone?: boolean } = {}): Promise<AppointmentView[]> {
  const where = [
    gte(appointments.date, from), lte(appointments.date, to),
    opts.includeDone ? undefined : eq(appointments.status, 'scheduled'),
    opts.linkType ? eq(appointments.linkType, opts.linkType) : undefined,
    opts.linkId ? eq(appointments.linkId, opts.linkId) : undefined,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const rows = await db.select().from(appointments).where(and(...where)).orderBy(asc(appointments.date), asc(appointments.time));
  return hydrate(viewer, rows);
}

async function check(d: AppointmentInput) {
  if (!d.title.trim()) throw new DataError('Say what the appointment is.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new DataError('Pick a date.', 400);
  if (d.time && !/^\d{2}:\d{2}$/.test(d.time)) throw new DataError('Check the time.', 400);
  if ((d.linkType && !d.linkId) || (!d.linkType && d.linkId)) throw new DataError('Pick what it’s about.', 400);
  if (d.contactId && !(await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, d.contactId)).limit(1)).length) throw new DataError('That contact no longer exists.', 400);
}

const values = (d: AppointmentInput) => ({
  title: d.title.trim().slice(0, 120), date: d.date, time: d.time ?? '', contactId: d.contactId || null,
  linkType: d.linkType || null, linkId: d.linkId || null, notes: d.notes?.trim() ?? '', people: [...new Set(d.people ?? [])],
});

export async function addAppointment(user: SessionUser, d: AppointmentInput): Promise<string> {
  if (!canEdit(user, d.linkType)) throw new DataError('Only a manager can add appointments.', 403);
  await check(d);
  const id = uid('ap');
  await db.insert(appointments).values({ id, ...values(d), createdBy: user.id });
  publishChange('calendar');
  return id;
}

export async function updateAppointment(user: SessionUser, id: string, d: AppointmentInput & { status?: AppointmentStatus }): Promise<void> {
  const [a] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  if (!a || !(await canSee(user, a))) throw new DataError('No such appointment.', 404);
  if (!canEdit(user, a.linkType) || !canEdit(user, d.linkType)) throw new DataError('Only a manager can change appointments.', 403);
  await check(d);
  await db.update(appointments).set({ ...values(d), ...(d.status ? { status: d.status } : {}) }).where(eq(appointments.id, id));
  publishChange('calendar');
}

export async function setAppointmentStatus(user: SessionUser, id: string, status: AppointmentStatus): Promise<void> {
  const [a] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  if (!a || !(await canSee(user, a))) throw new DataError('No such appointment.', 404);
  if (!canEdit(user, a.linkType)) throw new DataError('Only a manager can change appointments.', 403);
  await db.update(appointments).set({ status }).where(eq(appointments.id, id));
  publishChange('calendar');
}

export async function deleteAppointment(user: SessionUser, id: string): Promise<void> {
  const [a] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  if (!a || !(await canSee(user, a))) throw new DataError('No such appointment.', 404);
  if (!canEdit(user, a.linkType)) throw new DataError('Only a manager can change appointments.', 403);
  await db.delete(appointments).where(eq(appointments.id, id));
  publishChange('calendar');
}

/** "Tue 18 Nov, 9:30" style, for lists and reminders. */
export function whenLabel(a: Pick<Row, 'date' | 'time'>): string {
  if (!a.time) return fmtDate(a.date);
  const [h, m] = a.time.split(':').map(Number);
  return `${fmtDate(a.date)}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const SENT_KEY = 'appointment-reminders-sent';

/** Daily: tomorrow's appointments, one reminder each to the people listed (and a unit's tenants). */
export async function runAppointmentReminders(today = todayISO()): Promise<{ sent: number }> {
  const tomorrow = addDays(today, 1);
  const rows = await db.select().from(appointments).where(and(eq(appointments.date, tomorrow), eq(appointments.status, 'scheduled')));
  if (!rows.length) return { sent: 0 };
  const sent = (await getSetting<Record<string, string>>(SENT_KEY)) ?? {};
  const keep: Record<string, string> = {};
  for (const [k, d] of Object.entries(sent)) if (d >= addDays(today, -14)) keep[k] = d;
  const links = await linkInfo(rows);
  let count = 0;
  for (const a of rows) {
    const key = `${a.id}|${a.date}`;
    if (keep[key]) continue;
    keep[key] = today;
    const to = new Set([...a.people, ...(a.createdBy ? [a.createdBy] : [])]);
    if (a.linkType === 'rental_unit' && a.linkId) for (const t of await tenantsOf(a.linkId)) to.add(t);
    if (!to.size) continue;
    const about = a.linkType && a.linkId ? links.get(`${a.linkType}:${a.linkId}`)?.label : undefined;
    await pushToPeople([...to], { title: `Tomorrow: ${a.title}`, body: `${whenLabel(a)}${about ? ` · ${about}` : ''}${a.notes ? ` · ${a.notes}` : ''}`, url: '/more/appointments' });
    count++;
  }
  await setSetting(SENT_KEY, keep);
  return { sent: count };
}
