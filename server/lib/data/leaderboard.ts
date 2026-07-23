/**
 * Leaderboard — ported from js/store.js leaderboard()/userStreak() (859-921).
 * Points: chore +2, task +5, service +4; photo-verified work adds a bonus.
 * (Photo bonuses activate once photo upload lands — photoId is null for now.)
 */
import { db } from '@/db';
import { users, choreCompletions, projectTasks, maintenanceLogs } from '@/db/schema';
import { todayISO, addDays, currentMonthKey } from '@/lib/domain/dates';
import type { Role } from '@/db/schema';

const PTS = { chore: 2, task: 5, service: 4, chorePhoto: 1, taskPhoto: 2, servicePhoto: 2 };

export type LeaderRow = {
  userId: string;
  name: string;
  role: Role | '';
  points: number;
  chores: number;
  tasks: number;
  services: number;
  verified: number;
  streak: number;
  total: number;
  rank: number;
};

function inWindow(date: string | null, win: 'month' | 'all'): boolean {
  if (win === 'all') return true;
  return !!date && date.slice(0, 7) === currentMonthKey();
}

export async function leaderboard(win: 'month' | 'all'): Promise<LeaderRow[]> {
  const [allUsers, completions, tasks, logs] = await Promise.all([
    db.select({ id: users.id, name: users.name, role: users.role }).from(users),
    db.select().from(choreCompletions),
    db.select().from(projectTasks),
    db.select().from(maintenanceLogs),
  ]);
  const userIds = new Set(allUsers.map((u) => u.id));

  type Stat = { points: number; chores: number; tasks: number; services: number; verified: number };
  const stats = new Map<string, Stat>();
  const ensure = (id: string): Stat => {
    let s = stats.get(id);
    if (!s) {
      s = { points: 0, chores: 0, tasks: 0, services: 0, verified: 0 };
      stats.set(id, s);
    }
    return s;
  };
  allUsers.forEach((u) => ensure(u.id));

  // Streaks: days a user completed at least one chore, counting back from today.
  const choreDaysByUser = new Map<string, Set<string>>();

  for (const c of completions) {
    if (c.completedBy) {
      let set = choreDaysByUser.get(c.completedBy);
      if (!set) choreDaysByUser.set(c.completedBy, (set = new Set()));
      set.add(c.date);
    }
    if (!c.completedBy || !userIds.has(c.completedBy) || !inWindow(c.date, win)) continue;
    const s = ensure(c.completedBy);
    s.chores++;
    s.points += PTS.chore;
    if (c.photoId) {
      s.points += PTS.chorePhoto;
      s.verified++;
    }
  }
  for (const t of tasks) {
    if (!t.done || !t.doneBy || !userIds.has(t.doneBy) || !inWindow(t.doneAt, win)) continue;
    const s = ensure(t.doneBy);
    s.tasks++;
    s.points += PTS.task;
    if (t.donePhotoId) {
      s.points += PTS.taskPhoto;
      s.verified++;
    }
  }
  for (const l of logs) {
    if (!l.userId || !userIds.has(l.userId) || !inWindow(l.date, win)) continue;
    const s = ensure(l.userId);
    s.services++;
    s.points += PTS.service;
    if (l.photoId) {
      s.points += PTS.servicePhoto;
      s.verified++;
    }
  }

  function streakFor(id: string): number {
    const days = choreDaysByUser.get(id) ?? new Set<string>();
    let d = todayISO();
    if (!days.has(d)) d = addDays(d, -1);
    let streak = 0;
    while (days.has(d)) {
      streak++;
      d = addDays(d, -1);
    }
    return streak;
  }

  const rows: LeaderRow[] = allUsers.map((u) => {
    const s = stats.get(u.id)!;
    return {
      userId: u.id,
      name: u.name,
      role: u.role,
      points: s.points,
      chores: s.chores,
      tasks: s.tasks,
      services: s.services,
      verified: s.verified,
      streak: streakFor(u.id),
      total: s.chores + s.tasks + s.services,
      rank: 0,
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.total !== a.total) return b.total - a.total;
    return a.name < b.name ? -1 : 1;
  });
  let rank = 0;
  let prev: number | null = null;
  rows.forEach((s, i) => {
    if (s.points !== prev) {
      rank = i + 1;
      prev = s.points;
    }
    s.rank = rank;
  });
  return rows;
}
