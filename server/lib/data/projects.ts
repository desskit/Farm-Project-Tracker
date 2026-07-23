/**
 * Projects & tasks data-access layer — ported from js/store.js's project/task
 * functions. Project create/edit/delete is manager+admin only (canCreateProject);
 * anyone can complete/claim tasks. Role checks live here.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { projects, projectTasks } from '@/db/schema';
import type { SentBack } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { STATUS_LABELS, type ProjectStatus } from '@/lib/domain/project-status';
import { logActivity } from './activity';
import { stopTimersFor } from './timers';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';

export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof projectTasks.$inferSelect;
export { STATUS_LABELS };
export type { ProjectStatus };

function isManager(u: SessionUser): boolean {
  return u.role === 'manager' || u.role === 'admin';
}
function canCreateProject(u: SessionUser): boolean {
  return u.role === 'admin' || u.role === 'manager';
}

/* ---------------- projects ---------------- */
export async function listProjects(): Promise<ProjectRow[]> {
  const rows = await db.select().from(projects);
  return rows.sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));
}
export async function getProject(id: string): Promise<ProjectRow | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}

export type ProjectWithProgress = ProjectRow & { total: number; done: number };

/** Projects list with per-project task progress for the board overview. */
export async function listProjectsWithProgress(): Promise<ProjectWithProgress[]> {
  const [projectRows, tasks] = await Promise.all([listProjects(), db.select().from(projectTasks)]);
  return projectRows.map((p) => {
    const mine = tasks.filter((t) => t.projectId === p.id);
    return { ...p, total: mine.length, done: mine.filter((t) => t.done).length };
  });
}

export type ProjectInput = { name: string; description?: string; status?: ProjectStatus; targetDate?: string | null };

export async function addProject(user: SessionUser, data: ProjectInput): Promise<ProjectRow> {
  if (!canCreateProject(user)) throw new DataError('Only farm managers and admins can create projects.', 403);
  const id = uid('p');
  await db.insert(projects).values({
    id,
    name: data.name.trim(),
    description: data.description || '',
    status: data.status || 'idea',
    targetDate: data.targetDate || null,
    createdBy: user.id,
  });
  await logActivity(user.id, `created project "${data.name.trim()}"`);
  return (await getProject(id))!;
}
export async function updateProject(user: SessionUser, id: string, data: Partial<ProjectInput>): Promise<ProjectRow> {
  if (!canCreateProject(user)) throw new DataError('Only managers and admins can edit projects.', 403);
  const p = await getProject(id);
  if (!p) throw new DataError('No such project.', 404);
  const patch: Partial<typeof projects.$inferInsert> = { description: data.description || '', targetDate: data.targetDate || null };
  if (data.name != null && data.name.trim()) patch.name = data.name.trim();
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
export async function projectTasksFor(projectId: string): Promise<TaskRow[]> {
  const rows = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));
  return rows.sort((a, b) => a.sort - b.sort);
}
export async function taskById(id: string): Promise<TaskRow | null> {
  const rows = await db.select().from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
  return rows[0] ?? null;
}

export type TaskInput = { title: string; description?: string; assignedTo?: string | null; dueDate?: string | null; requirePhoto?: boolean; open?: boolean };

export async function addTask(user: SessionUser, projectId: string, data: TaskInput): Promise<TaskRow> {
  if (!canCreateProject(user)) throw new DataError('Only managers and admins can add tasks.', 403);
  const existing = await projectTasksFor(projectId);
  const id = uid('t');
  await db.insert(projectTasks).values({
    id,
    projectId,
    title: data.title.trim(),
    description: data.description || '',
    assignedTo: data.assignedTo || null,
    dueDate: data.dueDate || null,
    sort: existing.length,
    requirePhoto: !!data.requirePhoto,
    open: !!data.open,
  });
  publishChange('task');
  return (await taskById(id))!;
}

export async function updateTask(user: SessionUser, taskId: string, data: Partial<TaskInput>): Promise<TaskRow> {
  if (!isManager(user)) throw new DataError('Only managers and admins can edit tasks.', 403);
  const t = await taskById(taskId);
  if (!t) throw new DataError('No such task.', 404);
  const patch: Partial<typeof projectTasks.$inferInsert> = {
    description: data.description || '',
    assignedTo: data.assignedTo || null,
    dueDate: data.dueDate || null,
    requirePhoto: !!data.requirePhoto,
    open: !!data.open,
  };
  if (data.title != null && data.title.trim()) patch.title = data.title.trim();
  await db.update(projectTasks).set(patch).where(eq(projectTasks.id, taskId));
  publishChange('task');
  return (await taskById(taskId))!;
}

export async function deleteTask(user: SessionUser, taskId: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can delete tasks.', 403);
  await db.delete(projectTasks).where(eq(projectTasks.id, taskId));
  publishChange('task');
}

/** Toggles a task done/undone. Blocks completion of a photo-required task with no photo. */
export async function toggleTask(user: SessionUser, taskId: string, photoId?: string | null): Promise<void> {
  const t = await taskById(taskId);
  if (!t) throw new DataError('No such task.', 404);
  if (!t.done && t.requirePhoto && !photoId) throw new DataError('This task requires a photo to complete.', 400);
  const done = !t.done;
  await db
    .update(projectTasks)
    .set({
      done,
      doneBy: done ? user.id : null,
      doneAt: done ? todayISO() : null,
      donePhotoId: done ? photoId || null : null,
      sentBack: done ? null : t.sentBack,
    })
    .where(eq(projectTasks.id, taskId));
  if (done) {
    await stopTimersFor('task', taskId); // finishing the task stops any running clock
    await logActivity(user.id, `completed task "${t.title}"`);
  } else {
    publishChange('task');
  }
}

export async function claimTask(user: SessionUser, taskId: string): Promise<void> {
  const t = await taskById(taskId);
  if (!t) throw new DataError('No such task.', 404);
  if (!t.open || t.assignedTo || t.done) throw new DataError('This task is not open to claim.', 400);
  await db.update(projectTasks).set({ assignedTo: user.id }).where(eq(projectTasks.id, taskId));
  publishChange('task');
}

export async function releaseTask(user: SessionUser, taskId: string): Promise<void> {
  const t = await taskById(taskId);
  if (!t) throw new DataError('No such task.', 404);
  if (!t.open) throw new DataError('This item is not an open item.', 400);
  if (t.assignedTo !== user.id && !isManager(user)) throw new DataError('Only the current owner or a manager can release it.', 403);
  await db.update(projectTasks).set({ assignedTo: null }).where(eq(projectTasks.id, taskId));
  publishChange('task');
}

export async function sendBackTask(user: SessionUser, taskId: string, reason?: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can send work back.', 403);
  const t = await taskById(taskId);
  if (!t) throw new DataError('No such task.', 404);
  if (!t.done) throw new DataError('That task is not completed.', 400);
  const sentBack: SentBack = { by: user.id, at: Date.now(), reason: reason || '', worker: t.doneBy };
  await db
    .update(projectTasks)
    .set({ done: false, doneBy: null, doneAt: null, donePhotoId: null, sentBack })
    .where(eq(projectTasks.id, taskId));
  publishChange('task');
}
