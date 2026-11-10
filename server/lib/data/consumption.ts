/**
 * Drawing supplies down from other parts of the farm — a treatment uses a dose
 * of wormer, a feed chore a scoop of feed, a service a filter. Every draw goes
 * through adjustStock, so it's logged, shows in spending, can trip the
 * low-stock push, and records what it was used on (for costing).
 *
 * Two modes:
 *  - consumeSupplies: all or nothing. Checks every line first, so a short
 *    shelf fails the whole thing up front (treatments, sprays, service parts).
 *  - drawWhatsThere: never fails for a short shelf. Takes what's on hand and
 *    reports the shortfall (feed chores: the animals got fed either way).
 */
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { inventory, type SupplyUseRecord } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { adjustStock, type SupplyRef } from './inventory';
import { DataError } from './errors';

export type SupplyUse = { inventoryId: string; qty: number };

function totals(uses: SupplyUse[]): Map<string, number> {
  const want = new Map<string, number>();
  for (const u of uses) if (u.qty > 0) want.set(u.inventoryId, (want.get(u.inventoryId) ?? 0) + u.qty);
  return want;
}

export async function checkSupplies(uses: SupplyUse[]): Promise<Map<string, typeof inventory.$inferSelect>> {
  const want = totals(uses);
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

export async function consumeSupplies(user: SessionUser, uses: SupplyUse[], reason: string, ref?: SupplyRef | null): Promise<SupplyUseRecord[]> {
  const byId = await checkSupplies(uses);
  const out: SupplyUseRecord[] = [];
  for (const [id, qty] of totals(uses)) {
    await adjustStock(user, id, -qty, reason, { ref });
    out.push({ inventoryId: id, qty, name: byId.get(id)?.name, unit: byId.get(id)?.unit });
  }
  return out;
}

/** Take what's on hand, up to what was wanted. Returns what was drawn and what fell short. */
export async function drawWhatsThere(
  user: SessionUser,
  uses: SupplyUse[],
  reason: string,
  ref?: SupplyRef | null,
): Promise<{ drawn: SupplyUseRecord[]; short: { name: string; unit: string; missing: number }[] }> {
  const want = totals(uses);
  if (!want.size) return { drawn: [], short: [] };
  const rows = await db.select().from(inventory).where(inArray(inventory.id, [...want.keys()]));
  const drawn: SupplyUseRecord[] = [];
  const short: { name: string; unit: string; missing: number }[] = [];
  for (const it of rows) {
    const wanted = want.get(it.id)!;
    const take = Math.min(wanted, Math.max(0, it.qty));
    if (take > 0) {
      await adjustStock(user, it.id, -take, reason, { ref });
      drawn.push({ inventoryId: it.id, qty: take, name: it.name, unit: it.unit });
    }
    if (take < wanted) short.push({ name: it.name, unit: it.unit, missing: Math.round((wanted - take) * 1000) / 1000 });
  }
  return { drawn, short };
}

/** Put supplies back (a completion was undone). Supplies deleted since are skipped. */
export async function returnSupplies(user: SessionUser, used: SupplyUseRecord[] | null | undefined, reason: string, ref?: SupplyRef | null): Promise<void> {
  for (const u of used ?? []) {
    if (!(u.qty > 0)) continue;
    await adjustStock(user, u.inventoryId, u.qty, reason, { ref }).catch((e) => {
      if (!(e instanceof DataError && e.status === 404)) throw e;
    });
  }
}
