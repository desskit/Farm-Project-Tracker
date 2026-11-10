/** Supply maths that screens and jobs share. Pure. */
import { diffDays } from './dates';

/**
 * Roughly how many days a supply will last at the rate it's been used lately.
 * `uses` are draws (positive amounts) with their dates. The rate is averaged
 * from the first draw in the window to today (at least a week, so one big day
 * doesn't look like a daily habit). Null when there's nothing to go on.
 */
export function runwayDays(qty: number, uses: { date: string; amount: number }[], today: string, window = 28): number | null {
  const recent = uses.filter((u) => u.amount > 0 && diffDays(today, u.date) >= 0 && diffDays(today, u.date) < window);
  if (!recent.length) return null;
  const total = recent.reduce((n, u) => n + u.amount, 0);
  const span = Math.max(7, Math.min(window, diffDays(today, recent.map((u) => u.date).sort()[0]) + 1));
  const perDay = total / span;
  if (!(perDay > 0)) return null;
  return Math.max(0, Math.floor(qty / perDay));
}

export function runwayLabel(days: number | null): string | null {
  if (days == null) return null;
  if (days === 0) return 'out at this rate';
  if (days > 120) return null; // plenty; not worth saying
  return `about ${days} day${days === 1 ? '' : 's'} left`;
}
