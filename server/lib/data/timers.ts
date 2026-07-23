/**
 * Work timers — ported from js/store.js's time-tracking functions
 * (activeTimerFor, activeTimersForUser, startTimer, stopTimer, stopTimersFor,
 * timeEntriesFor, totalSeconds, timerLabel). A timer is a `time_entries` row
 * with no `end` yet; stopping it stamps `end` and the elapsed `seconds`.
 *
 * Identity comes from the session user (not a stored currentUserId), and a
 * person may only run one timer per item at a time.
 */
import 'server-only';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { timeEntries, chores, projectTasks, maintenanceItems } from '@/db/schema';
import { uid } from '@/lib/ids';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { fmtDur } from '@/lib/domain/dates';
import { DataError } from './errors';

export type TimerKind = 'chore' | 'task' | 'maintenance';
export type TimeEntryRow = typeof timeEntries.$inferSelect;
export type ActiveTimer = { id: string; kind: TimerKind; refId: string; start: number; label: string };

async function labelFor(kind: TimerKind, refId: string): Promise<string> {
  if (kind === 'chore') {
    const r = await db.select({ name: chores.name }).from(chores).where(eq(chores.id, refId)).limit(1);
    return r[0]?.name ?? 'chore';
  }
  if (kind === 'task') {
    const r = await db.select({ title: projectTasks.title }).from(projectTasks).where(eq(projectTasks.id, refId)).limit(1);
    return r[0]?.title ?? 'task';
  }
  const r = await db.select({ name: maintenanceItems.name }).from(maintenanceItems).where(eq(maintenanceItems.id, refId)).limit(1);
  return r[0]?.name ?? 'maintenance';
}

export async function activeTimerFor(userId: string, kind: TimerKind, refId: string): Promise<TimeEntryRow | null> {
  const rows = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.kind, kind), eq(timeEntries.refId, refId), isNull(timeEntries.end)))
    .limit(1);
  return rows[0] ?? null;
}

export async function activeTimersForUser(userId: string): Promise<ActiveTimer[]> {
  const rows = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.end)));
  const out: ActiveTimer[] = [];
  for (const e of rows) {
    out.push({ id: e.id, kind: e.kind, refId: e.refId, start: e.start, label: await labelFor(e.kind, e.refId) });
  }
  return out.sort((a, b) => a.start - b.start);
}

export async function startTimer(user: SessionUser, kind: TimerKind, refId: string): Promise<void> {
  const existing = await activeTimerFor(user.id, kind, refId);
  if (existing) return; // idempotent — already running
  await db.insert(timeEntries).values({ id: uid('te'), kind, refId, userId: user.id, start: Date.now(), end: null, seconds: 0 });
  publishChange('timer');
}

export async function stopTimer(user: SessionUser, kind: TimerKind, refId: string): Promise<void> {
  const e = await activeTimerFor(user.id, kind, refId);
  if (!e) throw new DataError('No running timer.', 400);
  const end = Date.now();
  const seconds = Math.max(1, Math.round((end - e.start) / 1000));
  await db.update(timeEntries).set({ end, seconds }).where(eq(timeEntries.id, e.id));
  await logActivity(user.id, `logged ${fmtDur(seconds)} of work`);
}

/**
 * End every still-running timer for an item, for all users. Called when an item
 * is completed so the clock stops automatically (mirrors stopTimersFor).
 */
export async function stopTimersFor(kind: TimerKind, refId: string): Promise<void> {
  const running = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.kind, kind), eq(timeEntries.refId, refId), isNull(timeEntries.end)));
  if (!running.length) return;
  const end = Date.now();
  for (const e of running) {
    const seconds = Math.max(1, Math.round((end - e.start) / 1000));
    await db.update(timeEntries).set({ end, seconds }).where(eq(timeEntries.id, e.id));
  }
  publishChange('timer');
}

export async function timeEntriesFor(kind: TimerKind, refId: string): Promise<TimeEntryRow[]> {
  const rows = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.kind, kind), eq(timeEntries.refId, refId)));
  return rows.filter((e) => e.end != null).sort((a, b) => b.start - a.start);
}

export async function totalSeconds(kind: TimerKind, refId: string): Promise<number> {
  const rows = await timeEntriesFor(kind, refId);
  return rows.reduce((s, e) => s + (e.seconds || 0), 0);
}

/** Whether the given user currently has a timer running on this item. */
export async function isTimerRunning(userId: string, kind: TimerKind, refId: string): Promise<boolean> {
  return (await activeTimerFor(userId, kind, refId)) != null;
}

export type TimerState = { running: boolean; startedAt: number | null; totalSec: number };

/**
 * Timer state for a batch of items of the same kind, keyed by refId — for list
 * views (project tasks, an asset's maintenance items) that render one control
 * per row. "running" reflects the given user's own clock.
 */
export async function timerStatesFor(userId: string, kind: TimerKind, refIds: string[]): Promise<Record<string, TimerState>> {
  const out: Record<string, TimerState> = {};
  if (!refIds.length) return out;
  const rows = await db.select().from(timeEntries).where(and(eq(timeEntries.kind, kind), inArray(timeEntries.refId, refIds)));
  for (const id of refIds) out[id] = { running: false, startedAt: null, totalSec: 0 };
  for (const e of rows) {
    const st = out[e.refId];
    if (!st) continue;
    if (e.end == null) {
      if (e.userId === userId) {
        st.running = true;
        st.startedAt = e.start;
      }
    } else {
      st.totalSec += e.seconds || 0;
    }
  }
  return out;
}
