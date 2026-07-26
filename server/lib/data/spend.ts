/**
 * Spend reporting across everything the farm spends money on: upkeep (per-asset
 * maintenance costs), projects (materials and hired help), and supplies drawn
 * off the shelf, priced at their unit cost.
 *
 * Supplies are counted as spend at the moment they're *used*, not when they're
 * bought — that's what makes the monthly figure track the farm's actual burn
 * rather than its purchasing schedule. Unpriced items contribute nothing.
 */
import 'server-only';
import { db } from '@/db';
import {
  maintenanceLogs,
  maintenanceItems,
  assets,
  projectExpenses,
  projects,
  inventory,
  inventoryLog,
} from '@/db/schema';

export type Category = 'upkeep' | 'projects' | 'supplies';
export type AssetSpend = { assetId: string; name: string; total: number };
export type MonthSpend = { month: string; total: number };
export type CategorySpend = { category: Category; label: string; total: number };
export type ProjectSpend = { projectId: string; name: string; total: number };

export type SpendReport = {
  total: number;
  /** Upkeep only — kept for the existing by-asset breakdown. */
  upkeepTotal: number;
  byAsset: AssetSpend[];
  byMonth: MonthSpend[];
  byCategory: CategorySpend[];
  byProject: ProjectSpend[];
  suppliesTotal: number;
};

const CATEGORY_LABELS: Record<Category, string> = {
  upkeep: 'Upkeep',
  projects: 'Projects',
  supplies: 'Supplies used',
};

export async function spendReport(fromISO: string | null, toISO: string): Promise<SpendReport> {
  const [logs, items, assetRows, expenses, projectRows, invRows, invLogs] = await Promise.all([
    db.select({ itemId: maintenanceLogs.itemId, cost: maintenanceLogs.cost, date: maintenanceLogs.date }).from(maintenanceLogs),
    db.select({ id: maintenanceItems.id, assetId: maintenanceItems.assetId }).from(maintenanceItems),
    db.select({ id: assets.id, name: assets.name }).from(assets),
    db.select({ projectId: projectExpenses.projectId, amount: projectExpenses.amount, date: projectExpenses.date }).from(projectExpenses),
    db.select({ id: projects.id, name: projects.name }).from(projects),
    db.select({ id: inventory.id, unitCost: inventory.unitCost }).from(inventory),
    db.select({ itemId: inventoryLog.itemId, delta: inventoryLog.delta, date: inventoryLog.date }).from(inventoryLog),
  ]);
  const assetOfItem = new Map(items.map((i) => [i.id, i.assetId]));
  const assetName = new Map(assetRows.map((a) => [a.id, a.name]));
  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));
  const unitCost = new Map(invRows.map((i) => [i.id, i.unitCost]));

  const inWindow = (date: string) => !((fromISO && date < fromISO) || date > toISO);

  const perAsset = new Map<string, number>();
  const perMonth = new Map<string, number>();
  const perProject = new Map<string, number>();
  const perCategory = new Map<Category, number>();

  const record = (category: Category, date: string, amount: number) => {
    perCategory.set(category, (perCategory.get(category) ?? 0) + amount);
    const month = date.slice(0, 7);
    perMonth.set(month, (perMonth.get(month) ?? 0) + amount);
  };

  for (const l of logs) {
    const cost = l.cost || 0;
    if (cost <= 0 || !inWindow(l.date)) continue;
    record('upkeep', l.date, cost);
    const assetId = assetOfItem.get(l.itemId);
    if (assetId) perAsset.set(assetId, (perAsset.get(assetId) ?? 0) + cost);
  }

  for (const e of expenses) {
    const amount = e.amount || 0;
    if (amount <= 0 || !inWindow(e.date)) continue;
    record('projects', e.date, amount);
    perProject.set(e.projectId, (perProject.get(e.projectId) ?? 0) + amount);
  }

  for (const l of invLogs) {
    // Only draws off the shelf count — a restock is stock moving, not burn.
    if (l.delta >= 0 || !inWindow(l.date)) continue;
    const cost = unitCost.get(l.itemId);
    if (cost == null || cost <= 0) continue;
    record('supplies', l.date, Math.abs(l.delta) * cost);
  }

  const upkeepTotal = perCategory.get('upkeep') ?? 0;
  const suppliesTotal = perCategory.get('supplies') ?? 0;
  const total = [...perCategory.values()].reduce((a, b) => a + b, 0);

  return {
    total,
    upkeepTotal,
    suppliesTotal,
    byAsset: [...perAsset.entries()]
      .map(([assetId, t]) => ({ assetId, name: assetName.get(assetId) ?? 'Unknown', total: t }))
      .sort((a, b) => b.total - a.total),
    byMonth: [...perMonth.entries()]
      .map(([month, t]) => ({ month, total: t }))
      .sort((a, b) => (a.month < b.month ? 1 : -1)),
    byCategory: (['upkeep', 'projects', 'supplies'] as Category[])
      .map((c) => ({ category: c, label: CATEGORY_LABELS[c], total: perCategory.get(c) ?? 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total),
    byProject: [...perProject.entries()]
      .map(([projectId, t]) => ({ projectId, name: projectName.get(projectId) ?? 'Unknown', total: t }))
      .sort((a, b) => b.total - a.total),
  };
}
