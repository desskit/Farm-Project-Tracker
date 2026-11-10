/** Small pure helpers for the year in review and the printable sheets. */
import type { Schedule } from '@/db/schema';
import { nextOccurrenceAfter } from './recurrence';

/** Twelve monthly totals from dated amounts ('YYYY-MM-DD'), for one calendar year. */
export function byMonth(rows: { date: string; amount: number }[], year: number): number[] {
  const out = Array<number>(12).fill(0);
  for (const r of rows) {
    if (Number(r.date.slice(0, 4)) !== year) continue;
    const m = Number(r.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) out[m] += r.amount;
  }
  return out.map((v) => Math.round(v * 100) / 100);
}

/** The dates in [from, to] a chore falls due, walking its schedule on from its next due date. */
export function dueDatesBetween(schedule: Schedule, nextDue: string, from: string, to: string): string[] {
  const out: string[] = [];
  let d = nextDue;
  for (let i = 0; i < 40 && d <= to; i++) {
    if (d >= from) out.push(d);
    const n = nextOccurrenceAfter(schedule, d);
    if (n <= d) break; // one-time chores don't advance
    d = n;
  }
  return out;
}
