/**
 * Date-only helpers, ported from js/store.js:10-46.
 *
 * All "date" values are local calendar-date strings ("YYYY-MM-DD"). On the
 * server this is interpreted in the process timezone (set TZ in the container
 * to the farm's timezone so "today" and rollovers line up with the crew's day).
 */

export function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return iso(new Date());
}

export function parseISO(s: string): Date {
  const p = s.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function addMonths(s: string, n: number): string {
  const d = parseISO(s);
  d.setMonth(d.getMonth() + n);
  return iso(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);
}

export function weekday(s: string): number {
  return parseISO(s).getDay();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

export function shiftMonthKey(mk: string, delta: number): string {
  const p = mk.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthLabel(mk: string): string {
  const p = mk.split('-').map(Number);
  return new Date(p[0], p[1] - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function fmtDate(s: string): string {
  return parseISO(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function relativeLabel(s: string): string {
  const n = diffDays(s, todayISO());
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}
