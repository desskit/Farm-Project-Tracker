/** Garden & orchard date math — pure, client-safe, unit-tested. */
import { addDays, diffDays } from './dates';

/** Whole days from `from` to `to`. */
const daysBetween = (from: string, to: string) => diffDays(to, from);

export const LAND_KINDS = {
  garden: { label: 'Garden', child: 'bed', top: true },
  bed: { label: 'Bed', child: null, top: false },
  pasture: { label: 'Pasture', child: 'paddock', top: true },
  paddock: { label: 'Paddock', child: null, top: false },
  orchard: { label: 'Orchard', child: null, top: true },
  field: { label: 'Field', child: null, top: true },
  other: { label: 'Other', child: null, top: true },
} as const;
export type LandKind = keyof typeof LAND_KINDS;
export const LAND_KIND_LIST = Object.keys(LAND_KINDS) as LandKind[];
export function isLandKind(v: unknown): v is LandKind {
  return typeof v === 'string' && v in LAND_KINDS;
}

export const LAND_EVENT_TYPES = ['amend', 'spray', 'prune', 'irrigate', 'mow', 'soil_test', 'note'] as const;
export type LandEventType = (typeof LAND_EVENT_TYPES)[number];
export const LAND_EVENT_LABEL: Record<LandEventType, string> = {
  amend: 'Amended', spray: 'Sprayed', prune: 'Pruned', irrigate: 'Watered', mow: 'Mowed', soil_test: 'Soil test', note: 'Note',
};

/** When a planting should be ready, or null without a maturity figure. */
export function expectedHarvest(sownOn: string, daysToMaturity: number | null | undefined): string | null {
  return daysToMaturity && daysToMaturity > 0 ? addDays(sownOn, daysToMaturity) : null;
}

/** Sowing dates for a succession: `count` sowings `everyDays` apart starting on `start`. */
export function successionDates(start: string, everyDays: number, count: number): string[] {
  const n = Math.max(1, Math.min(26, Math.floor(count)));
  const gap = Math.max(1, Math.floor(everyDays));
  return Array.from({ length: n }, (_, i) => addDays(start, i * gap));
}

/** First day harvest is allowed after a spray with a pre-harvest interval. */
export function phiUntil(sprayedOn: string, phiDays: number | null | undefined): string | null {
  return phiDays && phiDays > 0 ? addDays(sprayedOn, phiDays) : null;
}

/** A planting's state for lists: how far along, and whether it's ready. */
export function plantingProgress(sownOn: string, ready: string | null, today: string): { pct: number | null; ready: boolean; daysLeft: number | null } {
  if (!ready) return { pct: null, ready: false, daysLeft: null };
  const total = Math.max(1, daysBetween(sownOn, ready));
  const done = daysBetween(sownOn, today);
  return { pct: Math.max(0, Math.min(100, Math.round((done / total) * 100))), ready: today >= ready, daysLeft: Math.max(0, daysBetween(today, ready)) };
}
