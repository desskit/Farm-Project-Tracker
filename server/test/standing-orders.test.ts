/** Standing orders: due deliveries become sales, once each. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { deliveriesDue, listStandingOrders, saveStandingOrder, settleDelivery } from '@/lib/data/standing-orders';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

describe('standing orders', () => {
  it('record one sale per delivery, skip records none, and a delivery settles only once', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    await expect(saveStandingOrder(crew, null, { buyer: 'X', kind: 'eggs', price: 10, every: 'week', startDate: T })).rejects.toThrow(/can’t manage/);
    const id = await saveStandingOrder(mgr, null, { buyer: 'The Millers', kind: 'eggs', qty: 2, unit: 'dozen', price: 12, every: 'week', startDate: T });
    expect((await deliveriesDue(mgr)).map((o) => o.id)).toEqual([id]);

    const saleId = await settleDelivery(mgr, id, T, 'delivered');
    const [sale] = await db.select().from(schema.sales).where(eq(schema.sales.id, saleId!));
    expect(sale).toMatchObject({ buyer: 'The Millers', amount: 12, qty: 2, unit: 'dozen', paid: false, date: T });
    await expect(settleDelivery(mgr, id, T, 'delivered')).rejects.toThrow(/already done/); // double tap
    const [o] = await listStandingOrders(mgr);
    expect(o.nextDate).toBe(addDays(T, 7));
    await expect(settleDelivery(mgr, id, o.nextDate, 'delivered')).rejects.toThrow(/isn’t due yet/);
    expect(await deliveriesDue(mgr)).toHaveLength(0);

    // Skipping moves on without a sale; paid-on-delivery orders are recorded paid.
    const id2 = await saveStandingOrder(mgr, null, { buyer: 'Neighbour', kind: 'hay', price: 40, every: 'month', startDate: T, paidOnDelivery: true });
    expect(await settleDelivery(mgr, id2, T, 'skipped')).toBeNull();
    const id3 = await saveStandingOrder(mgr, null, { buyer: 'Cafe', kind: 'milk', price: 30, every: '2weeks', startDate: T, paidOnDelivery: true });
    const s3 = await settleDelivery(mgr, id3, T, 'delivered');
    expect((await db.select().from(schema.sales).where(eq(schema.sales.id, s3!)))[0].paid).toBe(true);
    expect((await db.select().from(schema.sales)).length).toBe(2);
  });

  it('pick up from today when the first date has passed, and restart when the schedule changes', async () => {
    const mgr = await makeUser('manager');
    const id = await saveStandingOrder(mgr, null, { buyer: 'Late start', kind: 'eggs', price: 5, every: 'week', startDate: addDays(T, -10) });
    const o = (await listStandingOrders(mgr)).find((x) => x.id === id)!;
    expect(o.nextDate >= T).toBe(true);
    expect(o.nextDate <= addDays(T, 6)).toBe(true);
    await saveStandingOrder(mgr, id, { buyer: 'Late start', kind: 'eggs', price: 5, every: 'month', startDate: addDays(T, 3) });
    expect((await listStandingOrders(mgr)).find((x) => x.id === id)!.nextDate).toBe(addDays(T, 3));
  });
});
