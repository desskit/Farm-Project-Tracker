/**
 * The year in review, and the rows behind the printable record books. Each
 * section is only filled in for people who may see that part of the farm.
 */
import 'server-only';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/db';
import { animalEvents, animalGroups, animals, choreCompletions, harvests, inventory, landEvents, landUnits, productionLogs, timeEntries, users } from '@/db/schema';
import { can } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { PRODUCT_UNIT, type ProductKind } from '@/lib/domain/livestock';
import { byMonth } from '@/lib/domain/review';
import { DataError } from './errors';
import { profitReport } from './profit';
import { spendReport } from './spend';

export type YearReview = {
  year: number;
  production: { kind: ProductKind; unit: string; months: number[]; total: number }[] | null;
  herd: { births: number; losses: number; sold: number; processed: number } | null;
  harvest: { crop: string; unit: string; amount: number }[] | null;
  chores: { months: number[]; total: number };
  hours: { name: string; hours: number }[];
  money: { income: number; costs: number; net: number; spendMonths: number[] } | null;
};

export async function yearReview(user: SessionUser, year: number): Promise<YearReview> {
  if (!can(user, 'farm.view')) throw new DataError('Not found.', 404);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const seesAnimals = can(user, 'animals.view');
  const seesLand = can(user, 'land.view');
  const seesTeam = can(user, 'team.view');

  const [prod, events, crops, done, time, people] = await Promise.all([
    seesAnimals ? db.select({ kind: productionLogs.kind, date: productionLogs.date, amount: productionLogs.amount }).from(productionLogs).where(and(gte(productionLogs.date, from), lte(productionLogs.date, to))) : Promise.resolve([]),
    seesAnimals ? db.select({ type: animalEvents.type, delta: animalEvents.countDelta }).from(animalEvents).where(and(gte(animalEvents.date, from), lte(animalEvents.date, to), inArray(animalEvents.type, ['birth', 'death', 'sale', 'slaughter']))) : Promise.resolve([]),
    seesLand ? db.select({ crop: harvests.crop, unit: harvests.unit, amount: harvests.amount }).from(harvests).where(and(gte(harvests.date, from), lte(harvests.date, to))) : Promise.resolve([]),
    db.select({ date: choreCompletions.date, by: choreCompletions.completedBy }).from(choreCompletions).where(and(gte(choreCompletions.date, from), lte(choreCompletions.date, to))),
    db.select({ userId: timeEntries.userId, seconds: timeEntries.seconds }).from(timeEntries).where(and(gte(timeEntries.start, new Date(year, 0, 1).getTime()), lte(timeEntries.start, new Date(year + 1, 0, 1).getTime() - 1))),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);

  const kinds = [...new Set(prod.map((p) => p.kind))] as ProductKind[];
  const production = seesAnimals
    ? kinds.map((kind) => {
      const months = byMonth(prod.filter((p) => p.kind === kind), year);
      return { kind, unit: PRODUCT_UNIT[kind], months, total: Math.round(months.reduce((a, b) => a + b, 0) * 10) / 10 };
    })
    : null;

  const head = (type: string) => events.filter((e) => e.type === type).reduce((n, e) => n + Math.abs(e.delta), 0);
  const herd = seesAnimals ? { births: head('birth'), losses: head('death'), sold: head('sale'), processed: head('slaughter') } : null;

  const cropTotals = new Map<string, { crop: string; unit: string; amount: number }>();
  for (const h of crops) {
    const key = `${h.crop.trim().toLowerCase()}|${h.unit}`;
    const cur = cropTotals.get(key) ?? { crop: h.crop.trim(), unit: h.unit, amount: 0 };
    cur.amount += h.amount;
    cropTotals.set(key, cur);
  }
  const harvest = seesLand ? [...cropTotals.values()].map((c) => ({ ...c, amount: Math.round(c.amount * 10) / 10 })).sort((a, b) => b.amount - a.amount) : null;

  // Everyone sees the farm's chore count; hours are the team's for managers, your own otherwise.
  const mineOnly = !seesTeam;
  const choreRows = done.map((d) => ({ date: d.date, amount: 1 }));
  const name = new Map(people.map((p) => [p.id, p.name]));
  const secs = new Map<string, number>();
  for (const t of time) if (!mineOnly || t.userId === user.id) secs.set(t.userId, (secs.get(t.userId) ?? 0) + t.seconds);
  const hours = [...secs.entries()].map(([id, s]) => ({ name: name.get(id) ?? 'Someone', hours: Math.round(s / 360) / 10 })).filter((h) => h.hours > 0).sort((a, b) => b.hours - a.hours);

  let money: YearReview['money'] = null;
  if (can(user, 'finance.view')) {
    const [p, sp] = await Promise.all([profitReport(from, to), spendReport(from, to)]);
    const months = Array<number>(12).fill(0);
    for (const m of sp.byMonth) if (m.month.startsWith(String(year))) months[Number(m.month.slice(5, 7)) - 1] = Math.round(m.total);
    money = { income: p.income, costs: p.costs, net: p.net, spendMonths: months };
  }

  const choreMonths = byMonth(choreRows, year);
  return { year, production, herd, harvest, chores: { months: choreMonths, total: done.length }, hours, money };
}

/* ---------------- record books ---------------- */

export type MedicineRow = { date: string; group: string; animal: string; product: string; qty: string; meatUntil: string | null; milkUntil: string | null; by: string; notes: string };

/** Every treatment in the year, oldest first: the farm's medicine book. */
export async function medicineBook(user: SessionUser, year: number): Promise<MedicineRow[]> {
  if (!can(user, 'animals.view')) throw new DataError('Not found.', 404);
  const rows = await db
    .select({ e: animalEvents, group: animalGroups.name, name: animals.name, tag: animals.tag, product: inventory.name, unit: inventory.unit, by: users.name })
    .from(animalEvents)
    .innerJoin(animalGroups, eq(animalGroups.id, animalEvents.groupId))
    .leftJoin(animals, eq(animals.id, animalEvents.animalId))
    .leftJoin(inventory, eq(inventory.id, animalEvents.inventoryId))
    .leftJoin(users, eq(users.id, animalEvents.userId))
    .where(and(eq(animalEvents.type, 'treatment'), gte(animalEvents.date, `${year}-01-01`), lte(animalEvents.date, `${year}-12-31`)));
  return rows
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.e.createdAt - b.e.createdAt)
    .map((r) => ({
      date: r.e.date, group: r.group, animal: r.name || (r.tag ? `#${r.tag}` : 'Whole group'), product: r.product ?? '',
      qty: r.e.qtyUsed != null ? `${r.e.qtyUsed} ${r.unit ?? ''}`.trim() : '', meatUntil: r.e.meatUntil, milkUntil: r.e.milkUntil, by: r.by ?? '', notes: r.e.notes,
    }));
}

export type SprayRow = { date: string; unit: string; product: string; qty: string; harvestFrom: string | null; by: string; notes: string };

/** Every spray in the year, oldest first, with the first day harvest is allowed again. */
export async function sprayRecord(user: SessionUser, year: number): Promise<SprayRow[]> {
  if (!can(user, 'land.view')) throw new DataError('Not found.', 404);
  const rows = await db
    .select({ e: landEvents, unit: landUnits.name, product: inventory.name, punit: inventory.unit, by: users.name })
    .from(landEvents)
    .innerJoin(landUnits, eq(landUnits.id, landEvents.unitId))
    .leftJoin(inventory, eq(inventory.id, landEvents.inventoryId))
    .leftJoin(users, eq(users.id, landEvents.userId))
    .where(and(eq(landEvents.type, 'spray'), gte(landEvents.date, `${year}-01-01`), lte(landEvents.date, `${year}-12-31`)));
  return rows
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.e.createdAt - b.e.createdAt)
    .map((r) => ({ date: r.e.date, unit: r.unit, product: r.product ?? '', qty: r.e.qtyUsed != null ? `${r.e.qtyUsed} ${r.punit ?? ''}`.trim() : '', harvestFrom: r.e.phiUntil, by: r.by ?? '', notes: r.e.notes }));
}
