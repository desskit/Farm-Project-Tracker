/**
 * Calendar feed — ported from js/store.js's calendarItems(). Expands recurring
 * chores across the requested window and gathers dated maintenance, project
 * tasks, and rent charges that fall inside it. Pure read; used by the calendar
 * page to dot days and list a selected day's work.
 */
import 'server-only';
import { db } from '@/db';
import { isNotNull } from 'drizzle-orm';
import { assetDocs, chores, maintenanceItems, projectTasks, rentCharges, rentDocs, users } from '@/db/schema';
import { nextOccurrenceAfter } from '@/lib/domain/recurrence';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { canSeeWork } from '@/lib/domain/scope';
import { choreAssigneeIdsFor, taskAssigneeIdsFor } from './assignees';
import { upkeepWithStatus } from './upkeep-status';
import { livestockAlerts } from './livestock';
import { landAlerts } from './land';
import { leaseIdsFor } from './rentals';
import { todayISO } from '@/lib/domain/dates';

export type CalendarKind = 'chore' | 'maintenance' | 'task' | 'rent' | 'animals' | 'land' | 'papers';
export type CalendarItem = { date: string; kind: CalendarKind; id: string; title: string; href: string };

export async function calendarItems(viewer: SessionUser, fromISO: string, toISO: string): Promise<CalendarItem[]> {
  // Rent is private: managers see every charge, everyone else only their own.
  const seesAllRent = can(viewer, 'finance.view');
  const within = (d: string) => d >= fromISO && d <= toISO;
  const out: CalendarItem[] = [];

  const [choreRows, maintRows, taskRows, rentRows, userRows] = await Promise.all([
    db.select().from(chores),
    db.select().from(maintenanceItems),
    db.select().from(projectTasks),
    db.select().from(rentCharges),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const nameById = new Map(userRows.map((u) => [u.id, u.name]));
  const [choreOn, taskOn] = await Promise.all([
    choreAssigneeIdsFor(choreRows.map((c) => c.id)),
    taskAssigneeIdsFor(taskRows.map((t) => t.id)),
  ]);

  // Chores recur — walk each schedule from its next-due up to the window end.
  for (const c of choreRows) {
    if (c.done) continue; // completed one-time chores are off the calendar
    if (!canSeeWork(viewer, { ...c, assigneeIds: choreOn[c.id] ?? [] })) continue;
    let d = c.nextDue;
    let guard = 0;
    while (d < fromISO && guard < 800) {
      const nd = nextOccurrenceAfter(c.schedule, d);
      if (nd <= d) break;
      d = nd;
      guard++;
    }
    guard = 0;
    while (d <= toISO && guard < 400) {
      if (within(d)) out.push({ date: d, kind: 'chore', id: c.id, title: c.name, href: `/chores/${c.id}` });
      const n2 = nextOccurrenceAfter(c.schedule, d);
      if (n2 <= d) break;
      d = n2;
      guard++;
    }
  }

  for (const m of maintRows) {
    if (m.intervalType === 'calendar' && m.nextDueDate && within(m.nextDueDate)) {
      out.push({ date: m.nextDueDate, kind: 'maintenance', id: m.id, title: m.name, href: `/maintenance/${m.assetId}` });
    }
  }
  // Meter-based upkeep has no date; show anything due or close to it on today.
  const today = todayISO();
  if (within(today)) {
    for (const u of await upkeepWithStatus()) {
      if (u.status.mode !== 'usage' || u.status.bucket === 'later') continue;
      out.push({ date: today, kind: 'maintenance', id: u.id, title: `${u.name} · ${u.status.detail}`, href: `/maintenance/${u.assetId}` });
    }
  }

  for (const t of taskRows) {
    if (!canSeeWork(viewer, { ...t, assigneeIds: taskOn[t.id] ?? [] })) continue;
    if (!t.done && t.dueDate && within(t.dueDate)) {
      out.push({ date: t.dueDate, kind: 'task', id: t.id, title: t.title, href: `/projects/${t.projectId}` });
    }
  }

  const myLeases = await leaseIdsFor(viewer.id);
  for (const c of rentRows) {
    const mine = c.userId === viewer.id || (!!c.leaseId && myLeases.includes(c.leaseId));
    if (!mine && !seesAllRent) continue;
    if (c.status !== 'verified' && c.dueDate && within(c.dueDate)) {
      const what = c.kind === 'rent' ? 'rent' : c.label || 'charge';
      const title = mine ? `Your ${what}` : `${what.charAt(0).toUpperCase()}${what.slice(1)} · ${nameById.get(c.userId) ?? 'someone'}`;
      out.push({ date: c.dueDate, kind: 'rent', id: c.id, title, href: '/more/rent' });
    }
  }

  if (can(viewer, 'animals.view')) {
    const days = Math.max(0, Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000));
    const a = await livestockAlerts(fromISO, days);
    for (const b of a.births) {
      if (within(b.dueOn)) out.push({ date: b.dueOn, kind: 'animals', id: b.id, title: `${b.dam ?? b.groupName} due (around)`, href: `/farm/animals/${b.groupId}` });
    }
    for (const w of a.withdrawals) {
      for (const [d, what] of [[w.milkUntil, 'milk/eggs OK'], [w.meatUntil, 'meat OK']] as const) {
        if (d && within(d)) out.push({ date: d, kind: 'animals', id: `${w.id}-${what}`, title: `${w.groupName}: ${what}`, href: `/farm/animals/${w.groupId}` });
      }
    }
  }

  // Papers running out: equipment papers for the farm; a tenant's own (or all, for rental managers).
  if (can(viewer, 'farm.view')) {
    const docs = await db.select({ id: assetDocs.id, name: assetDocs.name, assetId: assetDocs.assetId, on: assetDocs.expiresOn }).from(assetDocs).where(isNotNull(assetDocs.expiresOn));
    for (const d of docs) if (within(d.on!)) out.push({ date: d.on!, kind: 'papers', id: d.id, title: `${d.name} expires`, href: `/maintenance/${d.assetId}` });
  }
  {
    const docs = await db.select({ id: rentDocs.id, name: rentDocs.name, userId: rentDocs.userId, on: rentDocs.expiresOn }).from(rentDocs).where(isNotNull(rentDocs.expiresOn));
    for (const d of docs) {
      if (d.userId !== viewer.id && !can(viewer, 'rentals.manage')) continue;
      if (within(d.on!)) out.push({ date: d.on!, kind: 'papers', id: d.id, title: `${d.name} expires`, href: '/more/rent' });
    }
  }

  if (can(viewer, 'land.view')) {
    const days = Math.max(0, Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000));
    const l = await landAlerts(fromISO, days);
    for (const p of l.ready) if (within(p.ready)) out.push({ date: p.ready, kind: 'land', id: p.id, title: `${p.crop} ready · ${p.unitName}`, href: `/farm/land/${p.unitId}` });
    for (const p of l.toSow) if (within(p.sownOn)) out.push({ date: p.sownOn, kind: 'land', id: `sow-${p.id}`, title: `Sow ${p.crop} · ${p.unitName}`, href: `/farm/land/${p.unitId}` });
    for (const x of l.sprays) if (within(x.until)) out.push({ date: x.until, kind: 'land', id: `phi-${x.id}`, title: `${x.unitName}: OK to harvest`, href: `/farm/land/${x.unitId}` });
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
