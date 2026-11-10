/** Phase 5: butcher dates, hatch batches, the per-animal record, frost dates. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { addAnimal, addHatch, animalDetail, createGroup, deleteEvent, listHatches, livestockAlerts, logEvent, updateHatch } from '@/lib/data/livestock';
import { getFrostDates, setFrostDates } from '@/lib/data/land';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const head = async (id: string) => (await db.select().from(schema.animalGroups).where(eq(schema.animalGroups.id, id)))[0].headCount;

describe('butcher dates', () => {
  it('refuses processing inside a meat withdrawal, then takes the animal off the count', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    await db.insert(schema.inventory).values({ id: 'inv-d', name: 'Dewormer', unit: 'ml', qty: 50, meatWithdrawalDays: 14 });
    const herd = await createGroup(mgr, { name: 'Wethers', species: 'goat', headCount: 0 });
    const a = await addAnimal(mgr, herd, { name: 'Billy', sex: 'male' });
    const b = await addAnimal(mgr, herd, { name: 'Bob', sex: 'male' });
    await logEvent(mgr, herd, { type: 'treatment', animalId: a, inventoryId: 'inv-d', qtyUsed: 5 });

    await expect(logEvent(crew, herd, { type: 'slaughter', animalId: b })).rejects.toThrow();
    await expect(logEvent(mgr, herd, { type: 'slaughter', animalId: a })).rejects.toThrow(/withdrawal/i);
    expect((await animalDetail(a)).meatClear).toBe(addDays(T, 14));

    // The untreated animal is fine.
    const ev = await logEvent(mgr, herd, { type: 'slaughter', animalId: b, weight: 48, cost: 60 });
    expect(await head(herd)).toBe(1);
    expect((await animalDetail(b)).animal.status).toBe('processed');
    await deleteEvent(mgr, ev);
    expect(await head(herd)).toBe(2);
    expect((await animalDetail(b)).animal.status).toBe('active');
  });
});

describe('animal record', () => {
  it('gathers weights, parents and offspring', async () => {
    const mgr = await makeUser('manager');
    const herd = await createGroup(mgr, { name: 'Does', species: 'goat', headCount: 0 });
    const dam = await addAnimal(mgr, herd, { name: 'Daisy', sex: 'female' });
    const kid = await addAnimal(mgr, herd, { name: 'Pip', sex: 'female', damId: dam, birthDate: addDays(T, -30) });
    await logEvent(mgr, herd, { type: 'weight', animalId: kid, weight: 12, date: addDays(T, -10) });
    await logEvent(mgr, herd, { type: 'weight', animalId: kid, weight: 15 });
    const d = await animalDetail(kid);
    expect(d.weights.map((w) => w.weight)).toEqual([12, 15]);
    expect(d.dam?.label).toBe('Daisy');
    expect((await animalDetail(dam)).offspring.map((o) => o.label)).toEqual(['Pip']);
    await expect(animalDetail('nope')).rejects.toThrow(/No such animal/);
  });
});

describe('hatches', () => {
  it('put their dates on the alerts and add the chicks to the flock', async () => {
    const mgr = await makeUser('manager');
    const flock = await createGroup(mgr, { name: 'Layers', species: 'chicken', headCount: 10 });
    await expect(addHatch(mgr, { species: 'goat', setOn: T, eggsSet: 12 })).rejects.toThrow(/chickens/);
    const h = await addHatch(mgr, { species: 'chicken', setOn: addDays(T, -15), eggsSet: 12, label: 'Incubator 1' });

    // 21 days: lockdown on day 18 (3 days out) and hatch on day 21 (6 days out); candling has passed.
    const alerts = await livestockAlerts(T, 14);
    expect(alerts.hatches.map((x) => x.date)).toEqual([addDays(T, 3), addDays(T, 6)]);

    await updateHatch(mgr, h, { fertile: 10 });
    await expect(updateHatch(mgr, h, { hatched: 8 })).rejects.toThrow(/flock/);
    await updateHatch(mgr, h, { hatched: 8, groupId: flock });
    expect(await head(flock)).toBe(18);
    expect(await listHatches()).toHaveLength(0);
    expect((await listHatches({ all: true }))[0]).toMatchObject({ status: 'hatched', hatched: 8, fertile: 10 });
    await expect(updateHatch(mgr, h, { hatched: 2, groupId: flock })).rejects.toThrow(/already finished/);
    expect((await livestockAlerts(T, 14)).hatches).toHaveLength(0);
  });
});

describe('frost dates', () => {
  it('are set by whoever lays out the land, and must be in order', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    expect(await getFrostDates()).toBeNull();
    await expect(setFrostDates(crew, { lastSpring: '05-10', firstFall: '10-01' })).rejects.toThrow();
    await expect(setFrostDates(mgr, { lastSpring: '10-01', firstFall: '05-10' })).rejects.toThrow(/before/);
    await setFrostDates(mgr, { lastSpring: '05-10', firstFall: '10-01' });
    expect(await getFrostDates()).toEqual({ lastSpring: '05-10', firstFall: '10-01' });
  });
});
