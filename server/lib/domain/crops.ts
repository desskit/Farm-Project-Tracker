/**
 * A small crop library and the planting calendar built from the farm's frost
 * dates. Windows are the common rules of thumb, in weeks relative to the
 * last spring frost (negative = before it); they are a guide to adjust, not
 * a promise. Pure.
 */
import { addDays } from './dates';

export type Crop = {
  name: string;
  /** Days from sowing (or transplanting, for transplanted crops) to first harvest. */
  dtm: number;
  /** Start indoors this many weeks before the last frost (transplanted crops). */
  indoors?: number;
  /** Sow or transplant outdoors from/to, in weeks relative to the last frost. */
  out: [number, number];
  /** Can be sown again for autumn: the last sowing leaves time to mature before the first frost. */
  fall?: boolean;
};

export const CROPS: Crop[] = [
  { name: 'Arugula', dtm: 40, out: [-4, 4], fall: true },
  { name: 'Basil', dtm: 60, indoors: 6, out: [2, 8] },
  { name: 'Beans (bush)', dtm: 55, out: [1, 10] },
  { name: 'Beans (pole)', dtm: 65, out: [1, 8] },
  { name: 'Beets', dtm: 55, out: [-3, 8], fall: true },
  { name: 'Broccoli', dtm: 65, indoors: 6, out: [-2, 2], fall: true },
  { name: 'Brussels sprouts', dtm: 100, indoors: 6, out: [0, 6] },
  { name: 'Cabbage', dtm: 75, indoors: 6, out: [-3, 2], fall: true },
  { name: 'Carrots', dtm: 70, out: [-3, 10], fall: true },
  { name: 'Cauliflower', dtm: 70, indoors: 6, out: [-2, 2], fall: true },
  { name: 'Chard', dtm: 55, out: [-2, 10], fall: true },
  { name: 'Cilantro', dtm: 50, out: [-2, 6], fall: true },
  { name: 'Corn', dtm: 80, out: [1, 6] },
  { name: 'Cucumbers', dtm: 55, indoors: 3, out: [2, 8] },
  { name: 'Dill', dtm: 50, out: [-1, 8] },
  { name: 'Eggplant', dtm: 75, indoors: 9, out: [2, 5] },
  { name: 'Garlic', dtm: 240, out: [22, 28] },
  { name: 'Kale', dtm: 55, indoors: 5, out: [-4, 4], fall: true },
  { name: 'Leeks', dtm: 110, indoors: 10, out: [-2, 3] },
  { name: 'Lettuce', dtm: 45, indoors: 4, out: [-4, 6], fall: true },
  { name: 'Melons', dtm: 85, indoors: 3, out: [2, 5] },
  { name: 'Onions', dtm: 100, indoors: 10, out: [-4, 0] },
  { name: 'Parsnips', dtm: 110, out: [-3, 3] },
  { name: 'Peas', dtm: 60, out: [-6, -1], fall: true },
  { name: 'Peppers', dtm: 70, indoors: 9, out: [2, 5] },
  { name: 'Potatoes', dtm: 90, out: [-3, 3] },
  { name: 'Pumpkins', dtm: 100, indoors: 3, out: [2, 5] },
  { name: 'Radishes', dtm: 28, out: [-4, 6], fall: true },
  { name: 'Spinach', dtm: 40, out: [-6, 0], fall: true },
  { name: 'Squash (summer)', dtm: 50, indoors: 3, out: [1, 8] },
  { name: 'Squash (winter)', dtm: 95, indoors: 3, out: [2, 5] },
  { name: 'Sunflowers', dtm: 80, out: [0, 8] },
  { name: 'Sweet potatoes', dtm: 100, out: [3, 6] },
  { name: 'Tomatoes', dtm: 70, indoors: 7, out: [1, 5] },
  { name: 'Turnips', dtm: 50, out: [-3, 3], fall: true },
  { name: 'Zucchini', dtm: 50, indoors: 3, out: [1, 8] },
];

export type FrostDates = { lastSpring: string; firstFall: string }; // 'MM-DD'
export type Window = { from: string; to: string };
export type CropCalendar = { crop: Crop; indoors: Window | null; outdoors: Window; fallBy: string | null };

export function findCrop(name: string): Crop | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return CROPS.find((c) => c.name.toLowerCase() === n) ?? CROPS.find((c) => n.startsWith(c.name.toLowerCase().split(' (')[0]) || c.name.toLowerCase().split(' (')[0].startsWith(n)) ?? null;
}

/** One crop's windows for a calendar year. */
export function cropCalendar(crop: Crop, frost: FrostDates, year: number): CropCalendar {
  const last = `${year}-${frost.lastSpring}`;
  const first = `${year}-${frost.firstFall}`;
  const wk = (n: number) => addDays(last, n * 7);
  // Autumn crops need to mature before the first frost, plus two weeks for shortening days.
  const fallBy = crop.fall ? addDays(first, -(crop.dtm + 14)) : null;
  return {
    crop,
    indoors: crop.indoors ? { from: wk(-crop.indoors - 1), to: wk(-crop.indoors + 1) } : null,
    outdoors: { from: wk(crop.out[0]), to: wk(crop.out[1]) },
    fallBy: fallBy && fallBy > wk(crop.out[1]) ? fallBy : null,
  };
}

export function plantingCalendar(frost: FrostDates, year: number): CropCalendar[] {
  return CROPS.map((c) => cropCalendar(c, frost, year));
}

export type SowNow = { crop: Crop; how: 'indoors' | 'outdoors' | 'fall'; until: string };
/** What can be sown today. */
export function sowNow(frost: FrostDates, today: string): SowNow[] {
  const out: SowNow[] = [];
  for (const c of plantingCalendar(frost, Number(today.slice(0, 4)))) {
    if (c.indoors && today >= c.indoors.from && today <= c.indoors.to) out.push({ crop: c.crop, how: 'indoors', until: c.indoors.to });
    else if (today >= c.outdoors.from && today <= c.outdoors.to) out.push({ crop: c.crop, how: 'outdoors', until: c.outdoors.to });
    else if (c.fallBy && today > c.outdoors.to && today <= c.fallBy) out.push({ crop: c.crop, how: 'fall', until: c.fallBy });
  }
  return out;
}

export function isFrostDate(v: unknown): v is string {
  return typeof v === 'string' && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);
}
