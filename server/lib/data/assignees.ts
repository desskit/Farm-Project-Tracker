/**
 * Multi-assignee helpers for chores and project tasks.
 *
 * A chore or task can have several people on it, so assignment lives in the
 * `chore_assignees` / `task_assignees` join tables rather than in a single
 * column. The legacy `assigned_to` columns are still present in the schema as
 * the pre-migration backup but are no longer read or written.
 *
 * Replacing the whole set on write keeps these idempotent and lets callers
 * treat the incoming list as the truth, which is how every edit form sends it.
 */
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { choreAssignees, taskAssignees } from '@/db/schema';

/** Every requested id gets an entry (empty when nobody is assigned). */
function emptyMap(ids: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of ids) out[id] = [];
  return out;
}

/* ---------------- chores ---------------- */

export async function choreAssigneeIds(choreId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: choreAssignees.userId })
    .from(choreAssignees)
    .where(eq(choreAssignees.choreId, choreId));
  return rows.map((r) => r.userId);
}

export async function choreAssigneeIdsFor(choreIds: string[]): Promise<Record<string, string[]>> {
  const out = emptyMap(choreIds);
  if (!choreIds.length) return out;
  const rows = await db
    .select({ choreId: choreAssignees.choreId, userId: choreAssignees.userId })
    .from(choreAssignees)
    .where(inArray(choreAssignees.choreId, choreIds));
  for (const r of rows) (out[r.choreId] ||= []).push(r.userId);
  return out;
}

export async function setChoreAssignees(choreId: string, userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  await db.delete(choreAssignees).where(eq(choreAssignees.choreId, choreId));
  if (unique.length) {
    await db.insert(choreAssignees).values(unique.map((userId) => ({ choreId, userId })));
  }
}

/** Adds one person without disturbing anyone already on it (claim). */
export async function addChoreAssignee(choreId: string, userId: string): Promise<void> {
  await db.insert(choreAssignees).values({ choreId, userId }).onConflictDoNothing();
}

/** Removes one person, leaving the rest (release). */
export async function removeChoreAssignee(choreId: string, userId: string): Promise<void> {
  await db
    .delete(choreAssignees)
    .where(and(eq(choreAssignees.choreId, choreId), eq(choreAssignees.userId, userId)));
}

/* ---------------- project tasks ---------------- */

export async function taskAssigneeIds(taskId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId));
  return rows.map((r) => r.userId);
}

export async function taskAssigneeIdsFor(taskIds: string[]): Promise<Record<string, string[]>> {
  const out = emptyMap(taskIds);
  if (!taskIds.length) return out;
  const rows = await db
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(inArray(taskAssignees.taskId, taskIds));
  for (const r of rows) (out[r.taskId] ||= []).push(r.userId);
  return out;
}

export async function setTaskAssignees(taskId: string, userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  if (unique.length) {
    await db.insert(taskAssignees).values(unique.map((userId) => ({ taskId, userId })));
  }
}

export async function addTaskAssignee(taskId: string, userId: string): Promise<void> {
  await db.insert(taskAssignees).values({ taskId, userId }).onConflictDoNothing();
}

export async function removeTaskAssignee(taskId: string, userId: string): Promise<void> {
  await db
    .delete(taskAssignees)
    .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)));
}
