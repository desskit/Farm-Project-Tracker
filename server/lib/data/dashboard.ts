/**
 * Dashboard data-access layer — ported from js/store.js's dashboard()/counts()
 * (store.js:925-992). Merges chores and maintenance into Overdue / Due Today /
 * Coming Up buckets. Project tasks and rent join as those resources land.
 */
import { eq } from 'drizzle-orm';
import { chores, users, assets, maintenanceItems, meterReadings, projects, projectTasks, rentCharges } from '@/db/schema';
import { db } from '@/db';
import { bucketForDate, type Bucket } from '@/lib/domain/dashboard';
import { describeSchedule } from '@/lib/domain/recurrence';
import { maintenanceStatus } from '@/lib/domain/maintenance';
import { todayISO, currentMonthKey } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { choreAssigneeIdsFor, taskAssigneeIdsFor } from './assignees';

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

  for (const c of monthCharges) {
    if (c.status === 'verified') continue;
    // "mine" shows the renter's own still-unpaid charge; "all" shows every
    // non-verified charge (matches the prototype's dashboard filter).
    if (scope === 'mine' && (c.userId !== currentUser.id || c.status === 'marked')) continue;
    const b = bucketForDate(c.dueDate);
    if (b === 'later') continue;
    buckets[b].push({
      kind: 'rent',
      id: c.id,
      title: `Rent · $${c.amount}`,
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

export async function getCounts(currentUser: SessionUser): Promise<{ overdue: number; today: number; upcoming: number }> {
  const b = await getDashboard(currentUser, 'all');
  return { overdue: b.overdue.length, today: b.today.length, upcoming: b.upcoming.length };
}
