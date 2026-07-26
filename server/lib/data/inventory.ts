/**
 * Inventory (Supplies) data-access layer — ported from js/store.js's inventory
 * functions. Managers manage items; anyone can log usage/restock.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { inventory, inventoryLog } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';
import { pushLowStock } from '@/lib/notify/events';

export type InventoryRow = typeof inventory.$inferSelect;
export type InventoryLogRow = typeof inventoryLog.$inferSelect;

function isManager(u: SessionUser): boolean {
  return u.role === 'manager' || u.role === 'admin';
}

export async function listInventory(): Promise<InventoryRow[]> {
  const rows = await db.select().from(inventory);
  return rows.sort((a, b) => (a.name < b.name ? -1 : 1));
}
export async function inventoryById(id: string): Promise<InventoryRow | null> {
  const rows = await db.select().from(inventory).where(eq(inventory.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function lowStockItems(): Promise<InventoryRow[]> {
  return (await listInventory()).filter((i) => i.qty <= i.reorderAt);
}

export type InventoryInput = { name: string; category?: string; unit?: string; qty?: number; reorderAt?: number; notes?: string; unitCost?: number | null };

/** What the shelf is worth: on-hand quantity priced at unit cost. */
export function inventoryValue(items: InventoryRow[]): number {
  return items.reduce((sum, i) => sum + (i.unitCost != null ? i.qty * i.unitCost : 0), 0);
}

export async function addInventoryItem(user: SessionUser, data: InventoryInput): Promise<InventoryRow> {
  if (!isManager(user)) throw new DataError('Only managers and admins can add inventory.', 403);
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
  if (!isManager(user)) throw new DataError('Only managers and admins can edit inventory.', 403);
  const it = await inventoryById(id);
  if (!it) throw new DataError('No such item.', 404);
  const patch: Partial<typeof inventory.$inferInsert> = { notes: data.notes || '' };
  if (data.name != null && String(data.name).trim()) patch.name = String(data.name).trim();
  if (data.category != null) patch.category = data.category || 'Supplies';
  if (data.unit != null) patch.unit = data.unit || 'count';
  if (data.reorderAt != null) patch.reorderAt = Number(data.reorderAt) || 0;
  if (data.unitCost !== undefined) patch.unitCost = data.unitCost != null ? Number(data.unitCost) : null;
  await db.update(inventory).set(patch).where(eq(inventory.id, id));
  publishChange('inventory');
  return (await inventoryById(id))!;
}

export async function deleteInventoryItem(user: SessionUser, id: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can delete inventory.', 403);
  await db.delete(inventory).where(eq(inventory.id, id)); // log cascades via FK
  publishChange('inventory');
}

/** Anyone can use/restock; each adjustment is logged with who/when. */
export async function adjustStock(user: SessionUser, id: string, delta: number, reason?: string): Promise<number> {
  const it = await inventoryById(id);
  if (!it) throw new DataError('No such item.', 404);
  const d = Number(delta);
  if (!isFinite(d) || d === 0) throw new DataError('Enter a non-zero amount.', 400);
  if (it.qty + d < 0) throw new DataError(`Only ${it.qty} ${it.unit} on hand.`, 400);
  const qty = it.qty + d;
  await db.update(inventory).set({ qty }).where(eq(inventory.id, id));
  await db.insert(inventoryLog).values({ id: uid('il'), itemId: id, delta: d, reason: reason || '', userId: user.id, date: todayISO() });
  await logActivity(user.id, `${d > 0 ? 'restocked' : 'used'} ${Math.abs(d)} ${it.unit} of ${it.name}`);
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
