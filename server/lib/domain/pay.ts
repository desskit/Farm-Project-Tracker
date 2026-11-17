/**
 * Crew pay: two-week pay periods, how much of someone's pay goes toward
 * their rent, and which rent charges a work credit pays. Pure.
 */
import { addDays, diffDays } from './dates';
import { cents } from './money';

export type RentRule = 'none' | 'all' | 'fixed';
export type Period = { start: string; end: string };

export const PERIOD_DAYS = 14;
/** Used until a manager picks the farm's own start: a Monday. */
export const DEFAULT_PAY_ANCHOR = '2026-01-05';

/** The two-week period that contains `date`, counted from `anchor` (either direction). */
export function payPeriodFor(anchor: string, date: string): Period {
  const k = Math.floor(diffDays(date, anchor) / PERIOD_DAYS);
  const start = addDays(anchor, k * PERIOD_DAYS);
  return { start, end: addDays(start, PERIOD_DAYS - 1) };
}

/** The `count` periods ending with the one that contains `today`, newest first. */
export function recentPeriods(anchor: string, today: string, count: number): Period[] {
  const out: Period[] = [];
  let p = payPeriodFor(anchor, today);
  for (let i = 0; i < count; i++) {
    out.push(p);
    p = payPeriodFor(anchor, addDays(p.start, -1));
  }
  return out;
}

/** How much of `gross` goes toward rent (never more than is owed) and how much is paid out. */
export function splitPay(gross: number, rule: RentRule, fixed: number | null, rentOwed: number): { toRent: number; paidOut: number } {
  const owed = Math.max(0, cents(rentOwed));
  const g = Math.max(0, cents(gross));
  const toRent = rule === 'all' ? Math.min(g, owed) : rule === 'fixed' ? Math.min(Math.max(0, cents(fixed ?? 0)), g, owed) : 0;
  return { toRent: cents(toRent), paidOut: cents(g - toRent) };
}

/** What's left to pay on a charge after its credits. */
export function chargeBalance(amount: number, credits: number): number {
  return Math.max(0, cents(amount - credits));
}

export type OpenCharge = { id: string; balance: number; dueDate: string; kind: string };

/** Spreads `amount` over open charges: oldest first, rent before other charges due the same day. */
export function allocateCredit(amount: number, charges: OpenCharge[]): { chargeId: string; amount: number; settles: boolean }[] {
  let left = cents(amount);
  const out: { chargeId: string; amount: number; settles: boolean }[] = [];
  const ordered = [...charges]
    .filter((c) => c.balance > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || Number(b.kind === 'rent') - Number(a.kind === 'rent'));
  for (const c of ordered) {
    if (left <= 0) break;
    const take = cents(Math.min(left, c.balance));
    out.push({ chargeId: c.id, amount: take, settles: take >= c.balance });
    left = cents(left - take);
  }
  return out;
}

/** Hours from seconds, to the quarter hour. */
export function hoursFrom(seconds: number): number {
  return Math.round((seconds / 3600) * 4) / 4;
}
