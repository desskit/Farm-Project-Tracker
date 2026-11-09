/**
 * Drawing supplies down from other parts of the farm — a treatment uses a dose
 * of wormer, a feed chore a bag of feed. Every draw goes through adjustStock,
 * so it's logged, shows in spend, and can trip the low-stock push.
 *
 * Checks every line first so a short shelf fails the whole thing up front
 * rather than half-way through.
 */
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { inventory } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { adjustStock } from './inventory';
import { DataError } from './errors';

export type SupplyUse = { inventoryId: string; qty: number };

export async function checkSupplies(uses: SupplyUse[]): Promise<Map<string, typeof inventory.$inferSelect>> {
  const lines = uses.filter((u) => u.qty > 0);
  const want = new Map<string, number>();
  for (const u of lines) want.set(u.inventoryId, (want.get(u.inventoryId) ?? 0) + u.qty);
  if (!want.size) return new Map();
  const rows = await db.select().from(inventory).where(inArray(inventory.id, [...want.keys()]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const [id, qty] of want) {
    const it = byId.get(id);
    if (!it) throw new DataError('That supply no longer exists.', 404);
    if (it.qty < qty) throw new DataError(`Only ${it.qty} ${it.unit} of ${it.name} on hand.`, 400);
  }
  return byId;
}

export async function consumeSupplies(user: SessionUser, uses: SupplyUse[], reason: string): Promise<void> {
  await checkSupplies(uses);
  for (const u of uses) if (u.qty > 0) await adjustStock(user, u.inventoryId, -u.qty, reason);
}
