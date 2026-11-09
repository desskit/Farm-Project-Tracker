/**
 * Week-1 foundation changes, checked against a real (temp) database.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { getDashboard, myOverdueCount } from '@/lib/data/dashboard';
import { completeChore, choreById, choreCompletionsFor } from '@/lib/data/chores';
import { logService, maintenanceById } from '@/lib/data/maintenance';
import { ensureRentCharges } from '@/lib/data/rent';
import { addDays, currentMonthKey, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

describe('nav badge count', () => {
  it('matches the dashboard Mine/Overdue list for every person', async () => {
    const sam = await makeUser('worker', 'Sam');
    const jamie = await makeUser('worker', 'Jamie');
    const boss = await makeUser('admin', 'Morgan');

    // Chores: overdue/today/upcoming, assigned to different people, plus a
    // finished one-off that must not count.
    await db.insert(schema.chores).values([
      { id: 'c1', name: 'late, Sam', schedule: { type: 'daily' }, nextDue: addDays(T, -2) },
      { id: 'c2', name: 'late, both', schedule: { type: 'daily' }, nextDue: addDays(T, -1) },
      { id: 'c3', name: 'today, Sam', schedule: { type: 'daily' }, nextDue: T },
      { id: 'c4', name: 'late but done', schedule: { type: 'once' }, nextDue: addDays(T, -5), done: true },
      { id: 'c5', name: 'late, nobody', schedule: { type: 'daily' }, nextDue: addDays(T, -3) },
    ]);
    await db.insert(schema.choreAssignees).values([
      { choreId: 'c1', userId: sam.id },
      { choreId: 'c2', userId: sam.id },
      { choreId: 'c2', userId: jamie.id },
      { choreId: 'c3', userId: sam.id },
      { choreId: 'c4', userId: sam.id },
    ]);

    // Tasks: overdue for Jamie, done-overdue, and one with no due date.
    await db.insert(schema.projects).values({ id: 'p1', name: 'Shed' });
    await db.insert(schema.projectTasks).values([
      { id: 't1', projectId: 'p1', title: 'late task', dueDate: addDays(T, -1) },
      { id: 't2', projectId: 'p1', title: 'late but done', dueDate: addDays(T, -1), done: true },
      { id: 't3', projectId: 'p1', title: 'no date' },
    ]);
    await db.insert(schema.taskAssignees).values([
      { taskId: 't1', userId: jamie.id },
      { taskId: 't2', userId: jamie.id },
      { taskId: 't3', userId: jamie.id },
    ]);

    // Upkeep (shared): one overdue by date, one overdue by meter reading,
    // one fine.
    await db.insert(schema.assets).values({ id: 'a1', name: 'Tractor', meterUnit: 'hours' });
    await db.insert(schema.maintenanceItems).values([
      { id: 'm1', assetId: 'a1', name: 'Grease', intervalType: 'calendar', intervalValue: 1, intervalUnit: 'months', nextDueDate: addDays(T, -3) },
      { id: 'm2', assetId: 'a1', name: 'Oil', intervalType: 'usage', intervalValue: 50, lastDoneReading: 450, dueAtReading: 500 },
      { id: 'm3', assetId: 'a1', name: 'Filter', intervalType: 'usage', intervalValue: 200, lastDoneReading: 450, dueAtReading: 650 },
    ]);
    await db.insert(schema.meterReadings).values([
      { id: 'r1', assetId: 'a1', reading: 480, date: addDays(T, -10) },
      { id: 'r2', assetId: 'a1', reading: 512, date: addDays(T, -1) },
    ]);

    // Rent: Sam unpaid and late, Jamie marked paid (not overdue for them).
    await db.insert(schema.rentCharges).values([
      { id: 'rc1', userId: sam.id, month: currentMonthKey(), amount: 500, dueDate: addDays(T, -1), status: 'unpaid' },
      { id: 'rc2', userId: jamie.id, month: currentMonthKey(), amount: 450, dueDate: addDays(T, -1), status: 'marked' },
    ]);

    for (const u of [sam, jamie, boss]) {
      const dash = await getDashboard(u, 'mine');
      expect(await myOverdueCount(u), `${u.name}`).toBe(dash.overdue.length);
    }
    // Sanity on the scenario itself: Sam has 2 chores + 2 upkeep + rent.
    expect(await myOverdueCount(sam)).toBe(5);
  });
});

describe('completeChore', () => {
  it('records the completion and moves the due date together', async () => {
    const u = await makeUser('worker');
    await db.insert(schema.chores).values({ id: 'cc1', name: 'Feed', schedule: { type: 'daily' }, nextDue: addDays(T, -1) });
    await db.insert(schema.choreAssignees).values({ choreId: 'cc1', userId: u.id });
    await completeChore(u, 'cc1');
    expect(await choreCompletionsFor('cc1')).toHaveLength(1);
    expect((await choreById('cc1'))!.nextDue > T).toBe(true);
  });

  it('marks a one-off done instead of rolling it forward', async () => {
    const u = await makeUser('worker');
    await db.insert(schema.chores).values({ id: 'cc2', name: 'Fix gate', schedule: { type: 'once' }, nextDue: T });
    await db.insert(schema.choreAssignees).values({ choreId: 'cc2', userId: u.id });
    await completeChore(u, 'cc2');
    const c = (await choreById('cc2'))!;
    expect(c.done).toBe(true);
    expect(c.nextDue).toBe(T);
  });
});

describe('logService', () => {
  it('logs, records the reading and moves the due point in one go', async () => {
    const u = await makeUser('worker');
    await db.insert(schema.assets).values({ id: 'a9', name: 'Truck', meterUnit: 'miles' });
    await db.insert(schema.maintenanceItems).values({
      id: 'm9', assetId: 'a9', name: 'Oil', intervalType: 'usage', intervalValue: 3000, lastDoneReading: 80000, dueAtReading: 83000,
    });
    await logService(u, 'm9', { reading: 83100, cost: 62 });
    const item = (await maintenanceById('m9'))!;
    expect(item.dueAtReading).toBe(86100);
    const readings = await db.select().from(schema.meterReadings).where(eq(schema.meterReadings.assetId, 'a9'));
    expect(readings.map((r) => r.reading)).toEqual([83100]);
    const logs = await db.select().from(schema.maintenanceLogs).where(eq(schema.maintenanceLogs.itemId, 'm9'));
    expect(logs).toHaveLength(1);
  });
});

describe('ensureRentCharges', () => {
  it('creates exactly one charge per lease even when it races itself', async () => {
    const u = await makeUser('worker');
    await db.insert(schema.rentalUnits).values({ id: 'ru-race', name: 'Cabin' });
    await db.insert(schema.leases).values({ id: 'ls-race', unitId: 'ru-race', startDate: '2020-01-01', rent: 600, dueDay: 1 });
    await db.insert(schema.leaseTenants).values({ leaseId: 'ls-race', userId: u.id, isPrimary: true });
    await Promise.all([ensureRentCharges(), ensureRentCharges(), ensureRentCharges()]);
    const rows = await db.select().from(schema.rentCharges).where(eq(schema.rentCharges.userId, u.id));
    expect(rows).toHaveLength(1);
  });
});
