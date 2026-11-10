/** Rentals: lease coverage, lease reminder stages, inspection comparison. Pure. */
import { diffDays } from './dates';
import type { Condition, InspectionItem, RenewalStage } from '@/db/schema';
export type { RenewalStage };

export const RENTAL_KIND_LABEL = { house: 'House', apartment: 'Apartment', room: 'Room', cabin: 'Cabin', rv: 'RV spot', other: 'Other' } as const;
export const UTILITY_LABEL = { electric: 'Electric', water: 'Water', gas: 'Gas', propane: 'Propane', internet: 'Internet', trash: 'Trash', other: 'Other' } as const;
export const CHARGE_KIND_LABEL = { rent: 'Rent', utility: 'Utility', late_fee: 'Late fee', other: 'Charge' } as const;

export const DEFAULT_AREAS = [
  'Entry', 'Living room', 'Kitchen', 'Appliances', 'Bathroom', 'Bedrooms', 'Floors', 'Walls & paint',
  'Windows & screens', 'Doors & locks', 'Heating / cooling', 'Smoke & CO alarms', 'Exterior', 'Yard',
];

const lastDay = (mk: string) => {
  const [y, m] = mk.split('-').map(Number);
  return `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

/** Whether a lease runs during any part of month `mk` (YYYY-MM). */
export function leaseCoversMonth(l: { startDate: string; endDate: string | null }, mk: string): boolean {
  return l.startDate <= lastDay(mk) && (!l.endDate || l.endDate >= `${mk}-01`);
}

export type LeaseStage = 'renewal' | 'ending' | 'ended';
/** Which lease-end reminder applies: talk renewal inside the notice window, again in the last two weeks, once after. */
export function leaseStage(endDate: string | null, noticeDays: number, today: string): LeaseStage | null {
  if (!endDate) return null;
  const left = diffDays(endDate, today);
  if (left < 0) return 'ended';
  if (left <= 14) return 'ending';
  if (left <= noticeDays) return 'renewal';
  return null;
}

/** A late fee is due once a charge is unpaid past its grace days. */
export function lateFeeDue(dueDate: string, today: string, graceDays: number): boolean {
  return diffDays(today, dueDate) > graceDays;
}

const RANK: Record<Condition, number> = { good: 0, fair: 1, poor: 2, na: -1 };
export type AreaChange = { area: string; before: Condition | null; after: Condition | null; worse: boolean; notes: string };

/** Move-in vs move-out, area by area; `worse` flags what got worse. */
export function compareInspections(before: InspectionItem[], after: InspectionItem[]): AreaChange[] {
  const b = new Map(before.map((i) => [i.area, i]));
  const a = new Map(after.map((i) => [i.area, i]));
  const areas = [...new Set([...before.map((i) => i.area), ...after.map((i) => i.area)])];
  return areas.map((area) => {
    const x = b.get(area)?.condition ?? null;
    const y = a.get(area)?.condition ?? null;
    return {
      area, before: x, after: y,
      worse: x != null && y != null && RANK[x] >= 0 && RANK[y] > RANK[x],
      notes: a.get(area)?.notes ?? '',
    };
  });
}

/** Which renewal reminder a paper with this expiry date is due: a month out, a week out, or after it lapsed. */
export function renewalStage(expiresOn: string | null | undefined, today: string): RenewalStage | null {
  if (!expiresOn) return null;
  const left = diffDays(expiresOn, today);
  if (left < 0) return 'expired';
  if (left <= 7) return 'week';
  if (left <= 30) return 'month';
  return null;
}
