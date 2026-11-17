/**
 * Equipment checkout: who has the chainsaw, the trailer, the truck.
 *
 *  - Anyone on the farm who does work can check something out (one holder at
 *    a time) and check it back in; checking in someone else's needs
 *    work.manage.
 *  - Buildings and land aren't things you take, so they aren't offered.
 *  - Something past its due-back date nudges its holder once, and managers
 *    once it's three days late.
 */
import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { assetCheckouts, assets, users } from '@/db/schema';
import { uid } from '@/lib/ids';
import { addDays, fmtDate, todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { publishChange } from '@/lib/realtime/bus';
import { pushToPeople } from '@/lib/notify/events';
import { DataError } from './errors';
import { recipientsWith } from './recipients';
import { getSetting, setSetting } from './settings';

const NOT_TAKEN = ['building', 'buildings', 'land', 'structure', 'structures', 'property'];
export function isCheckable(category: string): boolean {
  return !NOT_TAKEN.includes(category.trim().toLowerCase());
}

export type CheckoutView = { id: string; userId: string | null; who: string; outAt: number; dueBack: string | null; note: string; overdue: boolean };
export type EquipmentRow = { id: string; name: string; category: string; out: CheckoutView | null };

const view = (c: typeof assetCheckouts.$inferSelect, who: string | null, today: string): CheckoutView => ({
  id: c.id, userId: c.userId, who: who ?? 'Someone no longer here', outAt: c.outAt, dueBack: c.dueBack, note: c.note, overdue: !!c.dueBack && c.dueBack < today,
});

/** Everything that can be checked out, with who has it now. */
export async function listEquipment(viewer: SessionUser, today = todayISO()): Promise<EquipmentRow[]> {
  if (!can(viewer, 'farm.view')) throw new DataError('Not found.', 404);
  const [rows, open] = await Promise.all([
    db.select({ id: assets.id, name: assets.name, category: assets.category }).from(assets),
    db.select({ c: assetCheckouts, who: users.name }).from(assetCheckouts).leftJoin(users, eq(users.id, assetCheckouts.userId)).where(isNull(assetCheckouts.inAt)),
  ]);
  const byAsset = new Map(open.map((o) => [o.c.assetId, view(o.c, o.who, today)]));
  return rows.filter((a) => isCheckable(a.category)).map((a) => ({ ...a, out: byAsset.get(a.id) ?? null }))
    .sort((a, b) => Number(!!b.out?.overdue) - Number(!!a.out?.overdue) || Number(!!b.out) - Number(!!a.out) || a.name.localeCompare(b.name));
}

/** One asset: who has it now, and the last few times it went out. */
export async function checkoutsFor(assetId: string, today = todayISO()): Promise<{ current: CheckoutView | null; history: (CheckoutView & { inAt: number | null })[] }> {
  const rows = await db.select({ c: assetCheckouts, who: users.name }).from(assetCheckouts).leftJoin(users, eq(users.id, assetCheckouts.userId))
    .where(eq(assetCheckouts.assetId, assetId)).orderBy(desc(assetCheckouts.outAt)).limit(11);
  const current = rows.find((r) => r.c.inAt == null);
  return {
    current: current ? view(current.c, current.who, today) : null,
    history: rows.filter((r) => r.c.inAt != null).slice(0, 10).map((r) => ({ ...view(r.c, r.who, today), overdue: false, inAt: r.c.inAt })),
  };
}

export async function checkOut(user: SessionUser, assetId: string, d: { dueBack?: string | null; note?: string } = {}): Promise<string> {
  if (!can(user, 'work.do')) throw new DataError('You can’t check equipment out.', 403);
  const [a] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!a) throw new DataError('No such equipment.', 404);
  if (!isCheckable(a.category)) throw new DataError('That isn’t something you can take out.', 400);
  const [open] = await db.select({ id: assetCheckouts.id, userId: assetCheckouts.userId }).from(assetCheckouts).where(and(eq(assetCheckouts.assetId, assetId), isNull(assetCheckouts.inAt))).limit(1);
  if (open) throw new DataError(open.userId === user.id ? 'You already have it.' : 'Someone else has it. It has to be checked in first.', 409);
  if (d.dueBack && d.dueBack < todayISO()) throw new DataError('The return date has already passed.', 400);
  const id = uid('co');
  await db.insert(assetCheckouts).values({ id, assetId, userId: user.id, outAt: Date.now(), dueBack: d.dueBack || null, note: d.note?.trim() ?? '' });
  publishChange('assets');
  return id;
}

export async function checkIn(user: SessionUser, assetId: string): Promise<void> {
  const [open] = await db.select().from(assetCheckouts).where(and(eq(assetCheckouts.assetId, assetId), isNull(assetCheckouts.inAt))).limit(1);
  if (!open) throw new DataError('It isn’t checked out.', 409);
  if (open.userId !== user.id && !can(user, 'work.manage')) throw new DataError('Only whoever has it, or a manager, can check it in.', 403);
  await db.update(assetCheckouts).set({ inAt: Date.now(), checkedInBy: user.id }).where(eq(assetCheckouts.id, open.id));
  publishChange('assets');
}

const SENT_KEY = 'checkout-reminders-sent';

/** Daily: a nudge to whoever has something past due, and to managers once it's three days late. Each once. */
export async function runCheckoutReminders(today = todayISO()): Promise<{ sent: number }> {
  const open = await db.select({ c: assetCheckouts, name: assets.name, who: users.name }).from(assetCheckouts)
    .innerJoin(assets, eq(assets.id, assetCheckouts.assetId)).leftJoin(users, eq(users.id, assetCheckouts.userId))
    .where(isNull(assetCheckouts.inAt));
  const late = open.filter((o) => o.c.dueBack && o.c.dueBack < today);
  if (!late.length) return { sent: 0 };
  const sent = (await getSetting<Record<string, string>>(SENT_KEY)) ?? {};
  const keep: Record<string, string> = {};
  const openIds = new Set(open.map((o) => o.c.id));
  for (const [k, d] of Object.entries(sent)) if (openIds.has(k.split('|')[0])) keep[k] = d;
  let count = 0;
  let managers: string[] | null = null;
  for (const o of late) {
    if (o.c.userId && !keep[`${o.c.id}|holder`]) {
      keep[`${o.c.id}|holder`] = today;
      await pushToPeople([o.c.userId], { title: 'Time to bring it back', body: `${o.name} was due back ${fmtDate(o.c.dueBack!)}.`, url: `/maintenance/${o.c.assetId}` });
      count++;
    }
    if (o.c.dueBack! <= addDays(today, -3) && !keep[`${o.c.id}|managers`]) {
      keep[`${o.c.id}|managers`] = today;
      managers ??= (await recipientsWith('work.manage')).map((m) => m.id);
      await pushToPeople(managers.filter((id) => id !== o.c.userId), { title: 'Equipment still out', body: `${o.who ?? 'Someone'} has had ${o.name} since ${fmtDate(new Date(o.c.outAt).toISOString().slice(0, 10))}; it was due back ${fmtDate(o.c.dueBack!)}.`, url: '/farm/equipment' });
      count++;
    }
  }
  await setSetting(SENT_KEY, keep);
  return { sent: count };
}
