/**
 * Dashboard data-access layer — ported from js/store.js's dashboard()/counts()
 * (store.js:925-992).
 *
 * The prototype's dashboard merges chores, maintenance, project tasks, and
 * rent into one set of Overdue/Due Today/Coming Up buckets. Only chores are
 * ported so far (maintenance/tasks/rent arrive with their own resources in
 * later phases) — DashboardItem['kind'] is typed to grow as they land.
 */
import { chores, users } from '@/db/schema';
import { db } from '@/db';
import { bucketForDate, type Bucket } from '@/lib/domain/dashboard';
import { describeSchedule } from '@/lib/domain/recurrence';
import type { SessionUser } from '@/lib/auth/session';

export type DashboardItem = {
  kind: 'chore';
  id: string;
  title: string;
  subtitle: string;
  dueDate: string;
  bucket: Exclude<Bucket, 'later'>;
  action: string;
  actionLabel: string;
  /** Requires a photo and/or has checklist steps — quick-complete should open
   * the full chore detail instead of completing directly (matches the
   * prototype's complete-chore handler, js/app.js). */
  gated: boolean;
};

export type DashboardBuckets = {
  overdue: DashboardItem[];
  today: DashboardItem[];
  upcoming: DashboardItem[];
};

export async function getDashboard(currentUser: SessionUser, scope: 'mine' | 'all'): Promise<DashboardBuckets> {
  const [allChores, allUsers] = await Promise.all([
    db.select().from(chores),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const nameById = new Map(allUsers.map((u) => [u.id, u.name]));
  const userName = (id: string | null) => (id ? (nameById.get(id) ?? 'Unassigned') : 'Unassigned');

  const buckets: DashboardBuckets = { overdue: [], today: [], upcoming: [] };

  for (const c of allChores) {
    const b = bucketForDate(c.nextDue);
    if (b === 'later') continue;
    if (scope === 'mine' && c.assignedTo !== currentUser.id) continue;
    buckets[b].push({
      kind: 'chore',
      id: c.id,
      title: c.name,
      subtitle: `${describeSchedule(c.schedule)} · ${userName(c.assignedTo)}`,
      dueDate: c.nextDue,
      bucket: b,
      action: 'complete-chore',
      actionLabel: 'Done',
      gated: c.requirePhoto || c.steps.length > 0,
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
