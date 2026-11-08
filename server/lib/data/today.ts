/**
 * Extra pieces for the Today screen beyond "my" due work: what's up for grabs
 * for this person, and the manager's at-a-glance farm cards. Every number is
 * gated by the capability that lets someone act on it.
 */
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { projectTasks, projects, rentCharges } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { canSeeWork } from '@/lib/domain/scope';
import { bucketForDate } from '@/lib/domain/dashboard';
import { describeSchedule } from '@/lib/domain/recurrence';
import { currentMonthKey } from '@/lib/domain/dates';
import { listChores } from './chores';
import { taskAssigneeIdsFor } from './assignees';
import { getDashboard } from './dashboard';
import { lowStockItems } from './inventory';
import { openRequestCount } from './requests';

export type GrabItem = { kind: 'chore' | 'task'; id: string; title: string; subtitle: string; href: string; dueDate: string | null };

/** Open work this person could pick up (not already on it), soonest first. */
export async function upForGrabs(viewer: SessionUser): Promise<GrabItem[]> {
  if (!can(viewer, 'work.claim')) return [];
  const chores = (await listChores(viewer))
    .filter((c) => c.open && !c.assigneeIds.includes(viewer.id) && bucketForDate(c.nextDue) !== 'later')
    .map<GrabItem>((c) => ({ kind: 'chore', id: c.id, title: c.name, subtitle: describeSchedule(c.schedule), href: `/chores/${c.id}`, dueDate: c.nextDue }));

  const tasks = await db.select().from(projectTasks).where(and(eq(projectTasks.open, true), eq(projectTasks.done, false)));
  const on = await taskAssigneeIdsFor(tasks.map((t) => t.id));
  const names = new Map((await db.select({ id: projects.id, name: projects.name }).from(projects)).map((p) => [p.id, p.name]));
  const openTasks = tasks
    .filter((t) => !(on[t.id] ?? []).includes(viewer.id) && canSeeWork(viewer, { ...t, assigneeIds: on[t.id] ?? [] }))
    .map<GrabItem>((t) => ({ kind: 'task', id: t.id, title: t.title, subtitle: names.get(t.projectId) ?? 'Project', href: `/projects/${t.projectId}`, dueDate: t.dueDate }));

  return [...chores, ...openTasks].sort((a, b) => (a.dueDate ?? '9999') .localeCompare(b.dueDate ?? '9999')).slice(0, 8);
}

export type FarmCards = {
  needsAttention?: number;
  upkeepDue?: number;
  lowStock?: number;
  rentToVerify?: number;
  openRequests?: number;
  team?: boolean;
};

/** The "Farm today" cards; each only appears for people who can act on it. */
export async function farmCards(viewer: SessionUser): Promise<FarmCards | null> {
  if (!can(viewer, 'work.viewAll')) return null;
  const all = await getDashboard(viewer, 'all');
  const cards: FarmCards = {
    needsAttention: all.overdue.filter((i) => i.kind !== 'rent').length,
    upkeepDue: [...all.overdue, ...all.today].filter((i) => i.kind === 'maintenance').length,
  };
  if (can(viewer, 'supplies.use')) cards.lowStock = (await lowStockItems()).length;
  if (can(viewer, 'finance.manage')) {
    const charges = await db.select({ status: rentCharges.status }).from(rentCharges).where(eq(rentCharges.month, currentMonthKey()));
    cards.rentToVerify = charges.filter((c) => c.status === 'marked').length;
  }
  if (can(viewer, 'requests.manage')) cards.openRequests = await openRequestCount();
  if (can(viewer, 'team.view')) cards.team = true;
  return cards;
}
