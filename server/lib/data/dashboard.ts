/**
 * Dashboard data-access layer — ported from js/store.js's dashboard()/counts()
 * (store.js:925-992). Merges chores and maintenance into Overdue / Due Today /
 * Coming Up buckets. Project tasks and rent join as those resources land.
 */
import { and, eq, inArray, isNotNull, isNull, lt, max, or, sql } from 'drizzle-orm';
import {
  chores,
  choreAssignees,
  users,
  assets,
  maintenanceItems,
  meterReadings,
  projects,
  projectTasks,
  taskAssignees,
  rentCharges,
  leaseTenants,
} from '@/db/schema';
import { db } from '@/db';
import { bucketForDate, type Bucket } from '@/lib/domain/dashboard';
import { describeSchedule } from '@/lib/domain/recurrence';
import { maintenanceStatus } from '@/lib/domain/maintenance';
import { todayISO, currentMonthKey } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { choreAssigneeIdsFor, taskAssigneeIdsFor } from './assignees';
import { leaseIdsFor } from './rentals';
import { can } from '@/lib/domain/permissions';
import { canSeeWork } from '@/lib/domain/scope';

export type DashboardItem = {
  kind: 'chore' | 'maintenance' | 'task' | 'rent';
  id: string;
  title: string;
  subtitle: string;
  dueDate: string;
  href: string;
  bucket: Exclude<Bucket, 'later'>;
  actionLabel: string;
  gated: boolean; // chores only — open the detail rather than quick-complete
};

export type DashboardBuckets = {
  overdue: DashboardItem[];
  today: DashboardItem[];
  upcoming: DashboardItem[];
};

export async function getDashboard(currentUser: SessionUser, scope: 'mine' | 'all'): Promise<DashboardBuckets> {
  const [allChores, allUsers, allAssets, allItems, allReadings, allProjects, allTasks, monthCharges] = await Promise.all([
    db.select().from(chores),
    db.select({ id: users.id, name: users.name }).from(users),
    db.select().from(assets),
    db.select().from(maintenanceItems),
    db.select({ assetId: meterReadings.assetId, reading: meterReadings.reading }).from(meterReadings),
    db.select({ id: projects.id, name: projects.name }).from(projects),
    db.select().from(projectTasks),
    // Read-only: existing charges for this month (creation happens on the Rent page).
    db.select().from(rentCharges).where(eq(rentCharges.month, currentMonthKey())),
  ]);
  const [choreAssignees, taskAssignees] = await Promise.all([
    choreAssigneeIdsFor(allChores.map((c) => c.id)),
    taskAssigneeIdsFor(allTasks.map((t) => t.id)),
  ]);
  const projectName = new Map(allProjects.map((p) => [p.id, p.name]));
  const nameById = new Map(allUsers.map((u) => [u.id, u.name]));
  const userName = (id: string | null) => (id ? (nameById.get(id) ?? 'Unassigned') : 'Unassigned');
  /** "Sam & Jamie" reads better on a one-line subtitle than a bare list. */
  const assigneeLabel = (ids: string[]) => {
    const names = ids.map((id) => nameById.get(id)).filter(Boolean) as string[];
    if (!names.length) return 'Unassigned';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names[0]} +${names.length - 1}`;
  };
  const assetById = new Map(allAssets.map((a) => [a.id, a]));
  const latestByAsset = new Map<string, number>();
  for (const r of allReadings) {
    const cur = latestByAsset.get(r.assetId);
    if (cur == null || r.reading > cur) latestByAsset.set(r.assetId, r.reading);
  }

  const buckets: DashboardBuckets = { overdue: [], today: [], upcoming: [] };

  for (const c of allChores) {
    if (c.done) continue; // completed one-time chores drop off the board
    const b = bucketForDate(c.nextDue);
    if (b === 'later') continue;
    const choreOn = choreAssignees[c.id] ?? [];
    if (scope === 'mine' && !choreOn.includes(currentUser.id)) continue;
    // A chore that takes turns is only on the list of whoever's turn it is.
    if (scope === 'mine' && c.rotate && c.turnUserId && c.turnUserId !== currentUser.id) continue;
    if (!canSeeWork(currentUser, { ...c, assigneeIds: choreOn })) continue;
    buckets[b].push({
      kind: 'chore',
      id: c.id,
      title: c.name,
      subtitle: `${describeSchedule(c.schedule)} · ${assigneeLabel(choreOn)}`,
      dueDate: c.nextDue,
      href: `/chores/${c.id}`,
      bucket: b,
      actionLabel: 'Done',
      gated: c.requirePhoto || c.steps.length > 0,
    });
  }

  // Maintenance is shared work — shown in both "mine" and "all" scopes.
  for (const m of allItems) {
    const asset = assetById.get(m.assetId);
    const st = maintenanceStatus(m, { latestReading: latestByAsset.get(m.assetId) ?? null, meterUnit: asset?.meterUnit ?? null });
    if (st.bucket === 'later') continue;
    buckets[st.bucket as Exclude<Bucket, 'later'>].push({
      kind: 'maintenance',
      id: m.id,
      title: m.name,
      subtitle: `${asset?.name ?? ''} · ${st.detail}`,
      dueDate: st.mode === 'date' ? st.dueDate : todayISO(),
      href: `/maintenance/${m.assetId}`,
      bucket: st.bucket as Exclude<Bucket, 'later'>,
      actionLabel: 'Log',
      gated: false,
    });
  }

  for (const t of allTasks) {
    if (t.done || !t.dueDate) continue;
    const b = bucketForDate(t.dueDate);
    if (b === 'later') continue;
    const taskOn = taskAssignees[t.id] ?? [];
    if (scope === 'mine' && !taskOn.includes(currentUser.id)) continue;
    if (!canSeeWork(currentUser, { ...t, assigneeIds: taskOn })) continue;
    buckets[b].push({
      kind: 'task',
      id: t.id,
      title: t.title,
      subtitle: `${projectName.get(t.projectId) ?? 'Project'} · ${assigneeLabel(taskOn)}`,
      dueDate: t.dueDate,
      href: `/projects/${t.projectId}`,
      bucket: b,
      actionLabel: 'Open',
      gated: false,
    });
  }

  // Someone else's rent is private: only managers and admins may see it, in
  // either scope. Everyone else only ever sees their own charge.
  const seesAllRent = can(currentUser, 'finance.view');
  // "Mine" includes charges on any lease they're on, not only the ones billed to them.
  const myLeases = await leaseIdsFor(currentUser.id);
  const isMine = (c: { userId: string; leaseId: string | null }) => c.userId === currentUser.id || (!!c.leaseId && myLeases.includes(c.leaseId));
  for (const c of monthCharges) {
    if (c.status === 'verified') continue;
    if (!isMine(c) && !seesAllRent) continue;
    // "mine" shows the renter's own still-unpaid charge; "all" shows every
    // non-verified charge the viewer is allowed to see.
    if (scope === 'mine' && (!isMine(c) || c.status === 'marked')) continue;
    const b = bucketForDate(c.dueDate);
    if (b === 'later') continue;
    buckets[b].push({
      kind: 'rent',
      id: c.id,
      title: `${c.kind === 'rent' ? 'Rent' : c.label || 'Charge'} · $${c.amount}`,
      subtitle: `${userName(c.userId)} · ${c.status === 'marked' ? 'awaiting verification' : 'unpaid'}`,
      dueDate: c.dueDate,
      href: '/more/rent',
      bucket: b,
      actionLabel: c.status === 'marked' ? 'Review' : 'Pay',
      gated: false,
    });
  }

  (['overdue', 'today', 'upcoming'] as const).forEach((k) => {
    buckets[k].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  });

  return buckets;
}

/**
 * The nav badge: how many of *my* items are overdue — exactly what the
 * dashboard's "Mine" Overdue section lists, so the number and the list agree.
 *
 * This runs on every page render, so it counts in SQL against indexed
 * columns instead of building the whole dashboard (which reads every chore,
 * task and meter reading the farm has ever recorded).
 */
export async function myOverdueCount(currentUser: SessionUser): Promise<number> {
  const today = todayISO();
  const [[choreRow], [taskRow], items, latest, assetUnits, [rentRow]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(chores)
      .innerJoin(choreAssignees, and(eq(choreAssignees.choreId, chores.id), eq(choreAssignees.userId, currentUser.id)))
      .where(and(eq(chores.done, false), lt(chores.nextDue, today), or(eq(chores.rotate, false), isNull(chores.turnUserId), eq(chores.turnUserId, currentUser.id)))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(projectTasks)
      .innerJoin(taskAssignees, and(eq(taskAssignees.taskId, projectTasks.id), eq(taskAssignees.userId, currentUser.id)))
      .where(and(eq(projectTasks.done, false), isNotNull(projectTasks.dueDate), lt(projectTasks.dueDate, today))),
    // Upkeep is shared work and counts for everyone. The item list is small;
    // only the latest reading per asset is needed, not the whole history.
    db.select().from(maintenanceItems),
    db
      .select({ assetId: meterReadings.assetId, reading: max(meterReadings.reading) })
      .from(meterReadings)
      .groupBy(meterReadings.assetId),
    db.select({ id: assets.id, meterUnit: assets.meterUnit }).from(assets),
    db
      .select({ n: sql<number>`count(*)` })
      .from(rentCharges)
      .where(
        and(
          or(
            eq(rentCharges.userId, currentUser.id),
            inArray(rentCharges.leaseId, db.select({ id: leaseTenants.leaseId }).from(leaseTenants).where(eq(leaseTenants.userId, currentUser.id))),
          ),
          eq(rentCharges.month, currentMonthKey()),
          eq(rentCharges.status, 'unpaid'),
          lt(rentCharges.dueDate, today),
        ),
      ),
  ]);
  const latestByAsset = new Map(latest.map((r) => [r.assetId, r.reading]));
  const unitByAsset = new Map(assetUnits.map((a) => [a.id, a.meterUnit]));
  const upkeep = items.filter(
    (m) =>
      maintenanceStatus(m, {
        latestReading: latestByAsset.get(m.assetId) ?? null,
        meterUnit: unitByAsset.get(m.assetId) ?? null,
      }).bucket === 'overdue',
  ).length;
  return Number(choreRow.n) + Number(taskRow.n) + upkeep + Number(rentRow.n);
}
