/** Week-5: upkeep alerts fire once per due point; activity respects audiences. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { runUpkeepAlerts } from '@/lib/notify/upkeep-alerts';
import { listActivity, logActivity } from '@/lib/data/activity';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

describe('upkeep alerts', () => {
  it('announces each due point once, and again after the next one comes due', async () => {
    await db.insert(schema.assets).values({ id: 'a1', name: 'Tractor', meterUnit: 'hours' });
    await db.insert(schema.maintenanceItems).values([
      { id: 'm1', assetId: 'a1', name: 'Grease', intervalType: 'calendar', intervalValue: 1, intervalUnit: 'months', nextDueDate: addDays(T, -1) },
      { id: 'm2', assetId: 'a1', name: 'Oil', intervalType: 'usage', intervalValue: 50, lastDoneReading: 450, dueAtReading: 500 },
      { id: 'm3', assetId: 'a1', name: 'Filter', intervalType: 'calendar', intervalValue: 6, intervalUnit: 'months', nextDueDate: addDays(T, 60) },
    ]);
    await db.insert(schema.meterReadings).values({ id: 'r1', assetId: 'a1', reading: 505, date: T });
    expect((await runUpkeepAlerts()).announced).toBe(2);
    expect((await runUpkeepAlerts()).announced).toBe(0);
    await db.update(schema.maintenanceItems).set({ nextDueDate: T }).where(eq(schema.maintenanceItems.id, 'm1'));
    expect((await runUpkeepAlerts()).announced).toBe(1);
  });
});

describe('activity audiences', () => {
  it('hides money and admin entries from people without that permission', async () => {
    const crew = await makeUser('worker');
    const mgr = await makeUser('manager');
    const admin = await makeUser('admin');
    await logActivity(mgr.id, 'completed chore "Feed"', { href: '/chores/x' });
    await logActivity(mgr.id, 'verified rent (2026-11)', { audience: 'finance.view' });
    await logActivity(admin.id, 'viewed the vault recovery key', { audience: 'system.admin' });
    const texts = async (u: typeof crew) => (await listActivity(u, 10)).map((a) => a.text);
    expect(await texts(crew)).toEqual(['completed chore "Feed"']);
    expect(await texts(mgr)).toHaveLength(2);
    expect(await texts(admin)).toHaveLength(3);
    expect((await listActivity(admin, 10, mgr.id)).every((a) => a.userId === mgr.id)).toBe(true);
  });
});
