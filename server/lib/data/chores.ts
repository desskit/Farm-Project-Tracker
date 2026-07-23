/**
 * Chore data-access layer — ported from js/store.js's chore functions
 * (listChores, choreById, addChore, updateChore, completeChore, deleteChore,
 * choreCompletionsFor, choreStreak, claimItem/releaseItem, sendBackChore).
 *
 * Role checks live here (not just in the API routes) so any future caller —
 * another route, a cron job — gets the same guarantees the prototype's
 * store.js gave every UI call site.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { chores, choreCompletions } from '@/db/schema';
import type { Schedule, SentBack } from '@/db/schema';
import { uid } from '@/lib/ids';
import { nextOccurrenceAfter } from '@/lib/domain/recurrence';
import { todayISO, addDays } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { DataError } from './errors';

export type ChoreRow = typeof chores.$inferSelect;
export type ChoreCompletionRow = typeof choreCompletions.$inferSelect;

function isManager(user: SessionUser): boolean {
  return user.role === 'manager' || user.role === 'admin';
}

export async function listChores(): Promise<ChoreRow[]> {
  const rows = await db.select().from(chores);
  return rows.sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));
}

export async function choreById(id: string): Promise<ChoreRow | null> {
  const rows = await db.select().from(chores).where(eq(chores.id, id)).limit(1);
  return rows[0] ?? null;
}

export type ChoreInput = {
  name: string;
  schedule: Schedule;
  catchUp?: 'mustCatchUp' | 'skipToNext';
  assignedTo?: string | null;
  nextDue?: string;
  requirePhoto?: boolean;
  open?: boolean;
  steps?: string[];
};

export async function addChore(user: SessionUser, data: ChoreInput): Promise<ChoreRow> {
  if (!isManager(user)) throw new DataError('Only managers and admins can add chores.', 403);
  const id = uid('c');
  await db.insert(chores).values({
    id,
    name: data.name.trim(),
    schedule: data.schedule,
    catchUp: data.catchUp || 'skipToNext',
    assignedTo: data.assignedTo || null,
    nextDue: data.nextDue || todayISO(),
    requirePhoto: !!data.requirePhoto,
    open: !!data.open,
    steps: Array.isArray(data.steps) ? data.steps.filter(Boolean) : [],
  });
  await logActivity(user.id, `added chore "${data.name.trim()}"`);
  return (await choreById(id))!;
}

export async function updateChore(user: SessionUser, id: string, data: Partial<ChoreInput>): Promise<ChoreRow> {
  if (!isManager(user)) throw new DataError('Only managers and admins can edit chores.', 403);
  const chore = await choreById(id);
  if (!chore) throw new DataError('No such chore.', 404);

  const patch: Partial<typeof chores.$inferInsert> = {};
  if (data.name != null && data.name.trim()) patch.name = data.name.trim();
  if (data.schedule) patch.schedule = data.schedule;
  if (data.catchUp) patch.catchUp = data.catchUp;
  patch.assignedTo = data.assignedTo || null;
  if (data.nextDue) patch.nextDue = data.nextDue;
  patch.requirePhoto = !!data.requirePhoto;
  patch.open = !!data.open;
  if (Array.isArray(data.steps)) patch.steps = data.steps.filter(Boolean);

  await db.update(chores).set(patch).where(eq(chores.id, id));
  return (await choreById(id))!;
}

export async function deleteChore(user: SessionUser, id: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can delete chores.', 403);
  await db.delete(chores).where(eq(chores.id, id)); // completions cascade via FK
}

export async function choreCompletionsFor(choreId: string): Promise<ChoreCompletionRow[]> {
  const rows = await db.select().from(choreCompletions).where(eq(choreCompletions.choreId, choreId));
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Consecutive-day streak (meaningful for daily chores): counts back from
 * today, or yesterday so an as-yet-undone today doesn't break the run.
 */
export async function choreStreak(choreId: string): Promise<number> {
  const rows = await db
    .select({ date: choreCompletions.date })
    .from(choreCompletions)
    .where(eq(choreCompletions.choreId, choreId));
  const days = new Set(rows.map((r) => r.date));
  let d = todayISO();
  if (!days.has(d)) d = addDays(d, -1);
  let streak = 0;
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export async function completeChore(
  user: SessionUser,
  id: string,
  notes?: string,
  photoId?: string | null,
): Promise<void> {
  const chore = await choreById(id);
  if (!chore) throw new DataError('No such chore.', 404);
  if (chore.requirePhoto && !photoId) {
    throw new DataError('This chore requires a photo to complete.', 400);
  }
  const today = todayISO();
  await db.insert(choreCompletions).values({
    id: uid('cc'),
    choreId: id,
    completedBy: user.id,
    date: today,
    notes: notes || '',
    photoId: photoId || null,
  });
  const nextDue =
    chore.catchUp === 'mustCatchUp'
      ? nextOccurrenceAfter(chore.schedule, chore.nextDue)
      : nextOccurrenceAfter(chore.schedule, today);
  await db.update(chores).set({ nextDue, sentBack: null }).where(eq(chores.id, id));
  await logActivity(user.id, `completed chore "${chore.name}"`);
  // Note: stopping any running time-tracking timer for this chore is deferred
  // until time tracking is ported (a later phase) — no timers exist yet.
}

export async function claimChore(user: SessionUser, id: string): Promise<void> {
  const chore = await choreById(id);
  if (!chore) throw new DataError('No such chore.', 404);
  if (!chore.open || chore.assignedTo) throw new DataError('This chore is not open to claim.', 400);
  await db.update(chores).set({ assignedTo: user.id }).where(eq(chores.id, id));
}

export async function releaseChore(user: SessionUser, id: string): Promise<void> {
  const chore = await choreById(id);
  if (!chore) throw new DataError('No such chore.', 404);
  if (!chore.open) throw new DataError('This item is not an open item.', 400);
  if (chore.assignedTo !== user.id && !isManager(user)) {
    throw new DataError('Only the current owner or a manager can release it.', 403);
  }
  await db.update(chores).set({ assignedTo: null }).where(eq(chores.id, id));
}

/** Undoes a chore completion and flags the chore "sent back" for redo. */
export async function sendBackChoreCompletion(user: SessionUser, completionId: string, reason?: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can send work back.', 403);
  const rows = await db.select().from(choreCompletions).where(eq(choreCompletions.id, completionId)).limit(1);
  const comp = rows[0];
  if (!comp) throw new DataError('No such completion.', 404);

  await db.delete(choreCompletions).where(eq(choreCompletions.id, completionId));

  const chore = await choreById(comp.choreId);
  if (chore) {
    const today = todayISO();
    const sentBack: SentBack = { by: user.id, at: Date.now(), reason: reason || '', worker: comp.completedBy };
    const patch: Partial<typeof chores.$inferInsert> = { sentBack };
    if (chore.nextDue > today) patch.nextDue = today;
    await db.update(chores).set(patch).where(eq(chores.id, chore.id));
    await logActivity(user.id, `sent back chore "${chore.name}"`);
  }
}
