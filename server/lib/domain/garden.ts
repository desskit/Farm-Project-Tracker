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

/* ---------------- crop rotation ---------------- */

export const CROP_FAMILIES: Record<string, { label: string; crops: string[] }> = {
  nightshade: { label: 'nightshades', crops: ['tomato', 'pepper', 'chili', 'chile', 'eggplant', 'aubergine', 'potato', 'tomatillo'] },
  brassica: { label: 'brassicas', crops: ['cabbage', 'broccoli', 'cauliflower', 'kale', 'collard', 'brussels', 'kohlrabi', 'turnip', 'rutabaga', 'radish', 'arugula', 'mustard', 'bok choy', 'pak choi'] },
  legume: { label: 'legumes', crops: ['bean', 'pea', 'lentil', 'chickpea', 'soy', 'clover', 'vetch', 'fava'] },
  allium: { label: 'alliums', crops: ['onion', 'garlic', 'leek', 'shallot', 'scallion', 'chive'] },
  cucurbit: { label: 'cucurbits', crops: ['cucumber', 'squash', 'zucchini', 'courgette', 'pumpkin', 'melon', 'watermelon', 'cantaloupe', 'gourd'] },
  umbellifer: { label: 'the carrot family', crops: ['carrot', 'parsnip', 'celery', 'celeriac', 'parsley', 'dill', 'fennel', 'cilantro', 'coriander'] },
  amaranth: { label: 'the beet family', crops: ['beet', 'chard', 'spinach', 'quinoa'] },
  aster: { label: 'the lettuce family', crops: ['lettuce', 'endive', 'chicory', 'radicchio', 'sunflower', 'artichoke'] },
  grass: { label: 'grasses', crops: ['corn', 'maize', 'wheat', 'oat', 'barley', 'rye', 'sorghum'] },
};

/** The rotation family a crop belongs to, matched loosely on its name ("Cherry tomatoes" → nightshade). */
export function familyOf(crop: string): string | null {
  const c = crop.toLowerCase();
  // Longest names first, so "sweet potato" style overlaps resolve to the more specific word.
  let best: { fam: string; len: number } | null = null;
  for (const [fam, f] of Object.entries(CROP_FAMILIES)) {
    for (const name of f.crops) {
      if (new RegExp(`\\b${name}(e?s)?\\b`).test(c) && (!best || name.length > best.len)) best = { fam, len: name.length };
    }
  }
  if (/sweet potato|yam\b/.test(c)) return null; // not a nightshade, despite the name
  return best?.fam ?? null;
}

/**
 * A warning when the same family grew here too recently, else null. The
 * usual rule of thumb is to wait `years` (three) before repeating a family.
 */
export function rotationWarning(history: { crop: string; sownOn: string }[], crop: string, sowOn: string, years = 3): string | null {
  const fam = familyOf(crop);
  if (!fam) return null;
  const cutoff = `${Number(sowOn.slice(0, 4)) - years}${sowOn.slice(4)}`;
  const last = history
    .filter((h) => h.sownOn < sowOn && h.sownOn > cutoff && familyOf(h.crop) === fam)
    .sort((a, b) => (a.sownOn < b.sownOn ? 1 : -1))[0];
  if (!last) return null;
  return `${last.crop} (${CROP_FAMILIES[fam].label}) grew here in ${last.sownOn.slice(0, 4)}. Rotating families for ${years} years helps with pests and disease.`;
}
