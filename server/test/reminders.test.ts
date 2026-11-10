/** Phase 2: weather alerts once each, feed runway, grazing advice, calendar feed, renewals. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { runWeatherAlerts } from '@/lib/notify/weather-alerts';
import { runRenewalReminders } from '@/lib/notify/renewals';
import { lowStockItems, supplyRunways, adjustStock } from '@/lib/data/inventory';
import { createUnit, grazingAdvice, moveGroup, addPlantings } from '@/lib/data/land';
import { createGroup } from '@/lib/data/livestock';
import { calendarFeedFor, resetCalendarToken, userForCalendarToken } from '@/lib/data/calendar-feed';
import { addChore } from '@/lib/data/chores';
import { addAssetDoc } from '@/lib/data/asset-docs';
import { setSetting } from '@/lib/data/settings';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

describe('weather alerts', () => {
  it('sends each alert once, and frost only when something is growing', async () => {
    const mgr = await makeUser('manager');
    const frost = [{ kind: 'frost' as const, date: addDays(T, 1), when: 'tomorrow', title: 'Frost coming', detail: 'Low of 30°F tonight into tomorrow.' }];
    expect((await runWeatherAlerts(T, frost)).sent).toBe(0); // nothing growing: nobody to tell
    await setSetting('weather-alerts-sent', {});
    const garden = await createUnit(mgr, { kind: 'garden', name: 'Frost garden' });
    await addPlantings(mgr, garden, { crop: 'Basil', sownOn: addDays(T, -10) });
    expect((await runWeatherAlerts(T, frost)).sent).toBe(1);
    expect((await runWeatherAlerts(T, frost)).sent).toBe(0);
    expect((await runWeatherAlerts(T, [{ kind: 'rain', date: T, when: 'today', title: 'Heavy rain', detail: 'About 1.5 in today.' }])).sent).toBe(1);
  });
});

describe('feed runway', () => {
  it('flags a supply that will run out soon even above its reorder point', async () => {
    const mgr = await makeUser('manager');
    await db.insert(schema.inventory).values({ id: 'rw', name: 'Scratch grain', unit: 'lb', qty: 40, reorderAt: 5 });
    expect((await lowStockItems()).some((i) => i.id === 'rw')).toBe(false);
    await adjustStock(mgr, 'rw', -28, 'fed'); // 28 lb in the last week → 4 lb/day, 12 left → 3 days
    expect((await supplyRunways()).get('rw')).toBe(3);
    expect((await lowStockItems()).some((i) => i.id === 'rw')).toBe(true);
  });
});

describe('grazing advice', () => {
  it('flags an overstay and points at the rested paddock', async () => {
    const mgr = await makeUser('manager');
    const pasture = await createUnit(mgr, { kind: 'pasture', name: 'East' });
    const a = await createUnit(mgr, { kind: 'paddock', name: 'E1', parentId: pasture, grazeDays: 4 });
    const b = await createUnit(mgr, { kind: 'paddock', name: 'E2', parentId: pasture });
    const herd = await createGroup(mgr, { name: 'Steers', species: 'cattle', headCount: 6 });
    await moveGroup(mgr, herd, a, { date: addDays(T, -9) });
    const adv = (await grazingAdvice()).find((x) => x.groupId === herd)!;
    expect([adv.daysHere, adv.over, adv.next?.id]).toEqual([9, 5, b]);
  });
});

describe('calendar feed', () => {
  it('shows a person only their own calendar, and a reset kills the old link', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    const other = await makeUser('worker');
    await addChore(mgr, { name: 'Private chore', schedule: { type: 'once' }, nextDue: addDays(T, 2), assigneeIds: [crew.id] });
    const t1 = await resetCalendarToken(crew.id);
    const viewer = (await userForCalendarToken(t1))!;
    expect(viewer.id).toBe(crew.id);
    expect(await calendarFeedFor(viewer, 'https://farm.test')).toContain('SUMMARY:Private chore');
    const o = (await userForCalendarToken(await resetCalendarToken(other.id)))!;
    expect(await calendarFeedFor(o, 'https://farm.test')).not.toContain('Private chore');
    const t2 = await resetCalendarToken(crew.id);
    expect(await userForCalendarToken(t1)).toBeNull();
    expect((await userForCalendarToken(t2))?.id).toBe(crew.id);
    await db.update(schema.users).set({ active: false }).where(eq(schema.users.id, crew.id));
    expect(await userForCalendarToken(t2)).toBeNull();
    expect(await userForCalendarToken('nope')).toBeNull();
  });
});

describe('renewal reminders', () => {
  it('announces a paper once per stage', async () => {
    const mgr = await makeUser('manager');
    await db.insert(schema.assets).values({ id: 'a-ren', name: 'Truck' });
    await db.insert(schema.attachments).values({ id: 'att-ren', path: 'r.pdf', mime: 'application/pdf', uploadedBy: mgr.id });
    await addAssetDoc(mgr, 'a-ren', { name: 'Insurance', docType: 'other', attachmentId: 'att-ren', expiresOn: addDays(T, 20) });
    const sent: string[] = [];
    const push = async (_ids: string[], p: { body: string }) => { sent.push(p.body); };
    expect((await runRenewalReminders(T, push)).sent).toBe(1);
    expect(sent[0]).toContain('Truck: Insurance expires');
    expect((await runRenewalReminders(T, push)).sent).toBe(0);
    expect((await runRenewalReminders(addDays(T, 15), push)).sent).toBe(1); // a week out
    expect((await runRenewalReminders(addDays(T, 25), push)).sent).toBe(1); // lapsed
    expect((await runRenewalReminders(addDays(T, 40), push)).sent).toBe(0);
  });
});
