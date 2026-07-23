import { diffDays, todayISO } from './dates';

export type Bucket = 'overdue' | 'today' | 'upcoming' | 'later';

/** Ported from js/store.js bucketForDate (store.js:356-362). */
export function bucketForDate(dueDate: string): Bucket {
  const n = diffDays(dueDate, todayISO());
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= 7) return 'upcoming';
  return 'later';
}
