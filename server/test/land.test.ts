/** Land: hierarchy rules, successions + seed drawdown, PHI blocks harvest, grazing moves. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import {
  addPlantings, createUnit, landAlerts, listUnits, logHarvest, logLandEvent, moveGroup, setPlantingStatus, unitDetail,
} from '@/lib/data/land';
import { createGroup } from '@/lib/data/livestock';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const stock = async (id: string) => (await db.select().from(schema.inventory).where(eq(schema.inventory.id, id)))[0].qty;

describe('land', () => {
  it('keeps beds in gardens and paddocks in pastures', async () => {
    const mgr = await makeUser('manager');
    const garden = await createUnit(mgr, { kind: 'garden', name: 'Kitchen garden' });
    const pasture = await createUnit(mgr, { kind: 'pasture', name: 'North' });
    await createUnit(mgr, { kind: 'bed', name: 'Bed 1', parentId: garden });
    await expect(createUnit(mgr, { kind: 'bed', name: 'Bed X' })).rejects.toThrow(/goes inside a garden/);
    await expect(createUnit(mgr, { kind: 'paddock', name: 'P', parentId: garden })).rejects.toThrow(/can’t go in a garden/);
    await createUnit(mgr, { kind: 'paddock', name: 'P1', parentId: pasture });
    expect((await unitDetail(garden)).children.map((c) => c.name)).toEqual(['Bed 1']);
  });

  it('sows successions, drawing seed only for what’s in the ground', async () => {
    const mgr = await makeUser('manager');
    await db.insert(schema.inventory).values({ id: 'seed-l', name: 'Lettuce seed', unit: 'g', qty: 10 });
    const garden = await createUnit(mgr, { kind: 'garden', name: 'G2' });
    const bed = await createUnit(mgr, { kind: 'bed', name: 'B', parentId: garden });
    const ids = await addPlantings(mgr, bed, { crop: 'Lettuce', sownOn: T, daysToMaturity: 45, inventoryId: 'seed-l', seedQty: 2, succession: { everyDays: 14, count: 3 } });
    expect(ids).toHaveLength(3);
    expect(await stock('seed-l')).toBe(8);
    const d = await unitDetail(bed);
    expect(d.plantings.filter((p) => p.status === 'planned')).toHaveLength(2);
    expect((await landAlerts(T, 14)).toSow.some((p) => p.unitId === bed)).toBe(true);
    const next = d.plantings.find((p) => p.status === 'planned')!;
    await setPlantingStatus(mgr, next.id, 'growing');
    expect(await stock('seed-l')).toBe(6);
  });

  it('blocks harvest inside a spray’s pre-harvest interval, including sprays on the whole garden', async () => {
    const crew = await makeUser('worker');
    const mgr = await makeUser('manager');
    const garden = await createUnit(mgr, { kind: 'garden', name: 'G3' });
    const bed = await createUnit(mgr, { kind: 'bed', name: 'Tomatoes', parentId: garden });
    const [p] = await addPlantings(crew, bed, { crop: 'Tomato', sownOn: addDays(T, -80), daysToMaturity: 75 });
    expect((await landAlerts()).ready.some((r) => r.id === p)).toBe(true);
    await logLandEvent(crew, garden, { type: 'spray', phiDays: 3, notes: 'copper' });
    await expect(logHarvest(crew, bed, { plantingId: p, amount: 5 })).rejects.toThrow(/Harvest from/);
    await logHarvest(crew, bed, { plantingId: p, amount: 4, date: addDays(T, -1), finished: true });
    const d = await unitDetail(bed);
    expect(d.season).toEqual([{ crop: 'Tomato', amount: 4, unit: 'lb' }]);
    expect(d.plantings[0].status).toBe('harvested');
  });

  it('moves a group and rests the paddock it left', async () => {
    const mgr = await makeUser('manager');
    const pasture = await createUnit(mgr, { kind: 'pasture', name: 'South' });
    const a = await createUnit(mgr, { kind: 'paddock', name: 'A', parentId: pasture, restDays: 20 });
    const b = await createUnit(mgr, { kind: 'paddock', name: 'B', parentId: pasture });
    const herd = await createGroup(mgr, { name: 'Ewes', species: 'sheep', headCount: 10 });
    await moveGroup(mgr, herd, a, { date: addDays(T, -10) });
    await moveGroup(mgr, herd, b, { date: addDays(T, -5) });
    const units = await listUnits();
    expect(units.find((u) => u.id === a)?.grazing).toEqual({ state: 'resting', rested: 5, readyOn: addDays(T, 15) });
    expect(units.find((u) => u.id === b)?.grazing?.state).toBe('occupied');
    const [g] = await db.select().from(schema.animalGroups).where(eq(schema.animalGroups.id, herd));
    expect([g.landUnitId, g.location, g.movedOn]).toEqual([b, 'B', addDays(T, -5)]);
    await expect(moveGroup(mgr, herd, b)).rejects.toThrow(/already on B/);
    await expect(moveGroup(mgr, herd, a, { date: addDays(T, -6) })).rejects.toThrow(/last move/);
  });

  it('enforces who can lay out land', async () => {
    const crew = await makeUser('worker');
    const guest = await makeUser('guest');
    await expect(createUnit(crew, { kind: 'garden', name: 'x' })).rejects.toThrow(/can’t/);
    const mgr = await makeUser('manager');
    const g = await createUnit(mgr, { kind: 'field', name: 'Hay' });
    await expect(logLandEvent(guest, g, { type: 'mow' })).rejects.toThrow(/can’t/);
    await logLandEvent(crew, g, { type: 'mow' });
  });
});
