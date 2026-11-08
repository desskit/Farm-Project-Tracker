/**
 * Global search across the farm — ported from the prototype's search(). Matches
 * a query against chores, assets, maintenance items, projects, tasks, inventory,
 * and people, returning typed results with a deep link for each. The dataset is
 * small (one farm), so it filters in memory rather than with SQL LIKE.
 */
import 'server-only';
import { db } from '@/db';
import { chores, assets, maintenanceItems, projects, projectTasks, inventory, users } from '@/db/schema';
import { describeSchedule } from '@/lib/domain/recurrence';
import { STATUS_LABELS } from '@/lib/domain/project-status';
import type { SessionUser } from '@/lib/auth/session';
import { can, ROLE_LABEL } from '@/lib/domain/permissions';
import { canSeeWork } from '@/lib/domain/scope';
import { choreAssigneeIdsFor, taskAssigneeIdsFor } from './assignees';

export type SearchKind = 'chore' | 'asset' | 'maintenance' | 'project' | 'task' | 'inventory' | 'person';
export type SearchResult = { kind: SearchKind; id: string; title: string; sub: string; href: string };

/** Matches `query` against what `viewer` is allowed to see. */
export async function search(viewer: SessionUser, query: string): Promise<SearchResult[]> {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const has = (s: string | null | undefined) => String(s ?? '').toLowerCase().includes(q);

  const [choreRows, assetRows, maintRows, projectRows, taskRows, invRows, userRows] = await Promise.all([
    db.select().from(chores),
    db.select().from(assets),
    db.select().from(maintenanceItems),
    db.select().from(projects),
    db.select().from(projectTasks),
    db.select().from(inventory),
    db.select({ id: users.id, name: users.name, role: users.role }).from(users),
  ]);

  const [choreOn, taskOn] = await Promise.all([
    choreAssigneeIdsFor(choreRows.map((c) => c.id)),
    taskAssigneeIdsFor(taskRows.map((t) => t.id)),
  ]);
  const visibleTasks = taskRows.filter((t) => canSeeWork(viewer, { ...t, assigneeIds: taskOn[t.id] ?? [] }));
  const visibleProjects = new Set(visibleTasks.map((t) => t.projectId));
  const seesAll = can(viewer, 'work.viewAll');
  const assetName = new Map(assetRows.map((a) => [a.id, a.name]));
  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));
  const out: SearchResult[] = [];

  for (const c of choreRows) {
    if (c.done || !has(c.name)) continue;
    if (!canSeeWork(viewer, { ...c, assigneeIds: choreOn[c.id] ?? [] })) continue;
    out.push({ kind: 'chore', id: c.id, title: c.name, sub: `Chore · ${describeSchedule(c.schedule)}`, href: `/chores/${c.id}` });
  }
  for (const a of assetRows) {
    if (!has(a.name) && !has(a.category)) continue;
    out.push({ kind: 'asset', id: a.id, title: a.name, sub: `Asset · ${a.category}`, href: `/maintenance/${a.id}` });
  }
  for (const m of maintRows) {
    if (!has(m.name)) continue;
    out.push({ kind: 'maintenance', id: m.id, title: m.name, sub: `Upkeep · ${assetName.get(m.assetId) ?? ''}`.trim(), href: `/maintenance/${m.assetId}` });
  }
  for (const p of projectRows) {
    if (!has(p.name) && !has(p.description)) continue;
    if (!seesAll && !visibleProjects.has(p.id)) continue;
    out.push({ kind: 'project', id: p.id, title: p.name, sub: `Project · ${STATUS_LABELS[p.status] ?? p.status}`, href: `/projects/${p.id}` });
  }
  for (const t of visibleTasks) {
    if (!has(t.title)) continue;
    out.push({ kind: 'task', id: t.id, title: t.title, sub: `Task · ${projectName.get(t.projectId) ?? 'Project'}`, href: `/projects/${t.projectId}` });
  }
  for (const i of invRows) {
    if (!can(viewer, 'supplies.use')) break;
    if (!has(i.name) && !has(i.category)) continue;
    out.push({ kind: 'inventory', id: i.id, title: i.name, sub: `Supplies · ${i.qty} ${i.unit}`, href: `/more/supplies/${i.id}` });
  }
  for (const u of userRows) {
    if (!can(viewer, 'people.directory')) break;
    if (!has(u.name)) continue;
    out.push({ kind: 'person', id: u.id, title: u.name, sub: `Person · ${ROLE_LABEL[u.role]}`, href: '/people' });
  }

  return out.slice(0, 40);
}
