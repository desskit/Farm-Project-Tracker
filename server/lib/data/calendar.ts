/**
 * Calendar feed — ported from js/store.js's calendarItems(). Expands recurring
 * chores across the requested window and gathers dated maintenance, project
 * tasks, and rent charges that fall inside it. Pure read; used by the calendar
 * page to dot days and list a selected day's work.
 */
import 'server-only';
import { db } from '@/db';
import { chores, maintenanceItems, projectTasks, rentCharges, users } from '@/db/schema';
import { nextOccurrenceAfter } from '@/lib/domain/recurrence';

export type CalendarKind = 'chore' | 'maintenance' | 'task' | 'rent';
export type CalendarItem = { date: string; kind: CalendarKind; id: string; title: string; href: string };

export async function calendarItems(fromISO: string, toISO: string): Promise<CalendarItem[]> {
  const within = (d: string) => d >= fromISO && d <= toISO;
  const out: CalendarItem[] = [];

  const [choreRows, maintRows, taskRows, rentRows, userRows] = await Promise.all([
    db.select().from(chores),
    db.select().from(maintenanceItems),
    db.select().from(projectTasks),
    db.select().from(rentCharges),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const nameById = new Map(userRows.map((u) => [u.id, u.name]));

  // Chores recur — walk each schedule from its next-due up to the window end.
  for (const c of choreRows) {
    let d = c.nextDue;
    let guard = 0;
    while (d < fromISO && guard < 800) {
      const nd = nextOccurrenceAfter(c.schedule, d);
      if (nd <= d) break;
      d = nd;
      guard++;
    }
    guard = 0;
    while (d <= toISO && guard < 400) {
      if (within(d)) out.push({ date: d, kind: 'chore', id: c.id, title: c.name, href: `/chores/${c.id}` });
      const n2 = nextOccurrenceAfter(c.schedule, d);
      if (n2 <= d) break;
      d = n2;
      guard++;
    }
  }

  for (const m of maintRows) {
    if (m.intervalType === 'calendar' && m.nextDueDate && within(m.nextDueDate)) {
      out.push({ date: m.nextDueDate, kind: 'maintenance', id: m.id, title: m.name, href: `/maintenance/${m.assetId}` });
    }
  }

  for (const t of taskRows) {
    if (!t.done && t.dueDate && within(t.dueDate)) {
      out.push({ date: t.dueDate, kind: 'task', id: t.id, title: t.title, href: `/projects/${t.projectId}` });
    }
  }

  for (const c of rentRows) {
    if (c.status !== 'verified' && c.dueDate && within(c.dueDate)) {
      out.push({ date: c.dueDate, kind: 'rent', id: c.id, title: `Rent · ${nameById.get(c.userId) ?? 'someone'}`, href: '/more/rent' });
    }
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
