/**
 * Projects & tasks data-access layer — ported from js/store.js's project/task
 * functions. Project create/edit/delete is manager+admin only (canCreateProject);
 * anyone can complete/claim tasks. Role checks live here.
 */
import { eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '@/db';
import { projects, projectTasks, taskAssignees } from '@/db/schema';
import type { SentBack, TaskRepeat } from '@/db/schema';
import { nextRepeat } from '@/lib/domain/recurrence';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { STATUS_LABELS, type ProjectStatus } from '@/lib/domain/project-status';
import { logActivity } from './activity';
import {
  addTaskAssignee,
  removeTaskAssignee,
  setTaskAssignees,
  taskAssigneeIds,
  taskAssigneeIdsFor,
} from './assignees';
import { stopTimersFor } from './timers';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';
import { pushAssigned, pushClaimed, pushSentBack } from '@/lib/notify/events';
import { can } from '@/lib/domain/permissions';
import { canSeeWork, seesAllWork } from '@/lib/domain/scope';
import { assertOwnUpload } from './attachment-access';

export type ProjectRow = typeof projects.$inferSelect;
/** A task plus the people on it (from task_assignees). */
export type TaskRow = typeof projectTasks.$inferSelect & { assigneeIds: string[] };
export { STATUS_LABELS };
export type { ProjectStatus };

function canCreateProject(u: SessionUser): boolean {
  return can(u, 'work.manage');
}

/* ---------------- projects ---------------- */
async function allProjects(): Promise<ProjectRow[]> {
  const rows = await db.select().from(projects);
  return rows.sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));
}

/**
 * Ids of projects `viewer` can open, or 'all'. Without work.viewAll that's
 * the projects holding at least one task they can see (lib/domain/scope).
 */
export async function visibleProjectIds(viewer: SessionUser): Promise<Set<string> | 'all'> {
  if (seesAllWork(viewer)) return 'all';
  const tasks = await db.select().from(projectTasks);
  const assignees = await taskAssigneeIdsFor(tasks.map((t) => t.id));
  return new Set(
    tasks.filter((t) => canSeeWork(viewer, { ...t, assigneeIds: assignees[t.id] ?? [] })).map((t) => t.projectId),
  );
}

export async function listProjects(viewer: SessionUser): Promise<ProjectRow[]> {
  const [rows, ids] = await Promise.all([allProjects(), visibleProjectIds(viewer)]);
  return ids === 'all' ? rows : rows.filter((p) => ids.has(p.id));
}

/** The project if `viewer` may open it, else null (callers answer 404). */
export async function projectForViewer(viewer: SessionUser, id: string): Promise<ProjectRow | null> {
  const p = await getProject(id);
  if (!p) return null;
  const ids = await visibleProjectIds(viewer);
  return ids === 'all' || ids.has(id) ? p : null;
}
export async function getProject(id: string): Promise<ProjectRow | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}

export type ProjectWithProgress = ProjectRow & { total: number; done: number };

/** Projects list with per-project task progress for the board overview. */
export async function listProjectsWithProgress(viewer: SessionUser): Promise<ProjectWithProgress[]> {
  const [projectRows, tasks] = await Promise.all([listProjects(viewer), db.select().from(projectTasks)]);
  return projectRows.map((p) => {
    const mine = tasks.filter((t) => t.projectId === p.id);
    return { ...p, total: mine.length, done: mine.filter((t) => t.done).length };
  });
}

export type ProjectInput = { name: string; description?: string; status?: ProjectStatus; targetDate?: string | null; budget?: number | null };

export async function addProject(user: SessionUser, data: ProjectInput): Promise<ProjectRow> {
  if (!canCreateProject(user)) throw new DataError('Only farm managers and admins can create projects.', 403);
  const id = uid('p');
  await db.insert(projects).values({
    id,
    name: data.name.trim(),
    description: data.description || '',
    status: data.status || 'idea',
    targetDate: data.targetDate || null,
    budget: data.budget ?? null,
    createdBy: user.id,
  });
  await logActivity(user.id, `created project "${data.name.trim()}"`, { href: `/projects/${id}` });
  return (await getProject(id))!;
}
export async function updateProject(user: SessionUser, id: string, data: Partial<ProjectInput>): Promise<ProjectRow> {
  if (!canCreateProject(user)) throw new DataError('Only managers and admins can edit projects.', 403);
  const p = await getProject(id);
  if (!p) throw new DataError('No such project.', 404);
  const patch: Partial<typeof projects.$inferInsert> = { description: data.description || '', targetDate: data.targetDate || null };
  if (data.name != null && data.name.trim()) patch.name = data.name.trim();
  if (data.budget !== undefined) patch.budget = data.budget ?? null;
  if (data.status) patch.status = data.status;
  await db.update(projects).set(patch).where(eq(projects.id, id));
  publishChange('project');
  return (await getProject(id))!;
}
export async function updateProjectStatus(user: SessionUser, id: string, status: ProjectStatus): Promise<void> {
  if (!canCreateProject(user)) throw new DataError('Only managers and admins can change status.', 403);
  await db.update(projects).set({ status }).where(eq(projects.id, id));
  publishChange('project');
}
export async function deleteProject(user: SessionUser, id: string): Promise<void> {
  if (!canCreateProject(user)) throw new DataError('Only managers and admins can delete projects.', 403);
  await db.delete(projects).where(eq(projects.id, id)); // tasks cascade via FK
  publishChange('project');
}

/* ---------------- tasks ---------------- */
/** A project's tasks that `viewer` can see. */
export async function projectTasksFor(projectId: string, viewer: SessionUser): Promise<TaskRow[]> {
  const rows = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));
  const assignees = await taskAssigneeIdsFor(rows.map((r) => r.id));
  return rows
    .map((r) => ({ ...r, assigneeIds: assignees[r.id] ?? [] }))
    .filter((t) => canSeeWork(viewer, t))
    .sort((a, b) => a.sort - b.sort);
}

/** A task `user` can see, or a 404 — so ids of hidden work can't be probed or acted on. */
async function visibleTask(user: SessionUser, taskId: string): Promise<TaskRow> {
  const t = await taskById(taskId);
  if (!t || !canSeeWork(user, t)) throw new DataError('No such task.', 404);
  return t;
}
export async function taskById(id: string): Promise<TaskRow | null> {
  const rows = await db.select().from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
  if (!rows[0]) return null;
  return { ...rows[0], assigneeIds: await taskAssigneeIds(id) };
}

export type TaskInput = { title: string; description?: string; assigneeIds?: string[]; dueDate?: string | null; requirePhoto?: boolean; open?: boolean; repeat?: TaskRepeat };

export async function addTask(user: SessionUser, projectId: string, data: TaskInput): Promise<TaskRow> {
  if (!canCreateProject(user)) throw new DataError('Only managers and admins can add tasks.', 403);
  const existing = await projectTasksFor(projectId, user); // managers see every task
  const id = uid('t');
  await db.insert(projectTasks).values({
    id,
    projectId,
    title: data.title.trim(),
    description: data.description || '',
    dueDate: data.dueDate || null,
    sort: existing.length,
    requirePhoto: !!data.requirePhoto,
    open: !!data.open,
    repeat: data.repeat ?? null,
  });
  await setTaskAssignees(id, data.assigneeIds ?? []);
  await pushAssigned(user.id, data.assigneeIds ?? [], 'task', data.title.trim(), `/projects/${projectId}`);
  publishChange('task');
  return (await taskById(id))!;
}

export async function updateTask(user: SessionUser, taskId: string, data: Partial<TaskInput>): Promise<TaskRow> {
  if (!can(user, 'work.manage')) throw new DataError('Only managers and admins can edit tasks.', 403);
  const t = await taskById(taskId);
  if (!t) throw new DataError('No such task.', 404);
  const patch: Partial<typeof projectTasks.$inferInsert> = {
    description: data.description || '',
    dueDate: data.dueDate || null,
    requirePhoto: !!data.requirePhoto,
    open: !!data.open,
  };
  if (data.repeat !== undefined) patch.repeat = data.repeat;
  if (data.title != null && data.title.trim()) patch.title = data.title.trim();
  await db.update(projectTasks).set(patch).where(eq(projectTasks.id, taskId));
  if (Array.isArray(data.assigneeIds)) {
    // Only ping people who weren't already on it — re-saving a form shouldn't
    // re-notify everyone.
    const added = data.assigneeIds.filter((u) => !t.assigneeIds.includes(u));
    await setTaskAssignees(taskId, data.assigneeIds);
    await pushAssigned(user.id, added, 'task', patch.title ?? t.title, `/projects/${t.projectId}`);
  }
  publishChange('task');
  return (await taskById(taskId))!;
}

export async function deleteTask(user: SessionUser, taskId: string): Promise<void> {
  if (!can(user, 'work.manage')) throw new DataError('Only managers and admins can delete tasks.', 403);
  await db.delete(projectTasks).where(eq(projectTasks.id, taskId));
  publishChange('task');
}

/**
 * Toggles a task done/undone. Blocks completion of a photo-required task with
 * no photo. Finishing a repeating task creates the next one (same people, due
 * the repeat interval after this one's due date, or after today); undoing it
 * takes that next one back if nobody has finished it yet.
 */
export async function toggleTask(user: SessionUser, taskId: string, photoId?: string | null): Promise<void> {
  await assertOwnUpload(user, photoId);
  const t = await visibleTask(user, taskId);
  if (!t.done && t.requirePhoto && !photoId) throw new DataError('This task requires a photo to complete.', 400);
  const done = !t.done;
  const today = todayISO();
  const ops: BatchItem<'sqlite'>[] = [];
  let nextId: string | null = t.repeatedTo;
  if (done && t.repeat && !t.repeatedTo) {
    nextId = uid('t');
    // On schedule from its due date; if that's already past (it was done late), from today.
    let due = nextRepeat(t.dueDate ?? today, t.repeat);
    if (due <= today) due = nextRepeat(today, t.repeat);
    ops.push(
      db.insert(projectTasks).values({
        id: nextId, projectId: t.projectId, title: t.title, description: t.description, dueDate: due,
        sort: t.sort, requirePhoto: t.requirePhoto, open: t.open, repeat: t.repeat,
      }),
      ...t.assigneeIds.map((u) => db.insert(taskAssignees).values({ taskId: nextId!, userId: u }).onConflictDoNothing()),
    );
  }
  if (!done && t.repeatedTo) {
    const [next] = await db.select({ done: projectTasks.done }).from(projectTasks).where(eq(projectTasks.id, t.repeatedTo)).limit(1);
    if (next && !next.done) ops.push(db.delete(projectTasks).where(eq(projectTasks.id, t.repeatedTo)));
    nextId = null;
  }
  ops.unshift(
    db.update(projectTasks).set({
      done,
      doneBy: done ? user.id : null,
      doneAt: done ? today : null,
      donePhotoId: done ? photoId || null : null,
      sentBack: done ? null : t.sentBack,
      repeatedTo: nextId,
    }).where(eq(projectTasks.id, taskId)),
  );
  await db.batch(ops as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  if (done) {
    await stopTimersFor('task', taskId); // finishing the task stops any running clock
    await logActivity(user.id, `completed task "${t.title}"`, { href: `/projects/${t.projectId}` });
  }
  publishChange('task');
}

export async function claimTask(user: SessionUser, taskId: string): Promise<void> {
  const t = await visibleTask(user, taskId);
  if (!can(user, 'work.claim')) throw new DataError('You can’t pick up open work.', 403);
  if (!t.open || t.done) throw new DataError('This task is not open to claim.', 400);
  if (t.assigneeIds.includes(user.id)) throw new DataError('You are already on this task.', 400);
  await addTaskAssignee(taskId, user.id);
  await pushClaimed(user.id, user.name, t.assigneeIds, t.title, `/projects/${t.projectId}`);
  publishChange('task');
}

export async function releaseTask(user: SessionUser, taskId: string): Promise<void> {
  const t = await visibleTask(user, taskId);
  if (!t.open) throw new DataError('This item is not an open item.', 400);
  if (t.assigneeIds.includes(user.id)) {
    // Stepping off yourself — anyone else on the task stays.
    await removeTaskAssignee(taskId, user.id);
  } else if (can(user, 'work.manage')) {
    // A manager clearing an open task takes everyone off it.
    await setTaskAssignees(taskId, []);
  } else {
    throw new DataError('Only someone on the task or a manager can release it.', 403);
  }
  publishChange('task');
}

export async function sendBackTask(user: SessionUser, taskId: string, reason?: string): Promise<void> {
  if (!can(user, 'work.manage')) throw new DataError('Only managers and admins can send work back.', 403);
  const t = await taskById(taskId);
  if (!t) throw new DataError('No such task.', 404);
  if (!t.done) throw new DataError('That task is not completed.', 400);
  const sentBack: SentBack = { by: user.id, at: Date.now(), reason: reason || '', worker: t.doneBy };
  await db
    .update(projectTasks)
    .set({ done: false, doneBy: null, doneAt: null, donePhotoId: null, sentBack })
    .where(eq(projectTasks.id, taskId));
  await pushSentBack(user.id, t.doneBy, t.title, `/projects/${t.projectId}`, reason);
  publishChange('task');
}
