/** Livestock: head-count invariants, withdrawals, supply drawdown, breeding, permissions. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import {
  addAnimal, addBreeding, createGroup, deleteEvent, groupDetail, listGroups, livestockAlerts, logEvent, logProduction, updateAnimal, updateGroup,
} from '@/lib/data/livestock';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const count = async (id: string) => (await db.select().from(schema.animalGroups).where(eq(schema.animalGroups.id, id)))[0].headCount;

describe('livestock', () => {
  it('logs eggs and shows the week-on-week trend', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    const flock = await createGroup(mgr, { name: 'Layers', species: 'chicken', headCount: 20 });
    await logProduction(crew, flock, { kind: 'eggs', amount: 12 });
    await logProduction(crew, flock, { kind: 'eggs', amount: 3 });
    await logProduction(crew, flock, { kind: 'eggs', amount: 10, date: addDays(T, -8) });
    const g = (await listGroups()).find((x) => x.id === flock)!;
    expect(g.production[0]).toMatchObject({ kind: 'eggs', thisWeek: 15, lastWeek: 10, pct: 50, today: 15 });
    expect((await livestockAlerts()).eggs?.today).toBe(15);
  });

  it('keeps the head count honest through births, deaths, sales, moves and undo', async () => {
    const mgr = await makeUser('manager');
    const herd = await createGroup(mgr, { name: 'Does', species: 'goat', headCount: 3 });
    const other = await createGroup(mgr, { name: 'Bucks', species: 'goat', headCount: 1 });
    const daisy = await addAnimal(mgr, herd, { name: 'Daisy', sex: 'female' }); // already counted
    expect(await count(herd)).toBe(3);
    const birth = await logEvent(mgr, herd, { type: 'birth', animalId: daisy, count: 2 });
    expect(await count(herd)).toBe(5);
    await logEvent(mgr, herd, { type: 'sale', count: 2 });
    expect(await count(herd)).toBe(3);
    await expect(logEvent(mgr, herd, { type: 'death', count: 4 })).rejects.toThrow(/only 3/);
    await updateAnimal(mgr, daisy, { groupId: other });
    expect([await count(herd), await count(other)]).toEqual([2, 2]);
    const died = await logEvent(mgr, other, { type: 'death', animalId: daisy });
    expect(await count(other)).toBe(1);
    await deleteEvent(mgr, died);
    expect(await count(other)).toBe(2);
    expect((await groupDetail(other)).animals.find((a) => a.id === daisy)?.status).toBe('active');
    await deleteEvent(mgr, birth);
    expect(await count(herd)).toBe(0);
    await expect(updateGroup(mgr, other, { headCount: 0 })).rejects.toThrow(/fewer than the animals listed/);
    await updateGroup(mgr, other, { headCount: 5 });
    expect(await count(other)).toBe(5);
  });

  it('draws down supplies and tracks withdrawal from the product defaults', async () => {
    const mgr = await makeUser('manager');
    await db.insert(schema.inventory).values({ id: 'inv-w', name: 'Wormer', unit: 'ml', qty: 50, meatWithdrawalDays: 14, milkWithdrawalDays: 4 });
    const herd = await createGroup(mgr, { name: 'Milkers', species: 'goat', headCount: 4 });
    await logEvent(mgr, herd, { type: 'treatment', inventoryId: 'inv-w', qtyUsed: 10 });
    expect((await db.select().from(schema.inventory).where(eq(schema.inventory.id, 'inv-w')))[0].qty).toBe(40);
    const g = (await listGroups()).find((x) => x.id === herd)!;
    expect(g.withholdUntil).toEqual({ meat: addDays(T, 14), milk: addDays(T, 4) });
    expect((await livestockAlerts()).withdrawals.some((w) => w.groupId === herd && w.what === 'Wormer')).toBe(true);
    await expect(logEvent(mgr, herd, { type: 'treatment', inventoryId: 'inv-w', qtyUsed: 100 })).rejects.toThrow(/Only 40/);
  });

  it('works out the due date and closes the breeding on birth', async () => {
    const mgr = await makeUser('manager');
    const herd = await createGroup(mgr, { name: 'Ewes', species: 'sheep', headCount: 2 });
    const bred = addDays(T, -140);
    const b = await addBreeding(mgr, herd, { bredOn: bred, sire: 'Neighbour’s ram' });
    expect((await livestockAlerts()).births.find((x) => x.id === b)?.dueOn).toBe(addDays(bred, 147));
    await logEvent(mgr, herd, { type: 'birth', count: 1, breedingId: b });
    expect((await livestockAlerts()).births.find((x) => x.id === b)).toBeUndefined();
  });

  it('enforces who can do what', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    const guest = await makeUser('guest');
    const herd = await createGroup(mgr, { name: 'Pigs', species: 'pig', headCount: 5 });
    await expect(createGroup(crew, { name: 'x', species: 'pig' })).rejects.toThrow(/can’t/);
    await expect(logEvent(crew, herd, { type: 'sale', count: 1 })).rejects.toThrow(/can’t record sales/);
    await expect(logEvent(guest, herd, { type: 'note' })).rejects.toThrow(/can’t/);
    await logEvent(crew, herd, { type: 'weight', weight: 120, notes: 'avg' });
  });
});
