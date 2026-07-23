/**
 * Team overview — ported from js/store.js userWorkload() + teamDashboard.
 * Farm-wide status counts plus per-person workload. Manager/admin view.
 */
import { db } from '@/db';
import { users, chores, projectTasks } from '@/db/schema';
import { bucketForDate } from '@/lib/domain/dashboard';
import type { Role } from '@/db/schema';

export type Workload = {
  userId: string;
  name: string;
  role: Role;
  choresOverdue: number;
  choresToday: number;
  choresUpcoming: number;
  tasksOpen: number;
  tasksOverdue: number;
};

export type TeamOverview = {
  tiles: { overdue: number; today: number; upcoming: number };
  people: Workload[];
};

export async function teamOverview(): Promise<TeamOverview> {
  const [allUsers, allChores, allTasks] = await Promise.all([
    db.select({ id: users.id, name: users.name, role: users.role }).from(users),
    db.select().from(chores),
    db.select().from(projectTasks),
  ]);

  const tiles = { overdue: 0, today: 0, upcoming: 0 };
  for (const c of allChores) {
    const b = bucketForDate(c.nextDue);
    if (b === 'overdue') tiles.overdue++;
    else if (b === 'today') tiles.today++;
    else if (b === 'upcoming') tiles.upcoming++;
  }

  const people: Workload[] = allUsers.map((u) => {
    const w: Workload = {
      userId: u.id,
      name: u.name,
      role: u.role,
      choresOverdue: 0,
      choresToday: 0,
      choresUpcoming: 0,
      tasksOpen: 0,
      tasksOverdue: 0,
    };
    for (const c of allChores) {
      if (c.assignedTo !== u.id) continue;
      const b = bucketForDate(c.nextDue);
      if (b === 'overdue') w.choresOverdue++;
      else if (b === 'today') w.choresToday++;
      else if (b === 'upcoming') w.choresUpcoming++;
    }
    for (const t of allTasks) {
      if (t.done || t.assignedTo !== u.id) continue;
      w.tasksOpen++;
      if (t.dueDate && bucketForDate(t.dueDate) === 'overdue') w.tasksOverdue++;
    }
    return w;
  });

  return { tiles, people };
}
