/**
 * Spend reporting over maintenance/upkeep costs (the only money the app tracks
 * outflow for). Aggregates maintenance-log costs by asset and by month within a
 * date window, so the farm can see where the upkeep budget is going.
 */
import 'server-only';
import { db } from '@/db';
import { maintenanceLogs, maintenanceItems, assets } from '@/db/schema';

export type AssetSpend = { assetId: string; name: string; total: number };
export type MonthSpend = { month: string; total: number };
export type SpendReport = { total: number; byAsset: AssetSpend[]; byMonth: MonthSpend[] };

export async function spendReport(fromISO: string | null, toISO: string): Promise<SpendReport> {
  const [logs, items, assetRows] = await Promise.all([
    db.select({ itemId: maintenanceLogs.itemId, cost: maintenanceLogs.cost, date: maintenanceLogs.date }).from(maintenanceLogs),
    db.select({ id: maintenanceItems.id, assetId: maintenanceItems.assetId }).from(maintenanceItems),
    db.select({ id: assets.id, name: assets.name }).from(assets),
  ]);
  const assetOfItem = new Map(items.map((i) => [i.id, i.assetId]));
  const assetName = new Map(assetRows.map((a) => [a.id, a.name]));

  const perAsset = new Map<string, number>();
  const perMonth = new Map<string, number>();
  let total = 0;

  for (const l of logs) {
    const cost = l.cost || 0;
    if (cost <= 0) continue;
    if ((fromISO && l.date < fromISO) || l.date > toISO) continue;
    total += cost;
    const assetId = assetOfItem.get(l.itemId);
    if (assetId) perAsset.set(assetId, (perAsset.get(assetId) ?? 0) + cost);
    const month = l.date.slice(0, 7);
    perMonth.set(month, (perMonth.get(month) ?? 0) + cost);
  }

  const byAsset: AssetSpend[] = [...perAsset.entries()]
    .map(([assetId, t]) => ({ assetId, name: assetName.get(assetId) ?? 'Unknown', total: t }))
    .sort((a, b) => b.total - a.total);
  const byMonth: MonthSpend[] = [...perMonth.entries()]
    .map(([month, t]) => ({ month, total: t }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  return { total, byAsset, byMonth };
}
