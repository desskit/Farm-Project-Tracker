/**
 * Spreadsheet (CSV) exports: one per kind of record, each gated by the
 * permission that already lets someone see those records in the app, and
 * limited to a date range.
 */
import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { can, type Cap } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';

type Dataset = { label: string; about: string; cap: Cap; query: (from: string, to: string) => SQL };

export const DATASETS = {
  'chore-completions': {
    label: 'Chores done', about: 'Every chore completion', cap: 'work.viewAll',
    query: (f, t) => sql`SELECT cc.date AS "Date", c.name AS "Chore", u.name AS "Done by", cc.notes AS "Notes"
      FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id LEFT JOIN users u ON u.id = cc.completed_by
      WHERE cc.date BETWEEN ${f} AND ${t} ORDER BY cc.date, c.name`,
  },
  'tasks-done': {
    label: 'Project tasks done', about: 'Finished project tasks', cap: 'work.viewAll',
    query: (f, t) => sql`SELECT pt.done_at AS "Date", p.name AS "Project", pt.title AS "Task", u.name AS "Done by"
      FROM project_tasks pt JOIN projects p ON p.id = pt.project_id LEFT JOIN users u ON u.id = pt.done_by
      WHERE pt.done = 1 AND pt.done_at BETWEEN ${f} AND ${t} ORDER BY pt.done_at`,
  },
  time: {
    label: 'Time worked', about: 'Timer entries, in minutes', cap: 'team.view',
    query: (f, t) => sql`SELECT date(te.start / 1000, 'unixepoch', 'localtime') AS "Date", u.name AS "Person", te.kind AS "Kind",
      COALESCE(c.name, pt.title, mi.name, '') AS "Item", round(te.seconds / 60.0, 1) AS "Minutes"
      FROM time_entries te JOIN users u ON u.id = te.user_id
      LEFT JOIN chores c ON te.kind = 'chore' AND c.id = te.ref_id
      LEFT JOIN project_tasks pt ON te.kind = 'task' AND pt.id = te.ref_id
      LEFT JOIN maintenance_items mi ON te.kind = 'maintenance' AND mi.id = te.ref_id
      WHERE te."end" IS NOT NULL AND date(te.start / 1000, 'unixepoch', 'localtime') BETWEEN ${f} AND ${t} ORDER BY te.start`,
  },
  upkeep: {
    label: 'Upkeep log', about: 'Service done on equipment', cap: 'farm.view',
    query: (f, t) => sql`SELECT ml.date AS "Date", a.name AS "Asset", mi.name AS "Service", ml.reading AS "Reading", ml.cost AS "Cost", u.name AS "By", ml.notes AS "Notes"
      FROM maintenance_logs ml JOIN maintenance_items mi ON mi.id = ml.item_id JOIN assets a ON a.id = mi.asset_id LEFT JOIN users u ON u.id = ml.user_id
      WHERE ml.date BETWEEN ${f} AND ${t} ORDER BY ml.date`,
  },
  supplies: {
    label: 'Supplies on hand', about: 'Current stock (ignores the dates)', cap: 'supplies.use',
    query: () => sql`SELECT name AS "Supply", category AS "Category", qty AS "On hand", unit AS "Unit", reorder_at AS "Reorder at", unit_cost AS "Cost per unit"
      FROM inventory ORDER BY category, name`,
  },
  'supply-log': {
    label: 'Supplies used & restocked', about: 'Every stock change', cap: 'supplies.use',
    query: (f, t) => sql`SELECT il.date AS "Date", i.name AS "Supply", il.delta AS "Change", i.unit AS "Unit", il.reason AS "Reason", u.name AS "By"
      FROM inventory_log il JOIN inventory i ON i.id = il.item_id LEFT JOIN users u ON u.id = il.user_id
      WHERE il.date BETWEEN ${f} AND ${t} ORDER BY il.date`,
  },
  expenses: {
    label: 'Project expenses', about: 'Spending logged on projects', cap: 'finance.view',
    query: (f, t) => sql`SELECT e.date AS "Date", p.name AS "Project", e.label AS "What", e.amount AS "Amount", u.name AS "By"
      FROM project_expenses e JOIN projects p ON p.id = e.project_id LEFT JOIN users u ON u.id = e.user_id
      WHERE e.date BETWEEN ${f} AND ${t} ORDER BY e.date`,
  },
  rent: {
    label: 'Rent & charges', about: 'Rent, utilities and late fees by due date', cap: 'finance.view',
    query: (f, t) => sql`SELECT rc.month AS "Month", rc.due_date AS "Due", COALESCE(ru.name, '') AS "Unit", u.name AS "Billed to", rc.kind AS "Kind",
      rc.label AS "Label", rc.amount AS "Amount", rc.status AS "Status", rc.marked_at AS "Marked paid", rc.verified_at AS "Confirmed"
      FROM rent_charges rc JOIN users u ON u.id = rc.user_id LEFT JOIN leases l ON l.id = rc.lease_id LEFT JOIN rental_units ru ON ru.id = l.unit_id
      WHERE rc.due_date BETWEEN ${f} AND ${t} ORDER BY rc.due_date, ru.name`,
  },
  sales: {
    label: 'Sales', about: 'What was sold, to whom, paid or owed', cap: 'finance.view',
    query: (f, t) => sql`SELECT s.date AS "Date", s.kind AS "Kind", s.item AS "What", s.qty AS "Amount", s.unit AS "Unit", s.amount AS "Total", s.buyer AS "Buyer",
      CASE WHEN s.paid THEN 'paid' ELSE 'owed' END AS "Status", COALESCE(g.name, lu.name, '') AS "From", u.name AS "Recorded by"
      FROM sales s LEFT JOIN animal_groups g ON g.id = s.group_id LEFT JOIN land_units lu ON lu.id = s.land_unit_id LEFT JOIN users u ON u.id = s.user_id
      WHERE s.date BETWEEN ${f} AND ${t} ORDER BY s.date`,
  },
  production: {
    label: 'Eggs, milk & wool', about: 'Daily production by group', cap: 'animals.view',
    query: (f, t) => sql`SELECT pl.date AS "Date", g.name AS "Group", pl.kind AS "Product", sum(pl.amount) AS "Amount"
      FROM production_logs pl JOIN animal_groups g ON g.id = pl.group_id
      WHERE pl.date BETWEEN ${f} AND ${t} GROUP BY pl.date, g.name, pl.kind ORDER BY pl.date, g.name`,
  },
  'animal-records': {
    label: 'Animal health & records', about: 'Treatments, weights, births, deaths, sales', cap: 'animals.view',
    query: (f, t) => sql`SELECT e.date AS "Date", g.name AS "Group", COALESCE(NULLIF(a.name, ''), a.tag, '') AS "Animal", e.type AS "Type",
      e.count_delta AS "Head change", COALESCE(i.name, '') AS "Product", e.qty_used AS "Amount used", e.weight AS "Weight",
      e.cost AS "Cost", e.meat_until AS "Meat withdrawal until", e.milk_until AS "Milk/egg withdrawal until", e.notes AS "Notes"
      FROM animal_events e JOIN animal_groups g ON g.id = e.group_id LEFT JOIN animals a ON a.id = e.animal_id LEFT JOIN inventory i ON i.id = e.inventory_id
      WHERE e.date BETWEEN ${f} AND ${t} ORDER BY e.date`,
  },
  harvests: {
    label: 'Harvests', about: 'What came off each bed, field and tree', cap: 'land.view',
    query: (f, t) => sql`SELECT h.date AS "Date", lu.name AS "Place", h.crop AS "Crop", h.amount AS "Amount", h.unit AS "Unit", u.name AS "By", h.notes AS "Notes"
      FROM harvests h JOIN land_units lu ON lu.id = h.unit_id LEFT JOIN users u ON u.id = h.user_id
      WHERE h.date BETWEEN ${f} AND ${t} ORDER BY h.date`,
  },
  'field-work': {
    label: 'Field work & sprays', about: 'Amendments, sprays (with harvest-from date), pruning…', cap: 'land.view',
    query: (f, t) => sql`SELECT le.date AS "Date", lu.name AS "Place", le.type AS "Work", COALESCE(i.name, '') AS "Product", le.qty_used AS "Amount",
      le.phi_until AS "Harvest from", le.cost AS "Cost", le.notes AS "Notes"
      FROM land_events le JOIN land_units lu ON lu.id = le.unit_id LEFT JOIN inventory i ON i.id = le.inventory_id
      WHERE le.date BETWEEN ${f} AND ${t} ORDER BY le.date`,
  },
} satisfies Record<string, Dataset>;

export type DatasetKey = keyof typeof DATASETS;
export function isDataset(k: string): k is DatasetKey {
  return k in DATASETS;
}

export function datasetsFor(viewer: SessionUser): { key: DatasetKey; label: string; about: string }[] {
  return (Object.keys(DATASETS) as DatasetKey[]).filter((k) => can(viewer, DATASETS[k].cap)).map((k) => ({ key: k, label: DATASETS[k].label, about: DATASETS[k].about }));
}

/** One CSV cell. Text that a spreadsheet would run as a formula is defused with a leading quote. */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function datasetCsv(key: DatasetKey, from: string, to: string): Promise<string> {
  const res = await db.run(DATASETS[key].query(from, to));
  const cols = res.columns;
  const lines = [cols.map(csvCell).join(',')];
  for (const row of res.rows) lines.push(cols.map((_, i) => csvCell(row[i])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`; // BOM so Excel reads accents correctly
}
