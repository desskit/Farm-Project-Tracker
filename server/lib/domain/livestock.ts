/**
 * Livestock constants and pure date math — client-safe and unit-tested.
 * Gestation / incubation lengths are typical averages; actual dates vary by a
 * week or two, which is why due dates are shown as "around".
 */
import { addDays } from './dates';

export const SPECIES = {
  chicken: { label: 'Chickens', single: 'Chicken', gestationDays: 21, group: 'flock', products: ['eggs'] },
  duck: { label: 'Ducks', single: 'Duck', gestationDays: 28, group: 'flock', products: ['eggs'] },
  turkey: { label: 'Turkeys', single: 'Turkey', gestationDays: 28, group: 'flock', products: ['eggs'] },
  goose: { label: 'Geese', single: 'Goose', gestationDays: 30, group: 'flock', products: ['eggs'] },
  goat: { label: 'Goats', single: 'Goat', gestationDays: 150, group: 'herd', products: ['milk'] },
  sheep: { label: 'Sheep', single: 'Sheep', gestationDays: 147, group: 'flock', products: ['milk', 'wool'] },
  cattle: { label: 'Cattle', single: 'Cow', gestationDays: 283, group: 'herd', products: ['milk'] },
  pig: { label: 'Pigs', single: 'Pig', gestationDays: 114, group: 'pen', products: [] },
  horse: { label: 'Horses', single: 'Horse', gestationDays: 340, group: 'herd', products: [] },
  donkey: { label: 'Donkeys', single: 'Donkey', gestationDays: 365, group: 'herd', products: [] },
  alpaca: { label: 'Alpacas', single: 'Alpaca', gestationDays: 335, group: 'herd', products: ['wool'] },
  llama: { label: 'Llamas', single: 'Llama', gestationDays: 350, group: 'herd', products: ['wool'] },
  rabbit: { label: 'Rabbits', single: 'Rabbit', gestationDays: 31, group: 'pen', products: [] },
  other: { label: 'Other animals', single: 'Animal', gestationDays: null, group: 'herd', products: [] },
} as const satisfies Record<string, { label: string; single: string; gestationDays: number | null; group: string; products: readonly string[] }>;

export type Species = keyof typeof SPECIES;
export const SPECIES_LIST = Object.keys(SPECIES) as Species[];
export function isSpecies(v: unknown): v is Species {
  return typeof v === 'string' && v in SPECIES;
}

export type ProductKind = 'eggs' | 'milk' | 'wool';
export const PRODUCT_UNIT: Record<ProductKind, string> = { eggs: 'eggs', milk: 'lb', wool: 'lb' };

export const EVENT_TYPES = ['treatment', 'vaccination', 'weight', 'birth', 'death', 'sale', 'purchase', 'slaughter', 'note'] as const;
export type AnimalEventType = (typeof EVENT_TYPES)[number];
export const EVENT_LABEL: Record<AnimalEventType, string> = {
  treatment: 'Treatment', vaccination: 'Vaccination', weight: 'Weight', birth: 'Birth',
  death: 'Death', sale: 'Sale', purchase: 'Bought', slaughter: 'Processed', note: 'Note',
};
/** How each event moves the head count (per animal in `count`). */
export const COUNT_SIGN: Record<AnimalEventType, -1 | 0 | 1> = {
  treatment: 0, vaccination: 0, weight: 0, note: 0, birth: 1, purchase: 1, death: -1, sale: -1, slaughter: -1,
};

/** Around when a breeding should give birth / hatch, or null if unknown for the species. */
export function expectedDue(species: Species, bredOn: string): string | null {
  const d = SPECIES[species].gestationDays;
  return d == null ? null : addDays(bredOn, d);
}

/** Last day before products are safe to use again after a treatment ("until" is exclusive of this date's end). */
export function withdrawalUntil(treatedOn: string, days: number | null | undefined): string | null {
  if (!days || days <= 0) return null;
  return addDays(treatedOn, days);
}

/** Simple trend: this week's total vs last week's, as a percentage change (null if no baseline). */
export function weekTrend(daily: { date: string; amount: number }[], today: string): { thisWeek: number; lastWeek: number; pct: number | null } {
  const start = addDays(today, -6);
  const prevStart = addDays(today, -13);
  let thisWeek = 0;
  let lastWeek = 0;
  for (const d of daily) {
    if (d.date >= start && d.date <= today) thisWeek += d.amount;
    else if (d.date >= prevStart && d.date < start) lastWeek += d.amount;
  }
  return { thisWeek, lastWeek, pct: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null };
}

/**
 * Starting points for routine health care, per species: common intervals, not
 * veterinary advice. Each becomes an ordinary repeating chore linked to the
 * group, so the interval and wording can be changed afterwards.
 */
export type HealthTemplate = { name: string; everyDays: number };
const SMALL_RUMINANT: HealthTemplate[] = [
  { name: 'Hoof trim', everyDays: 56 },
  { name: 'Worm check (eyelids / body condition)', everyDays: 30 },
  { name: 'CDT booster', everyDays: 365 },
];
const EQUINE: HealthTemplate[] = [
  { name: 'Farrier / hoof trim', everyDays: 42 },
  { name: 'Deworm (or fecal count)', everyDays: 90 },
  { name: 'Annual vaccinations', everyDays: 365 },
  { name: 'Teeth check', everyDays: 365 },
];
const POULTRY: HealthTemplate[] = [
  { name: 'Check for mites and lice', everyDays: 30 },
  { name: 'Deep-clean the coop', everyDays: 90 },
];
const CAMELID: HealthTemplate[] = [
  { name: 'Toenail trim', everyDays: 90 },
  { name: 'Shearing', everyDays: 365 },
  { name: 'CDT booster', everyDays: 365 },
];
export const HEALTH_TEMPLATES: Record<Species, HealthTemplate[]> = {
  chicken: POULTRY, duck: POULTRY, turkey: POULTRY, goose: POULTRY,
  goat: SMALL_RUMINANT,
  sheep: [...SMALL_RUMINANT, { name: 'Shearing', everyDays: 365 }],
  cattle: [{ name: 'Annual vaccinations', everyDays: 365 }, { name: 'Deworm', everyDays: 180 }, { name: 'Hoof and body check', everyDays: 180 }],
  pig: [{ name: 'Deworm', everyDays: 180 }, { name: 'Hoof and tusk check', everyDays: 180 }],
  horse: EQUINE, donkey: EQUINE,
  alpaca: CAMELID, llama: CAMELID,
  rabbit: [{ name: 'Nail trim', everyDays: 42 }, { name: 'Teeth and weight check', everyDays: 90 }],
  other: [],
};

/** Species whose young come from an incubator. */
export const HATCHING: Species[] = ['chicken', 'duck', 'turkey', 'goose'];

export type HatchStep = { key: 'candle' | 'lockdown' | 'hatch'; label: string; date: string };
/**
 * The dates that matter for a clutch set on `setOn`: candle at a week, stop
 * turning and raise humidity three days before the due date, then hatch.
 */
export function hatchSchedule(species: Species, setOn: string): HatchStep[] {
  const days = SPECIES[species].gestationDays ?? 21;
  return [
    { key: 'candle', label: 'Candle the eggs', date: addDays(setOn, 7) },
    { key: 'lockdown', label: 'Lockdown: stop turning, raise humidity', date: addDays(setOn, days - 3) },
    { key: 'hatch', label: 'Hatch day', date: addDays(setOn, days) },
  ];
}

/** The next step still ahead (or today), if any. */
export function nextHatchStep(species: Species, setOn: string, today: string): HatchStep | null {
  return hatchSchedule(species, setOn).find((s) => s.date >= today) ?? null;
}
