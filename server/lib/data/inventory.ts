/**
 * Inventory (Supplies) data-access layer — ported from js/store.js's inventory
 * functions. Managers manage items; anyone can log usage/restock.
 */
import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '@/db';
import { inventory, inventoryLog, type SupplyRefType } from '@/db/schema';
import { uid } from '@/lib/ids';
import { addDays, todayISO } from '@/lib/domain/dates';
import { runwayDays } from '@/lib/domain/supplies';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';
import { pushLowStock } from '@/lib/notify/events';
import { can } from '@/lib/domain/permissions';

export type InventoryRow = typeof inventory.$inferSelect;
export type InventoryLogRow = typeof inventoryLog.$inferSelect;


export async function listInventory(): Promise<InventoryRow[]> {
  const rows = await db.select().from(inventory);
  return rows.sort((a, b) => (a.name < b.name ? -1 : 1));
}
export async function inventoryById(id: string): Promise<InventoryRow | null> {
  const rows = await db.select().from(inventory).where(eq(inventory.id, id)).limit(1);
  return rows[0] ?? null;
}
/** Days each supply will last at its recent rate of use (only supplies with recent use appear). */
export async function supplyRunways(today = todayISO()): Promise<Map<string, number>> {
  const [items, uses] = await Promise.all([
    db.select({ id: inventory.id, qty: inventory.qty }).from(inventory),
    db.select({ itemId: inventoryLog.itemId, date: inventoryLog.date, delta: inventoryLog.delta }).from(inventoryLog)
      .where(and(lt(inventoryLog.delta, 0), gte(inventoryLog.date, addDays(today, -27)))),
  ]);
  const out = new Map<string, number>();
  for (const it of items) {
    const days = runwayDays(it.qty, uses.filter((u) => u.itemId === it.id).map((u) => ({ date: u.date, amount: -u.delta })), today);
    if (days != null) out.set(it.id, days);
  }
  return out;
}

/** Running out within this many days counts as needing a reorder, whatever the reorder point says. */
export const RUNWAY_WARN_DAYS = 7;

/** Supplies to reorder: at or under their reorder point, or about to run out at the current rate. */
export async function lowStockItems(): Promise<InventoryRow[]> {
  const [items, runways] = await Promise.all([listInventory(), supplyRunways()]);
  return items.filter((i) => i.qty <= i.reorderAt || (runways.get(i.id) ?? Infinity) <= RUNWAY_WARN_DAYS);
}

export type InventoryInput = { name: string; category?: string; unit?: string; qty?: number; reorderAt?: number; notes?: string; unitCost?: number | null; meatWithdrawalDays?: number | null; milkWithdrawalDays?: number | null };

/** What the shelf is worth: on-hand quantity priced at unit cost. */
export function inventoryValue(items: InventoryRow[]): number {
  return items.reduce((sum, i) => sum + (i.unitCost != null ? i.qty * i.unitCost : 0), 0);
}

export async function addInventoryItem(user: SessionUser, data: InventoryInput): Promise<InventoryRow> {
  if (!can(user, 'supplies.manage')) throw new DataError('Only managers and admins can add inventory.', 403);
  const name = (data.name || '').trim();
  if (!name) throw new DataError('Name is required.', 400);
  const id = uid('inv');
  await db.insert(inventory).values({
    id,
    name,
    category: data.category || 'Supplies',
    unit: data.unit || 'count',
    qty: Number(data.qty) || 0,
    reorderAt: Number(data.reorderAt) || 0,
    notes: data.notes || '',
    unitCost: data.unitCost != null ? Number(data.unitCost) : null,
  });
  publishChange('inventory');
  return (await inventoryById(id))!;
}

export async function updateInventoryItem(user: SessionUser, id: string, data: Partial<InventoryInput>): Promise<InventoryRow> {
  if (!can(user, 'supplies.manage')) throw new DataError('Only managers and admins can edit inventory.', 403);
  const it = await inventoryById(id);
  if (!it) throw new DataError('No such item.', 404);
  const patch: Partial<typeof inventory.$inferInsert> = { notes: data.notes || '' };
  if (data.name != null && String(data.name).trim()) patch.name = String(data.name).trim();
  if (data.category != null) patch.category = data.category || 'Supplies';
  if (data.unit != null) patch.unit = data.unit || 'count';
  if (data.reorderAt != null) patch.reorderAt = Number(data.reorderAt) || 0;
  if (data.unitCost !== undefined) patch.unitCost = data.unitCost != null ? Number(data.unitCost) : null;
  if (data.meatWithdrawalDays !== undefined) patch.meatWithdrawalDays = data.meatWithdrawalDays;
  if (data.milkWithdrawalDays !== undefined) patch.milkWithdrawalDays = data.milkWithdrawalDays;
  await db.update(inventory).set(patch).where(eq(inventory.id, id));
  publishChange('inventory');
  return (await inventoryById(id))!;
}

export async function deleteInventoryItem(user: SessionUser, id: string): Promise<void> {
  if (!can(user, 'supplies.manage')) throw new DataError('Only managers and admins can delete inventory.', 403);
  await db.delete(inventory).where(eq(inventory.id, id)); // log cascades via FK
  publishChange('inventory');
}

/** Anyone can use/restock; each adjustment is logged with who/when. */
export type SupplyRef = { type: SupplyRefType; id: string };

export async function adjustStock(user: SessionUser, id: string, delta: number, reason?: string, opts: { ref?: SupplyRef | null } = {}): Promise<number> {
  const it = await inventoryById(id);
  if (!it) throw new DataError('No such item.', 404);
  const d = Number(delta);
  if (!isFinite(d) || d === 0) throw new DataError('Enter a non-zero amount.', 400);
  if (it.qty + d < 0) throw new DataError(`Only ${it.qty} ${it.unit} on hand.`, 400);
  const qty = it.qty + d;
  await db.update(inventory).set({ qty }).where(eq(inventory.id, id));
  await db.insert(inventoryLog).values({ id: uid('il'), itemId: id, delta: d, reason: reason || '', userId: user.id, date: todayISO(), refType: opts.ref?.type ?? null, refId: opts.ref?.id ?? null });
  await logActivity(user.id, `${d > 0 ? 'restocked' : 'used'} ${Math.abs(d)} ${it.unit} of ${it.name}`, { href: `/more/supplies/${id}` });
  // Only on the adjustment that crosses the line, so a shelf that sits low
  // doesn't nag on every draw.
  if (qty <= it.reorderAt && it.qty > it.reorderAt) {
    await pushLowStock(user.id, it.name, qty, it.unit);
  }
  publishChange('inventory');
  return qty;
}

export async function inventoryLogFor(id: string): Promise<InventoryLogRow[]> {
  const rows = await db.select().from(inventoryLog).where(eq(inventoryLog.itemId, id));
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}
