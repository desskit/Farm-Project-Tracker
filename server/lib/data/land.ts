/**
 * Land: gardens and their beds, pastures and their paddocks, orchards and
 * fields. Plantings (with successions and seed drawdown), perennials,
 * harvests, field work (with spray pre-harvest intervals) and grazing moves.
 *
 * Rules:
 *  - Beds live in gardens, paddocks in pastures; everything else is top level.
 *  - No harvest from ground still inside a spray's pre-harvest interval
 *    (the spray on the bed itself or on its garden).
 *  - A grazing move and the group's new location are written together.
 *  - Reading needs land.view; logging land.log; laying out ground land.manage.
 */
import { and, desc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '@/db';
import {
  animalGroups, grazingMoves, harvests, inventory, landEvents, landUnits, perennials, plantings, users,
  type PlantingStatus,
} from '@/db/schema';
import { uid } from '@/lib/ids';
import { addDays, fmtDate, todayISO } from '@/lib/domain/dates';
import { can, type Cap } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { LAND_EVENT_LABEL, LAND_KINDS, expectedHarvest, isLandKind, phiUntil, successionDates, type LandEventType, type LandKind } from '@/lib/domain/garden';
import { paddockStatus, type PaddockState } from '@/lib/domain/grazing';
import { publishChange } from '@/lib/realtime/bus';
import { logActivity } from './activity';
import { checkSupplies, consumeSupplies } from './consumption';
import { DataError } from './errors';

export type UnitRow = typeof landUnits.$inferSelect;
export type PlantingRow = typeof plantings.$inferSelect;

function need(user: SessionUser, cap: Cap, what: string) {
  if (!can(user, cap)) throw new DataError(`You can’t ${what}.`, 403);
}
async function runBatch(ops: BatchItem<'sqlite'>[]) {
  if (ops.length) await db.batch(ops as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}
async function unitOr404(id: string): Promise<UnitRow> {
  const [u] = await db.select().from(landUnits).where(eq(landUnits.id, id)).limit(1);
  if (!u) throw new DataError('No such place.', 404);
  return u;
}
const href = (id: string) => `/farm/land/${id}`;

/* ---------------- reading ---------------- */

export type UnitSummary = UnitRow & {
  growing: number;
  ready: number;
  perennials: number;
  phiUntil: string | null;
  grazing: { state: PaddockState; rested: number | null; readyOn: string | null } | null;
  groupsHere: { id: string; name: string; headCount: number; movedOn: string | null }[];
};

/** Every place with what's going on there, for lists and pickers. */
export async function listUnits(opts: { includeInactive?: boolean } = {}): Promise<UnitSummary[]> {
  const today = todayISO();
  const units = (await db.select().from(landUnits)).filter((u) => opts.includeInactive || u.active);
  if (!units.length) return [];
  const [pl, per, sprays, groups, lastLeft] = await Promise.all([
    db.select({ unitId: plantings.unitId, status: plantings.status, ready: plantings.expectedHarvest }).from(plantings).where(eq(plantings.status, 'growing')),
    db.select({ unitId: perennials.unitId, n: sql<number>`sum(${perennials.count})` }).from(perennials).where(eq(perennials.active, true)).groupBy(perennials.unitId),
    db.select({ unitId: landEvents.unitId, until: sql<string>`max(${landEvents.phiUntil})` }).from(landEvents).where(sql`${landEvents.phiUntil} > ${today}`).groupBy(landEvents.unitId),
    db.select({ id: animalGroups.id, name: animalGroups.name, headCount: animalGroups.headCount, landUnitId: animalGroups.landUnitId, movedOn: animalGroups.movedOn }).from(animalGroups).where(eq(animalGroups.active, true)),
    db.select({ unitId: grazingMoves.fromUnitId, last: sql<string>`max(${grazingMoves.movedOn})` }).from(grazingMoves).groupBy(grazingMoves.fromUnitId),
  ]);
  const perBy = new Map(per.map((p) => [p.unitId, Number(p.n)]));
  const sprayBy = new Map(sprays.map((p) => [p.unitId, p.until]));
  const leftBy = new Map(lastLeft.map((p) => [p.unitId, p.last]));
  return units.map((u) => {
    const mine = pl.filter((p) => p.unitId === u.id);
    const here = groups.filter((g) => g.landUnitId === u.id);
    const parentSpray = u.parentId ? sprayBy.get(u.parentId) : undefined;
    const ownSpray = sprayBy.get(u.id);
    const grazes = u.kind === 'paddock' || u.kind === 'pasture' || u.kind === 'field';
    return {
      ...u,
      growing: mine.length,
      ready: mine.filter((p) => p.ready && p.ready <= today).length,
      perennials: perBy.get(u.id) ?? 0,
      phiUntil: [ownSpray, parentSpray].filter((d): d is string => !!d).sort().pop() ?? null,
      grazing: grazes ? paddockStatus({ occupied: here.length > 0, lastLeftOn: leftBy.get(u.id) ?? null, restDays: u.restDays }, today) : null,
      groupsHere: here.map(({ id, name, headCount, movedOn }) => ({ id, name, headCount, movedOn })),
    };
  });
}

export async function unitDetail(id: string) {
  const unit = await unitOr404(id);
  const all = await listUnits({ includeInactive: true });
  const me = all.find((u) => u.id === id)!;
  const yearStart = `${todayISO().slice(0, 4)}-01-01`;
  const [pl, per, hv, ev, moves] = await Promise.all([
    db.select({ p: plantings, supply: inventory.name }).from(plantings).leftJoin(inventory, eq(inventory.id, plantings.inventoryId))
      .where(eq(plantings.unitId, id)).orderBy(desc(plantings.sownOn)).limit(80),
    db.select().from(perennials).where(eq(perennials.unitId, id)),
    db.select({ h: harvests, userName: users.name }).from(harvests).leftJoin(users, eq(users.id, harvests.userId))
      .where(eq(harvests.unitId, id)).orderBy(desc(harvests.date)).limit(60),
    db.select({ e: landEvents, userName: users.name, supply: inventory.name, supplyUnit: inventory.unit }).from(landEvents)
      .leftJoin(users, eq(users.id, landEvents.userId)).leftJoin(inventory, eq(inventory.id, landEvents.inventoryId))
      .where(eq(landEvents.unitId, id)).orderBy(desc(landEvents.date), desc(landEvents.createdAt)).limit(60),
    db.select({ m: grazingMoves, groupName: animalGroups.name }).from(grazingMoves).leftJoin(animalGroups, eq(animalGroups.id, grazingMoves.groupId))
      .where(or(eq(grazingMoves.toUnitId, id), eq(grazingMoves.fromUnitId, id))).orderBy(desc(grazingMoves.movedOn)).limit(30),
  ]);
  // This year's harvest by crop, for the season's tally.
  const tally = new Map<string, { amount: number; unit: string }>();
  for (const { h } of hv) {
    if (h.date < yearStart) continue;
    const k = `${h.crop}|${h.unit}`;
    tally.set(k, { amount: (tally.get(k)?.amount ?? 0) + h.amount, unit: h.unit });
  }
  return {
    unit: me,
    parent: unit.parentId ? all.find((u) => u.id === unit.parentId) ?? null : null,
    children: all.filter((u) => u.parentId === id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    plantings: pl.map((r) => ({ ...r.p, supplyName: r.supply })),
    perennials: per.sort((a, b) => Number(b.active) - Number(a.active) || a.crop.localeCompare(b.crop)),
    harvests: hv.map((r) => ({ ...r.h, userName: r.userName })),
    events: ev.map((r) => ({ ...r.e, userName: r.userName, supplyName: r.supply, supplyUnit: r.supplyUnit })),
    moves: moves.map((r) => ({ ...r.m, groupName: r.groupName ?? 'A group', direction: r.m.toUnitId === id ? ('in' as const) : ('out' as const) })),
    season: [...tally.entries()].map(([k, v]) => ({ crop: k.split('|')[0], ...v })).sort((a, b) => b.amount - a.amount),
  };
}

/** What Today, the digest and the calendar show about the land. */
export async function landAlerts(from = todayISO(), days = 7) {
  const until = addDays(from, days);
  const [ready, toSow, sprays, units] = await Promise.all([
    db.select({ id: plantings.id, unitId: plantings.unitId, crop: plantings.crop, variety: plantings.variety, ready: plantings.expectedHarvest }).from(plantings)
      .where(and(eq(plantings.status, 'growing'), lte(plantings.expectedHarvest, until))),
    db.select({ id: plantings.id, unitId: plantings.unitId, crop: plantings.crop, sownOn: plantings.sownOn }).from(plantings)
      .where(and(eq(plantings.status, 'planned'), lte(plantings.sownOn, until))),
    db.select({ id: landEvents.id, unitId: landEvents.unitId, until: landEvents.phiUntil, supply: inventory.name, notes: landEvents.notes }).from(landEvents)
      .leftJoin(inventory, eq(inventory.id, landEvents.inventoryId)).where(sql`${landEvents.phiUntil} > ${from}`),
    db.select({ id: landUnits.id, name: landUnits.name }).from(landUnits),
  ]);
  const name = new Map(units.map((u) => [u.id, u.name]));
  return {
    ready: ready.map((r) => ({ ...r, ready: r.ready!, unitName: name.get(r.unitId) ?? '' })).sort((a, b) => a.ready.localeCompare(b.ready)),
    toSow: toSow.map((r) => ({ ...r, unitName: name.get(r.unitId) ?? '' })).sort((a, b) => a.sownOn.localeCompare(b.sownOn)),
    sprays: sprays.map((r) => ({ id: r.id, unitId: r.unitId, unitName: name.get(r.unitId) ?? '', until: r.until!, what: r.supply || r.notes || 'Spray' })),
  };
}

/* ---------------- places ---------------- */

export type UnitInput = { kind: LandKind; name: string; parentId?: string | null; area?: number | null; areaUnit?: 'sqft' | 'acre'; restDays?: number; notes?: string };

export async function createUnit(user: SessionUser, d: UnitInput): Promise<string> {
  need(user, 'land.manage', 'lay out land');
  if (!isLandKind(d.kind)) throw new DataError('Pick what kind of place it is.', 400);
  let parentId: string | null = null;
  if (!LAND_KINDS[d.kind].top) {
    if (!d.parentId) throw new DataError(`A ${LAND_KINDS[d.kind].label.toLowerCase()} goes inside a ${d.kind === 'bed' ? 'garden' : 'pasture'}.`, 400);
    const parent = await unitOr404(d.parentId);
    if (LAND_KINDS[parent.kind].child !== d.kind) throw new DataError(`A ${d.kind} can’t go in a ${parent.kind}.`, 400);
    parentId = parent.id;
  }
  const id = uid('lu');
  await db.insert(landUnits).values({
    id, kind: d.kind, name: d.name.trim(), parentId, area: d.area ?? null, areaUnit: d.areaUnit ?? (d.kind === 'bed' || d.kind === 'garden' ? 'sqft' : 'acre'),
    restDays: d.restDays ?? 30, notes: d.notes ?? '',
  });
  publishChange('land');
  return id;
}

export async function updateUnit(user: SessionUser, id: string, d: Partial<Omit<UnitInput, 'kind' | 'parentId'>> & { active?: boolean }): Promise<void> {
  need(user, 'land.manage', 'change land');
  await unitOr404(id);
  const patch: Partial<typeof landUnits.$inferInsert> = {};
  if (d.name?.trim()) patch.name = d.name.trim();
  if (d.area !== undefined) patch.area = d.area;
  if (d.areaUnit) patch.areaUnit = d.areaUnit;
  if (d.restDays !== undefined) patch.restDays = d.restDays;
  if (d.notes !== undefined) patch.notes = d.notes;
  if (d.active !== undefined) patch.active = d.active;
  if (Object.keys(patch).length) await db.update(landUnits).set(patch).where(eq(landUnits.id, id));
  publishChange('land');
}

/* ---------------- plantings ---------------- */

export type PlantingInput = {
  crop: string; variety?: string; method?: 'seed' | 'transplant'; sownOn: string; daysToMaturity?: number | null;
  inventoryId?: string | null; seedQty?: number | null; succession?: { everyDays: number; count: number } | null; notes?: string;
};

/** Sow (or plan) a crop; a succession makes several, the later ones planned. Seed comes off Supplies when sown. */
export async function addPlantings(user: SessionUser, unitId: string, d: PlantingInput): Promise<string[]> {
  need(user, 'land.log', 'log plantings');
  const unit = await unitOr404(unitId);
  const today = todayISO();
  const dates = d.succession ? successionDates(d.sownOn, d.succession.everyDays, d.succession.count) : [d.sownOn];
  const sownNow = dates.filter((x) => x <= today).length;
  const seedEach = d.inventoryId && d.seedQty && d.seedQty > 0 ? d.seedQty : 0;
  if (seedEach && sownNow) await checkSupplies([{ inventoryId: d.inventoryId!, qty: seedEach * sownNow }]);
  const series = dates.length > 1 ? uid('ser') : null;
  const ids = dates.map(() => uid('pt'));
  await runBatch(dates.map((date, i) => db.insert(plantings).values({
    id: ids[i], unitId, crop: d.crop.trim(), variety: d.variety?.trim() ?? '', method: d.method ?? 'seed', sownOn: date,
    daysToMaturity: d.daysToMaturity ?? null, expectedHarvest: expectedHarvest(date, d.daysToMaturity),
    status: date <= today ? 'growing' : 'planned', inventoryId: d.inventoryId || null, seedQty: seedEach || null,
    series, notes: d.notes ?? '', userId: user.id,
  })));
  if (seedEach && sownNow) await consumeSupplies(user, [{ inventoryId: d.inventoryId!, qty: seedEach * sownNow }], `Sowed ${d.crop.trim()} in ${unit.name}`, { type: 'land_unit', id: unitId });
  await logActivity(user.id, `${sownNow ? 'planted' : 'planned'} ${d.crop.trim()} in ${unit.name}${dates.length > 1 ? ` (${dates.length} sowings)` : ''}`, { href: href(unitId), audience: 'land.view' });
  publishChange('land');
  return ids;
}

/** Sown (planned → growing, drawing seed), finished, or failed. */
export async function setPlantingStatus(user: SessionUser, id: string, status: PlantingStatus): Promise<void> {
  need(user, 'land.log', 'update plantings');
  const [p] = await db.select().from(plantings).where(eq(plantings.id, id)).limit(1);
  if (!p) throw new DataError('No such planting.', 404);
  if (p.status === status) return;
  const patch: Partial<typeof plantings.$inferInsert> = { status };
  const sowing = p.status === 'planned' && status === 'growing';
  if (sowing) {
    const today = todayISO();
    patch.sownOn = today < p.sownOn ? today : p.sownOn;
    patch.expectedHarvest = expectedHarvest(patch.sownOn, p.daysToMaturity);
    if (p.inventoryId && p.seedQty) await checkSupplies([{ inventoryId: p.inventoryId, qty: p.seedQty }]);
  }
  await db.update(plantings).set(patch).where(eq(plantings.id, id));
  if (sowing && p.inventoryId && p.seedQty) await consumeSupplies(user, [{ inventoryId: p.inventoryId, qty: p.seedQty }], `Sowed ${p.crop}`, { type: 'land_unit', id: p.unitId });
  publishChange('land');
}

export async function deletePlanting(user: SessionUser, id: string): Promise<void> {
  need(user, 'land.manage', 'remove plantings');
  await db.delete(plantings).where(eq(plantings.id, id));
  publishChange('land');
}

/* ---------------- perennials ---------------- */

export async function addPerennial(user: SessionUser, unitId: string, d: { crop: string; variety?: string; count?: number; plantedOn?: string | null; notes?: string }): Promise<string> {
  need(user, 'land.manage', 'add trees and perennials');
  const unit = await unitOr404(unitId);
  const id = uid('pr');
  await db.insert(perennials).values({ id, unitId, crop: d.crop.trim(), variety: d.variety?.trim() ?? '', count: Math.max(1, Math.floor(d.count ?? 1)), plantedOn: d.plantedOn || null, notes: d.notes ?? '' });
  await logActivity(user.id, `added ${d.count ?? 1} ${d.crop.trim()} to ${unit.name}`, { href: href(unitId), audience: 'land.view' });
  publishChange('land');
  return id;
}

export async function updatePerennial(user: SessionUser, id: string, d: { count?: number; variety?: string; notes?: string; active?: boolean }): Promise<void> {
  need(user, 'land.manage', 'change perennials');
  const patch: Partial<typeof perennials.$inferInsert> = {};
  if (d.count !== undefined) patch.count = Math.max(0, Math.floor(d.count));
  if (d.variety !== undefined) patch.variety = d.variety.trim();
  if (d.notes !== undefined) patch.notes = d.notes;
  if (d.active !== undefined) patch.active = d.active;
  if (Object.keys(patch).length) await db.update(perennials).set(patch).where(eq(perennials.id, id));
  publishChange('land');
}

/* ---------------- harvests & field work ---------------- */

/** Latest pre-harvest interval end that still covers `date`, on this ground or its parent. */
async function phiBlocking(unit: UnitRow, date: string): Promise<{ until: string; what: string } | null> {
  const ids = [unit.id, unit.parentId].filter((x): x is string => !!x);
  const rows = await db.select({ until: landEvents.phiUntil, date: landEvents.date, supply: inventory.name }).from(landEvents)
    .leftJoin(inventory, eq(inventory.id, landEvents.inventoryId))
    .where(and(inArray(landEvents.unitId, ids), sql`${landEvents.phiUntil} > ${date}`, lte(landEvents.date, date)));
  const r = rows.sort((a, b) => (a.until! < b.until! ? 1 : -1))[0];
  return r ? { until: r.until!, what: r.supply || 'a spray' } : null;
}

export type HarvestInput = { plantingId?: string | null; perennialId?: string | null; crop?: string; amount: number; unit?: string; date?: string; notes?: string; finished?: boolean };

export async function logHarvest(user: SessionUser, unitId: string, d: HarvestInput): Promise<string> {
  need(user, 'land.log', 'log harvests');
  const unit = await unitOr404(unitId);
  const date = d.date || todayISO();
  if (date > todayISO()) throw new DataError('That date hasn’t happened yet.', 400);
  if (!(d.amount > 0)) throw new DataError('Enter how much.', 400);
  const blocked = await phiBlocking(unit, date);
  if (blocked) throw new DataError(`Not yet — ${blocked.what} was sprayed here. Harvest from ${fmtDate(blocked.until)}.`, 409);
  let crop = d.crop?.trim() ?? '';
  let planting: PlantingRow | undefined;
  if (d.plantingId) {
    [planting] = await db.select().from(plantings).where(and(eq(plantings.id, d.plantingId), eq(plantings.unitId, unitId))).limit(1);
    if (!planting) throw new DataError('That planting isn’t here.', 400);
    crop = planting.crop;
  } else if (d.perennialId) {
    const [p] = await db.select().from(perennials).where(and(eq(perennials.id, d.perennialId), eq(perennials.unitId, unitId))).limit(1);
    if (!p) throw new DataError('That isn’t here.', 400);
    crop = p.crop;
  }
  if (!crop) throw new DataError('What was harvested?', 400);
  const id = uid('hv');
  const ops: BatchItem<'sqlite'>[] = [
    db.insert(harvests).values({ id, unitId, plantingId: planting?.id ?? null, perennialId: d.perennialId || null, crop, date, amount: d.amount, unit: d.unit?.trim() || 'lb', notes: d.notes ?? '', userId: user.id }),
  ];
  if (planting && d.finished) ops.push(db.update(plantings).set({ status: 'harvested' }).where(eq(plantings.id, planting.id)));
  await runBatch(ops);
  await logActivity(user.id, `harvested ${d.amount} ${d.unit?.trim() || 'lb'} ${crop} from ${unit.name}`, { href: href(unitId), audience: 'land.view' });
  publishChange('land');
  return id;
}

export async function deleteHarvest(user: SessionUser, id: string): Promise<void> {
  need(user, 'land.manage', 'remove harvests');
  await db.delete(harvests).where(eq(harvests.id, id));
  publishChange('land');
}

export type LandEventInput = { type: LandEventType; date?: string; inventoryId?: string | null; qtyUsed?: number | null; phiDays?: number | null; cost?: number | null; notes?: string };

export async function logLandEvent(user: SessionUser, unitId: string, d: LandEventInput): Promise<string> {
  need(user, 'land.log', 'log field work');
  const unit = await unitOr404(unitId);
  const date = d.date || todayISO();
  if (date > todayISO()) throw new DataError('That date hasn’t happened yet.', 400);
  const uses = d.inventoryId && d.qtyUsed && d.qtyUsed > 0 ? [{ inventoryId: d.inventoryId, qty: d.qtyUsed }] : [];
  await checkSupplies(uses);
  if (d.type === 'note' && !d.notes?.trim()) throw new DataError('Write the note.', 400);
  const id = uid('le');
  await db.insert(landEvents).values({
    id, unitId, type: d.type, date, inventoryId: d.inventoryId || null, qtyUsed: uses.length ? d.qtyUsed! : null,
    phiUntil: d.type === 'spray' ? phiUntil(date, d.phiDays) : null, cost: d.cost ?? null, notes: d.notes?.trim() ?? '', userId: user.id,
  });
  if (uses.length) await consumeSupplies(user, uses, `${LAND_EVENT_LABEL[d.type]}: ${unit.name}`, { type: 'land_unit', id: unitId });
  await logActivity(user.id, `logged ${LAND_EVENT_LABEL[d.type].toLowerCase()} — ${unit.name}`, { href: href(unitId), audience: d.cost ? 'finance.view' : 'land.view' });
  publishChange('land');
  return id;
}

export async function deleteLandEvent(user: SessionUser, id: string): Promise<void> {
  need(user, 'land.manage', 'remove field records');
  await db.delete(landEvents).where(eq(landEvents.id, id));
  publishChange('land');
}

/* ---------------- grazing ---------------- */

/** Move a group onto a paddock (or off the tracked land with null). One write: the move and the group's location. */
export async function moveGroup(user: SessionUser, groupId: string, toUnitId: string | null, d: { date?: string; notes?: string } = {}): Promise<string> {
  need(user, 'land.log', 'move animals');
  const [g] = await db.select().from(animalGroups).where(eq(animalGroups.id, groupId)).limit(1);
  if (!g) throw new DataError('No such group.', 404);
  const to = toUnitId ? await unitOr404(toUnitId) : null;
  if (to && (to.kind === 'bed' || to.kind === 'garden')) throw new DataError('Animals go on pasture, paddocks or fields — not the garden.', 400);
  if ((to?.id ?? null) === g.landUnitId) throw new DataError(`${g.name} ${to ? `are already on ${to.name}` : 'aren’t on tracked land'}.`, 400);
  const date = d.date || todayISO();
  if (date > todayISO()) throw new DataError('That date hasn’t happened yet.', 400);
  if (g.movedOn && date < g.movedOn) throw new DataError(`Their last move was ${fmtDate(g.movedOn)}.`, 400);
  const id = uid('gm');
  await runBatch([
    db.insert(grazingMoves).values({ id, groupId, fromUnitId: g.landUnitId, toUnitId: to?.id ?? null, movedOn: date, notes: d.notes ?? '', userId: user.id }),
    db.update(animalGroups).set({ landUnitId: to?.id ?? null, movedOn: date, location: to?.name ?? g.location }).where(eq(animalGroups.id, groupId)),
  ]);
  await logActivity(user.id, `moved ${g.name} to ${to?.name ?? 'off the paddocks'}`, { href: to ? href(to.id) : `/farm/animals/${groupId}`, audience: 'land.view' });
  publishChange('land');
  publishChange('animals');
  return id;
}

/** Places a group can be moved to, for pickers. */
export async function grazeableUnits(): Promise<{ id: string; name: string; kind: LandKind }[]> {
  const rows = await db.select({ id: landUnits.id, name: landUnits.name, kind: landUnits.kind, parentId: landUnits.parentId }).from(landUnits)
    .where(and(eq(landUnits.active, true), inArray(landUnits.kind, ['pasture', 'paddock', 'field', 'other'])));
  return rows.map(({ id, name, kind }) => ({ id, name, kind })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

