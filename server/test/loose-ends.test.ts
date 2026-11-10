/** Phase 1: feed chores and service parts use supplies; spending covers animals and land; utilities are chased. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { addChore, choreSuppliesFor, completeChore, sendBackChoreCompletion } from '@/lib/data/chores';
import { logService, sendBackService } from '@/lib/data/maintenance';
import { createGroup, logEvent } from '@/lib/data/livestock';
import { createUnit, logLandEvent } from '@/lib/data/land';
import { spendReport } from '@/lib/data/spend';
import { runRentReminders, type ReminderChannels } from '@/lib/notify/rent-reminders';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const stock = async (id: string) => (await db.select().from(schema.inventory).where(eq(schema.inventory.id, id)))[0].qty;

describe('feed chores use supplies', () => {
  it('draws on completion, charges the herd, never blocks on a short shelf, and returns it when sent back', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    await db.insert(schema.inventory).values({ id: 'feed', name: 'Layer feed', unit: 'scoops', qty: 5, unitCost: 2 });
    const flock = await createGroup(mgr, { name: 'Hens', species: 'chicken', headCount: 12 });
    const c = await addChore(mgr, {
      name: 'Feed hens', schedule: { type: 'daily' }, assigneeIds: [crew.id], link: { type: 'animal_group', id: flock },
      supplies: [{ inventoryId: 'feed', qty: 2 }, { inventoryId: 'gone', qty: 1 }],
    });
    expect((await choreSuppliesFor(c.id)).map((x) => [x.name, x.qty])).toEqual([['Layer feed', 2]]);

    await completeChore(crew, c.id);
    expect(await stock('feed')).toBe(3);
    const [log] = await db.select().from(schema.inventoryLog).where(eq(schema.inventoryLog.itemId, 'feed'));
    expect([log.delta, log.refType, log.refId]).toEqual([-2, 'animal_group', flock]);

    await completeChore(crew, c.id);
    await completeChore(crew, c.id); // only 1 scoop left: still completes, shelf goes to zero
    expect(await stock('feed')).toBe(0);
    const comps = await db.select().from(schema.choreCompletions).where(eq(schema.choreCompletions.choreId, c.id));
    expect(comps).toHaveLength(3);
    const last = comps.find((x) => x.suppliesUsed?.[0]?.qty === 1)!;
    await sendBackChoreCompletion(mgr, last.id);
    expect(await stock('feed')).toBe(1);
  });
});

describe('service parts', () => {
  it('come off Supplies, are refused when short, and go back if the service is undone', async () => {
    const mgr = await makeUser('manager');
    await db.insert(schema.inventory).values({ id: 'filter', name: 'Oil filter', unit: 'each', qty: 1 });
    await db.insert(schema.assets).values({ id: 'a-p', name: 'Tractor' });
    await db.insert(schema.maintenanceItems).values({ id: 'm-p', assetId: 'a-p', name: 'Oil change', intervalType: 'calendar', intervalValue: 6, intervalUnit: 'months', nextDueDate: T });
    await expect(logService(mgr, 'm-p', { parts: [{ inventoryId: 'filter', qty: 2 }] })).rejects.toThrow(/Only 1 each of Oil filter/);
    expect(await db.select().from(schema.maintenanceLogs).where(eq(schema.maintenanceLogs.itemId, 'm-p'))).toHaveLength(0);
    await logService(mgr, 'm-p', { parts: [{ inventoryId: 'filter', qty: 1 }] });
    expect(await stock('filter')).toBe(0);
    const [l] = await db.select().from(schema.maintenanceLogs).where(eq(schema.maintenanceLogs.itemId, 'm-p'));
    expect(l.parts).toEqual([{ inventoryId: 'filter', qty: 1, name: 'Oil filter', unit: 'each' }]);
    await sendBackService(mgr, l.id);
    expect(await stock('filter')).toBe(1);
  });
});

describe('spending', () => {
  it('counts animal and field-work costs, but not what an animal sold for', async () => {
    const mgr = await makeUser('manager');
    const before = await spendReport(null, T);
    const herd = await createGroup(mgr, { name: 'Pigs', species: 'pig', headCount: 4 });
    await logEvent(mgr, herd, { type: 'treatment', cost: 40, notes: 'vet visit' });
    await logEvent(mgr, herd, { type: 'sale', count: 1, cost: 300 });
    const field = await createUnit(mgr, { kind: 'field', name: 'Hay field' });
    await logLandEvent(mgr, field, { type: 'amend', cost: 75, notes: 'lime' });
    const after = await spendReport(null, T);
    const cat = (r: typeof after, c: string) => r.byCategory.find((x) => x.category === c)?.total ?? 0;
    expect(cat(after, 'animals') - cat(before, 'animals')).toBe(40);
    expect(cat(after, 'land') - cat(before, 'land')).toBe(75);
    expect(after.total - before.total).toBe(115);
  });
});

describe('utility reminders', () => {
  it('chases an unpaid utility share under its own name', async () => {
    const r = await makeUser('renter', 'Pat');
    await db.insert(schema.notificationPrefs).values({ userId: r.id }).onConflictDoNothing();
    await db.insert(schema.rentCharges).values({ id: 'rc-util', userId: r.id, kind: 'utility', label: 'Electric · Oct', month: T.slice(0, 7), amount: 62.5, dueDate: addDays(T, -2) });
    const pushes: { userId: string; title: string; body: string }[] = [];
    const ch: ReminderChannels = {
      emailReady: () => false, pushReady: () => true,
      sendEmail: async () => false,
      sendPush: async (userId, p) => { pushes.push({ userId, title: p.title, body: p.body }); },
    };
    await runRentReminders(T, ch);
    const mine = pushes.find((p) => p.userId === r.id)!;
    expect(mine.title).toBe('Electric · Oct overdue');
    expect(mine.body).toContain('Electric · Oct: $62.50');
    const n = pushes.filter((p) => p.userId === r.id).length;
    await runRentReminders(T, ch);
    expect(pushes.filter((p) => p.userId === r.id)).toHaveLength(n); // not again today
  });
});
