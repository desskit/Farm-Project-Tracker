/**
 * Time reporting over the work timers (time_entries). Aggregates completed
 * entries within a date window into totals per person and per item, so the
 * hours the crew logs turn into something actionable.
 */
import 'server-only';
import { db } from '@/db';
import { timeEntries, users, chores, projectTasks, maintenanceItems } from '@/db/schema';
import { parseISO } from '@/lib/domain/dates';

export type PersonTotal = { userId: string; name: string; seconds: number };
export type ItemTotal = { kind: string; refId: string; label: string; seconds: number };
export type TimeReport = { totalSeconds: number; byPerson: PersonTotal[]; byItem: ItemTotal[] };

const DAY_MS = 24 * 60 * 60 * 1000;

export async function timeReport(fromISO: string | null, toISO: string): Promise<TimeReport> {
  const fromMs = fromISO ? parseISO(fromISO).getTime() : 0;
  const toMs = parseISO(toISO).getTime() + DAY_MS; // inclusive of the whole end day

  const [entries, userRows, choreRows, taskRows, maintRows] = await Promise.all([
    db.select().from(timeEntries),
    db.select({ id: users.id, name: users.name }).from(users),
    db.select({ id: chores.id, name: chores.name }).from(chores),
    db.select({ id: projectTasks.id, title: projectTasks.title }).from(projectTasks),
    db.select({ id: maintenanceItems.id, name: maintenanceItems.name }).from(maintenanceItems),
  ]);

  const nameById = new Map(userRows.map((u) => [u.id, u.name]));
  const labelFor = (kind: string, refId: string): string => {
    if (kind === 'chore') return choreRows.find((c) => c.id === refId)?.name ?? 'chore';
    if (kind === 'task') return taskRows.find((t) => t.id === refId)?.title ?? 'task';
    return maintRows.find((m) => m.id === refId)?.name ?? 'maintenance';
  };

  const perPerson = new Map<string, number>();
  const perItem = new Map<string, { kind: string; refId: string; seconds: number }>();
  let totalSeconds = 0;

  for (const e of entries) {
    if (e.end == null) continue; // still running
    if (e.start < fromMs || e.start >= toMs) continue;
    const secs = e.seconds || 0;
    totalSeconds += secs;
    perPerson.set(e.userId, (perPerson.get(e.userId) ?? 0) + secs);
    const key = `${e.kind}:${e.refId}`;
    const cur = perItem.get(key) ?? { kind: e.kind, refId: e.refId, seconds: 0 };
    cur.seconds += secs;
    perItem.set(key, cur);
  }

  const byPerson: PersonTotal[] = [...perPerson.entries()]
    .map(([userId, seconds]) => ({ userId, name: nameById.get(userId) ?? 'Unknown', seconds }))
    .sort((a, b) => b.seconds - a.seconds);

  const byItem: ItemTotal[] = [...perItem.values()]
    .map((v) => ({ kind: v.kind, refId: v.refId, label: labelFor(v.kind, v.refId), seconds: v.seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 20);

  return { totalSeconds, byPerson, byItem };
}
