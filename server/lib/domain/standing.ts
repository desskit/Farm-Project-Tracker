/** Standing orders: when the next delivery falls. Pure. */
import { addDays, diffDays } from './dates';
import { addMonthsClamped } from './loans';

export type OrderEvery = 'week' | '2weeks' | 'month';
export const EVERY_ORDER_LABEL: Record<OrderEvery, string> = { week: 'Every week', '2weeks': 'Every 2 weeks', month: 'Every month' };

/**
 * The delivery after `current`, counted from the order's first date so a
 * monthly order on the 31st comes back to the 31st after a short month.
 */
export function nextDelivery(start: string, every: OrderEvery, current: string): string {
  if (every === 'week') return addDays(current, 7);
  if (every === '2weeks') return addDays(current, 14);
  const months = (Number(current.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(current.slice(5, 7)) - Number(start.slice(5, 7));
  let n = months + 1;
  let d = addMonthsClamped(start, n);
  while (d <= current) d = addMonthsClamped(start, ++n);
  return d;
}

/** The first delivery on or after `from`. */
export function firstDeliveryFrom(start: string, every: OrderEvery, from: string): string {
  let d = start;
  for (let i = 0; d < from && i < 1000; i++) d = nextDelivery(start, every, d);
  return d;
}

export function daysLate(date: string, today: string): number {
  return Math.max(0, diffDays(today, date));
}
