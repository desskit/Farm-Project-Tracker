/**
 * Standing orders: a regular buyer gets the same thing on a schedule. When
 * a delivery is due it shows on Sales and Today; "Delivered" records the
 * sale (owed unless they pay on delivery) and moves the order to its next
 * date; "Skip" just moves it on. Needs sales.log.
 */
import 'server-only';
import { and, asc, eq, lte } from 'drizzle-orm';
import { db } from '@/db';
import { animalGroups, landUnits, standingOrders, type OrderEvery, type SaleKind } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { cents } from '@/lib/domain/money';
import { firstDeliveryFrom, nextDelivery } from '@/lib/domain/standing';
import type { SessionUser } from '@/lib/auth/session';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';
import { addSale } from './sales';

export type StandingOrderRow = typeof standingOrders.$inferSelect;
export type StandingOrderInput = {
  buyer: string; kind: SaleKind; category?: string; item?: string; qty?: number | null; unit?: string; price: number;
  every: OrderEvery; startDate: string; groupId?: string | null; landUnitId?: string | null; paidOnDelivery?: boolean; active?: boolean; notes?: string;
};

function need(user: SessionUser) {
  if (!can(user, 'sales.log')) throw new DataError('You can’t manage the farm’s sales.', 403);
}

export async function listStandingOrders(user: SessionUser): Promise<StandingOrderRow[]> {
  need(user);
  return db.select().from(standingOrders).orderBy(asc(standingOrders.nextDate));
}

/** Deliveries due by `until` (today by default), oldest first. */
export async function deliveriesDue(user: SessionUser, until = todayISO()): Promise<StandingOrderRow[]> {
  if (!can(user, 'sales.log')) return [];
  return db.select().from(standingOrders).where(and(eq(standingOrders.active, true), lte(standingOrders.nextDate, until))).orderBy(asc(standingOrders.nextDate));
}

async function check(d: StandingOrderInput) {
  if (!d.buyer.trim()) throw new DataError('Who is it for?', 400);
  if (!(d.price > 0)) throw new DataError('Enter the price of one delivery.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate)) throw new DataError('Pick the first delivery day.', 400);
  if (d.groupId && !(await db.select({ id: animalGroups.id }).from(animalGroups).where(eq(animalGroups.id, d.groupId)).limit(1)).length) throw new DataError('That group no longer exists.', 400);
  if (d.landUnitId && !(await db.select({ id: landUnits.id }).from(landUnits).where(eq(landUnits.id, d.landUnitId)).limit(1)).length) throw new DataError('That place no longer exists.', 400);
}

const values = (d: StandingOrderInput) => ({
  buyer: d.buyer.trim().slice(0, 80), kind: d.kind, category: d.category?.trim().slice(0, 40) ?? '', item: d.item?.trim().slice(0, 80) ?? '',
  qty: d.qty ?? null, unit: d.unit?.trim().slice(0, 20) ?? '', price: cents(d.price), every: d.every, startDate: d.startDate,
  groupId: d.groupId || null, landUnitId: d.landUnitId || null, paidOnDelivery: !!d.paidOnDelivery, active: d.active ?? true, notes: d.notes?.trim() ?? '',
});

export async function saveStandingOrder(user: SessionUser, id: string | null, d: StandingOrderInput): Promise<string> {
  need(user);
  await check(d);
  const v = values(d);
  if (id) {
    const [o] = await db.select().from(standingOrders).where(eq(standingOrders.id, id)).limit(1);
    if (!o) throw new DataError('No such order.', 404);
    // A new schedule restarts from the first date on or after today; otherwise keep the next date.
    const changed = o.every !== v.every || o.startDate !== v.startDate;
    const nextDate = changed ? firstDeliveryFrom(v.startDate, v.every, todayISO()) : o.nextDate;
    await db.update(standingOrders).set({ ...v, nextDate }).where(eq(standingOrders.id, id));
    publishChange('sales');
    return id;
  }
  const newId = uid('so');
  await db.insert(standingOrders).values({ id: newId, ...v, nextDate: firstDeliveryFrom(v.startDate, v.every, todayISO()), createdBy: user.id });
  publishChange('sales');
  return newId;
}

export async function deleteStandingOrder(user: SessionUser, id: string): Promise<void> {
  need(user);
  await db.delete(standingOrders).where(eq(standingOrders.id, id));
  publishChange('sales');
}

/**
 * Mark the delivery due on `forDate` as done (records the sale) or skipped.
 * `forDate` must still be the order's next date, so a double tap or a replay
 * can't record the same delivery twice.
 */
export async function settleDelivery(user: SessionUser, id: string, forDate: string, action: 'delivered' | 'skipped', paid?: boolean): Promise<string | null> {
  need(user);
  const [o] = await db.select().from(standingOrders).where(eq(standingOrders.id, id)).limit(1);
  if (!o) throw new DataError('No such order.', 404);
  if (o.nextDate !== forDate) throw new DataError('That delivery is already done.', 409);
  if (forDate > todayISO()) throw new DataError('That delivery isn’t due yet.', 400);
  const next = nextDelivery(o.startDate, o.every, o.nextDate);
  // Move the order on first: if two taps race, only one passes the date check below.
  const moved = await db.update(standingOrders).set({ nextDate: next }).where(and(eq(standingOrders.id, id), eq(standingOrders.nextDate, forDate))).returning({ id: standingOrders.id });
  if (!moved.length) throw new DataError('That delivery is already done.', 409);
  if (action === 'skipped') {
    publishChange('sales');
    return null;
  }
  return addSale(user, {
    date: forDate, kind: o.kind, category: o.category, item: o.item, qty: o.qty, unit: o.unit, amount: o.price, buyer: o.buyer,
    paid: paid ?? o.paidOnDelivery, groupId: o.groupId, landUnitId: o.landUnitId, notes: `Standing order${o.notes ? ` · ${o.notes}` : ''}`,
  });
}
