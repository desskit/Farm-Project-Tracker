/**
 * Profit by enterprise: what each herd, each garden / orchard / field, the
 * rentals and the general farm brought in and cost over a period.
 *
 *  Income:  sales tied to a group or place; confirmed rent and other tenant
 *           charges for Rentals; anything untied under General.
 *  Costs:   event costs (vet, purchases, field work), supplies **used** priced
 *           at their cost per unit and charged to what they were used on,
 *           equipment upkeep and project spending (General), and the farm's
 *           own share of rental utility bills.
 *
 * This is "what was used", the management view. The tax pack is "what was
 * paid" (see app/api/data/tax-pack).
 */
import 'server-only';
import { and, eq, gte, isNotNull, lt, lte, ne } from 'drizzle-orm';
import { db } from '@/db';
import {
  animalEvents, animalGroups, inventory, inventoryLog, landEvents, landUnits, maintenanceLogs, productionLogs, projectExpenses,
  rentCharges, sales, utilityBills,
} from '@/db/schema';
import { cents, unitCost } from '@/lib/domain/money';

export type CostLine = { label: string; amount: number };
export type Enterprise = {
  key: string;
  name: string;
  kind: 'animals' | 'land' | 'rentals' | 'general';
  href: string | null;
  income: number;
  costs: number;
  net: number;
  lines: CostLine[];
  /** e.g. "$2.10 per dozen eggs". */
  unit: string | null;
};
export type ProfitReport = { from: string; to: string; rows: Enterprise[]; income: number; costs: number; net: number };

export async function profitReport(from: string, to: string): Promise<ProfitReport> {
  const [groups, units, saleRows, aCosts, lCosts, draws, inv, upkeep, projects, rent, bills, prod] = await Promise.all([
    db.select({ id: animalGroups.id, name: animalGroups.name }).from(animalGroups),
    db.select({ id: landUnits.id, name: landUnits.name, parentId: landUnits.parentId }).from(landUnits),
    db.select().from(sales).where(and(gte(sales.date, from), lte(sales.date, to))),
    db.select({ groupId: animalEvents.groupId, cost: animalEvents.cost }).from(animalEvents).where(and(isNotNull(animalEvents.cost), ne(animalEvents.type, 'sale'), gte(animalEvents.date, from), lte(animalEvents.date, to))),
    db.select({ unitId: landEvents.unitId, cost: landEvents.cost }).from(landEvents).where(and(isNotNull(landEvents.cost), gte(landEvents.date, from), lte(landEvents.date, to))),
    db.select({ itemId: inventoryLog.itemId, delta: inventoryLog.delta, refType: inventoryLog.refType, refId: inventoryLog.refId }).from(inventoryLog).where(and(lt(inventoryLog.delta, 0), gte(inventoryLog.date, from), lte(inventoryLog.date, to))),
    db.select({ id: inventory.id, unitCost: inventory.unitCost }).from(inventory),
    db.select({ cost: maintenanceLogs.cost }).from(maintenanceLogs).where(and(gte(maintenanceLogs.date, from), lte(maintenanceLogs.date, to))),
    db.select({ amount: projectExpenses.amount }).from(projectExpenses).where(and(gte(projectExpenses.date, from), lte(projectExpenses.date, to))),
    db.select({ amount: rentCharges.amount }).from(rentCharges).where(and(eq(rentCharges.status, 'verified'), gte(rentCharges.verifiedAt, from), lte(rentCharges.verifiedAt, to))),
    db.select({ amount: utilityBills.amount, chargeId: utilityBills.chargeId, billed: rentCharges.amount }).from(utilityBills).leftJoin(rentCharges, eq(rentCharges.id, utilityBills.chargeId)).where(and(gte(utilityBills.period, from.slice(0, 7)), lte(utilityBills.period, to.slice(0, 7)))),
    db.select({ groupId: productionLogs.groupId, kind: productionLogs.kind, amount: productionLogs.amount }).from(productionLogs).where(and(gte(productionLogs.date, from), lte(productionLogs.date, to))),
  ]);

  const rows = new Map<string, Enterprise & { parts: Map<string, number> }>();
  const get = (key: string, name: string, kind: Enterprise['kind'], href: string | null) => {
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { key, name, kind, href, income: 0, costs: 0, net: 0, lines: [], unit: null, parts: new Map() }));
    return r;
  };
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  // A bed's money belongs to its garden; a paddock's to its pasture.
  const top = (id: string) => {
    let u = unitById.get(id);
    while (u?.parentId && unitById.get(u.parentId)) u = unitById.get(u.parentId);
    return u;
  };
  const forGroup = (id: string | null) => (id && groupName.has(id) ? get(`g:${id}`, groupName.get(id)!, 'animals', `/farm/animals/${id}`) : null);
  const forUnit = (id: string | null) => {
    const u = id ? top(id) : undefined;
    return u ? get(`u:${u.id}`, u.name, 'land', `/farm/land/${u.id}`) : null;
  };
  const general = () => get('general', 'Equipment & general', 'general', null);
  const rentals = () => get('rentals', 'Rentals', 'rentals', '/more/rentals');
  const cost = (r: ReturnType<typeof get>, label: string, amount: number) => {
    if (!(amount > 0)) return;
    r.costs += amount;
    r.parts.set(label, (r.parts.get(label) ?? 0) + amount);
  };

  for (const s of saleRows) (forGroup(s.groupId) ?? forUnit(s.landUnitId) ?? general()).income += s.amount;
  for (const e of aCosts) cost(forGroup(e.groupId) ?? general(), 'Vet, treatments & purchases', e.cost ?? 0);
  for (const e of lCosts) cost(forUnit(e.unitId) ?? general(), 'Field work', e.cost ?? 0);
  const price = new Map(inv.map((i) => [i.id, i.unitCost]));
  for (const d of draws) {
    const amount = Math.abs(d.delta) * (price.get(d.itemId) ?? 0);
    const r = d.refType === 'animal_group' ? forGroup(d.refId) : d.refType === 'land_unit' ? forUnit(d.refId) : null;
    cost(r ?? general(), r ? 'Feed & supplies used' : 'Supplies used (not tied to a herd or bed)', amount);
  }
  for (const u of upkeep) cost(general(), 'Equipment upkeep', u.cost ?? 0);
  for (const p of projects) cost(general(), 'Projects', p.amount ?? 0);
  if (rent.length || bills.length) {
    rentals().income += rent.reduce((n, c) => n + c.amount, 0);
    cost(rentals(), 'Utilities (farm’s share)', bills.reduce((n, b) => n + Math.max(0, b.amount - (b.chargeId ? b.billed ?? 0 : 0)), 0));
  }

  // Cost per dozen / per lb for groups that produce.
  for (const g of groups) {
    const r = rows.get(`g:${g.id}`);
    if (!r) continue;
    const eggs = prod.filter((p) => p.groupId === g.id && p.kind === 'eggs').reduce((n, p) => n + p.amount, 0);
    const milk = prod.filter((p) => p.groupId === g.id && p.kind === 'milk').reduce((n, p) => n + p.amount, 0);
    const perDozen = unitCost(r.costs, eggs / 12);
    const perLb = unitCost(r.costs, milk);
    r.unit = perDozen != null ? `$${perDozen.toFixed(2)} per dozen eggs (${Math.round(eggs)} eggs)` : perLb != null ? `$${perLb.toFixed(2)} per lb of milk (${Math.round(milk)} lb)` : null;
  }

  const out: Enterprise[] = [...rows.values()]
    .map(({ parts, ...r }) => ({
      ...r,
      income: cents(r.income), costs: cents(r.costs), net: cents(r.income - r.costs),
      lines: [...parts.entries()].map(([label, amount]) => ({ label, amount: cents(amount) })).sort((a, b) => b.amount - a.amount),
    }))
    .filter((r) => r.income > 0 || r.costs > 0)
    .sort((a, b) => b.net - a.net);
  const income = cents(out.reduce((n, r) => n + r.income, 0));
  const costs = cents(out.reduce((n, r) => n + r.costs, 0));
  return { from, to, rows: out, income, costs, net: cents(income - costs) };
}
