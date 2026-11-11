/**
 * Loans: a sale paid back in set instalments, no interest. Pure, so the
 * schedule and what's owed are unit-tested.
 */
import { addDays, diffDays } from './dates';
import { cents } from './money';

export type LoanEvery = 'week' | 'month';
export type Instalment = { n: number; date: string; amount: number };

/** `first` moved on by `k` months, keeping the day but never spilling into the next month (31 Jan → 28 Feb). */
export function addMonthsClamped(first: string, k: number): string {
  const [y, m, d] = first.split('-').map(Number);
  const total = (m - 1) + k;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export const MAX_INSTALMENTS = 120;

/** Equal instalments from `firstDue`; the last one is whatever is left. */
export function loanSchedule(principal: number, instalment: number, every: LoanEvery, firstDue: string): Instalment[] {
  const out: Instalment[] = [];
  let left = cents(principal);
  const step = cents(Math.min(instalment, principal));
  if (!(step > 0)) return out;
  for (let k = 0; left > 0 && k < MAX_INSTALMENTS; k++) {
    const amount = cents(Math.min(step, left));
    out.push({ n: k + 1, date: every === 'week' ? addDays(firstDue, 7 * k) : addMonthsClamped(firstDue, k), amount });
    left = cents(left - amount);
  }
  return out;
}

export function instalmentCount(principal: number, instalment: number): number {
  return instalment > 0 ? Math.ceil(cents(principal) / cents(Math.min(instalment, principal)) - 1e-9) : 0;
}

export type LoanState = {
  paid: number;
  balance: number;
  /** What should have been paid by today but hasn't. */
  overdue: number;
  /** The oldest instalment not yet covered: due date, and how much of it is left. */
  next: { date: string; amount: number } | null;
  daysLate: number;
  schedule: (Instalment & { state: 'paid' | 'part' | 'late' | 'due' | 'upcoming' })[];
};

/**
 * Where a loan stands. Payments cover instalments oldest first, so paying
 * early simply covers the next ones, and paying extra shortens the loan.
 */
export function loanState(schedule: Instalment[], paidTotal: number, today: string): LoanState {
  const total = cents(schedule.reduce((a, i) => a + i.amount, 0));
  const paid = cents(Math.min(paidTotal, total));
  let covered = paid;
  let overdue = 0;
  let next: LoanState['next'] = null;
  const rows: LoanState['schedule'] = schedule.map((i) => {
    const applied = cents(Math.min(i.amount, covered));
    covered = cents(covered - applied);
    const left = cents(i.amount - applied);
    if (left > 0 && !next) next = { date: i.date, amount: left };
    if (left > 0 && i.date < today) overdue = cents(overdue + left);
    const state = left === 0 ? 'paid' : i.date < today ? 'late' : i.date === today ? 'due' : applied > 0 ? 'part' : 'upcoming';
    return { ...i, state };
  });
  const firstLate = rows.find((r) => r.state === 'late');
  return { paid, balance: cents(total - paid), overdue, next, daysLate: firstLate ? diffDays(today, firstLate.date) : 0, schedule: rows };
}

export const EVERY_LABEL: Record<LoanEvery, string> = { week: 'every week', month: 'every month' };

/** Reminder stage for the borrower's next instalment, or null for none today. */
export function loanReminderStage(next: { date: string } | null, today: string): 'soon' | 'due' | 'late' | null {
  if (!next) return null;
  const d = diffDays(next.date, today);
  if (d === 3) return 'soon';
  if (d === 0) return 'due';
  if (d === -3) return 'late';
  return null;
}
