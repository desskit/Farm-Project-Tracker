/**
 * The tax-year pack: one download with what came in, what was **paid** out,
 * and the receipts on file — for the accountant or the shoebox.
 *
 * Paid basis, unlike the Profit and Spending screens (which count supplies
 * as they're used): a bag of feed is an expense here the day it was bought.
 * Supplies only show up if a price was entered when restocking.
 */
import 'server-only';
import path from 'node:path';
import { and, eq, gt, gte, isNotNull, lte, ne } from 'drizzle-orm';
import { db } from '@/db';
import {
  animalEvents, animalGroups, assetDocs, assets, attachments, inventory, inventoryLog, landEvents, landUnits, maintenanceItems, maintenanceLogs,
  projectExpenses, projects, rentCharges, rentalUnits, sales, users, utilityAccounts, utilityBills,
} from '@/db/schema';
import { SALE_KIND_LABEL } from '@/lib/domain/money';
import { UTILITY_LABEL } from '@/lib/domain/rentals';
import { csvCell } from './csv';
import type { TarEntry } from './tar';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const csv = (head: string[], rows: unknown[][]) => `﻿${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
const safe = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'receipt';

export type TaxPack = { income: number; expenses: number; receipts: number; entries: TarEntry[] };

export async function taxPack(year: number): Promise<TaxPack> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const inYear = <T extends { date: string }>(r: T) => r.date >= from && r.date <= to;

  const [saleRows, rent, buys, upkeep, projs, aCosts, lCosts, bills, receiptDocs] = await Promise.all([
    db.select().from(sales).where(and(gte(sales.date, from), lte(sales.date, to))),
    db.select({ date: rentCharges.verifiedAt, tenant: users.name, kind: rentCharges.kind, label: rentCharges.label, month: rentCharges.month, amount: rentCharges.amount })
      .from(rentCharges).innerJoin(users, eq(users.id, rentCharges.userId))
      .where(and(eq(rentCharges.status, 'verified'), gte(rentCharges.verifiedAt, from), lte(rentCharges.verifiedAt, to))),
    db.select({ date: inventoryLog.date, name: inventory.name, vendor: inventoryLog.vendor, cost: inventoryLog.cost, qty: inventoryLog.delta, unit: inventory.unit })
      .from(inventoryLog).innerJoin(inventory, eq(inventory.id, inventoryLog.itemId)).where(and(gt(inventoryLog.delta, 0), isNotNull(inventoryLog.cost))),
    db.select({ date: maintenanceLogs.date, cost: maintenanceLogs.cost, item: maintenanceItems.name, asset: assets.name, photoId: maintenanceLogs.photoId })
      .from(maintenanceLogs).innerJoin(maintenanceItems, eq(maintenanceItems.id, maintenanceLogs.itemId)).innerJoin(assets, eq(assets.id, maintenanceItems.assetId)).where(gt(maintenanceLogs.cost, 0)),
    db.select({ date: projectExpenses.date, label: projectExpenses.label, amount: projectExpenses.amount, project: projects.name, photoId: projectExpenses.photoId })
      .from(projectExpenses).innerJoin(projects, eq(projects.id, projectExpenses.projectId)),
    db.select({ date: animalEvents.date, type: animalEvents.type, cost: animalEvents.cost, group: animalGroups.name, notes: animalEvents.notes })
      .from(animalEvents).innerJoin(animalGroups, eq(animalGroups.id, animalEvents.groupId)).where(and(isNotNull(animalEvents.cost), ne(animalEvents.type, 'sale'))),
    db.select({ date: landEvents.date, type: landEvents.type, cost: landEvents.cost, place: landUnits.name, notes: landEvents.notes })
      .from(landEvents).innerJoin(landUnits, eq(landUnits.id, landEvents.unitId)).where(isNotNull(landEvents.cost)),
    db.select({ period: utilityBills.period, amount: utilityBills.amount, kind: utilityAccounts.kind, unit: rentalUnits.name })
      .from(utilityBills).innerJoin(utilityAccounts, eq(utilityAccounts.id, utilityBills.accountId)).innerJoin(rentalUnits, eq(rentalUnits.id, utilityAccounts.unitId)),
    db.select({ date: assetDocs.date, name: assetDocs.name, attachmentId: assetDocs.attachmentId, asset: assets.name })
      .from(assetDocs).innerJoin(assets, eq(assets.id, assetDocs.assetId)).where(eq(assetDocs.docType, 'receipt')),
  ]);

  const income: unknown[][] = [
    ...saleRows.map((s) => [s.date, 'Sales', SALE_KIND_LABEL[s.kind], s.item, s.buyer, s.amount, s.paid ? 'paid' : 'OWED']),
    ...rent.map((r) => [r.date, 'Rental income', r.kind === 'rent' ? `Rent ${r.month}` : r.label || r.kind, '', r.tenant, r.amount, 'paid']),
  ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const expenses: unknown[][] = [
    ...buys.filter(inYear).map((b) => [b.date, 'Supplies bought', `${b.qty} ${b.unit} ${b.name}`, b.vendor ?? '', b.cost]),
    ...upkeep.filter(inYear).map((u) => [u.date, 'Equipment upkeep', `${u.asset}: ${u.item}`, '', u.cost]),
    ...projs.filter(inYear).map((p) => [p.date, 'Projects', `${p.project}: ${p.label}`, '', p.amount]),
    ...aCosts.filter(inYear).map((e) => [e.date, 'Animals', `${e.group}: ${e.type}${e.notes ? ` — ${e.notes}` : ''}`, '', e.cost]),
    ...lCosts.filter(inYear).map((e) => [e.date, 'Field work', `${e.place}: ${e.type}${e.notes ? ` — ${e.notes}` : ''}`, '', e.cost]),
    ...bills.filter((b) => b.period.startsWith(String(year))).map((b) => [`${b.period}-01`, 'Rental utilities', `${b.unit}: ${UTILITY_LABEL[b.kind]} ${b.period}`, '', b.amount]),
  ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  // Receipts: photos on project expenses and paid service logs, and documents filed as receipts.
  const wanted = [
    ...projs.filter(inYear).filter((p) => p.photoId).map((p) => ({ id: p.photoId!, label: `${p.date}_${safe(`${p.project}-${p.label}`)}` })),
    ...upkeep.filter(inYear).filter((u) => u.photoId).map((u) => ({ id: u.photoId!, label: `${u.date}_${safe(`${u.asset}-${u.item}`)}` })),
    ...receiptDocs.filter(inYear).map((d) => ({ id: d.attachmentId, label: `${d.date}_${safe(`${d.asset}-${d.name}`)}` })),
  ];
  const files = wanted.length ? await db.select({ id: attachments.id, path: attachments.path }).from(attachments) : [];
  const pathById = new Map(files.map((f) => [f.id, f.path]));
  const receipts: TarEntry[] = wanted
    .filter((w) => pathById.has(w.id))
    .map((w, i) => ({ name: `receipts/${w.label}_${i + 1}${path.extname(pathById.get(w.id)!) || '.jpg'}`, path: path.join(UPLOAD_DIR, pathById.get(w.id)!) }));

  const sum = (rows: unknown[][], col: number) => Math.round(rows.reduce((n, r) => n + Number(r[col] ?? 0), 0) * 100) / 100;
  const totalIn = sum(income, 5);
  const totalOut = sum(expenses, 4);
  const readme = [
    `Farm records for ${year}`,
    '',
    `income.csv    money in: sales and rental income received        total $${totalIn.toFixed(2)}`,
    `expenses.csv  money paid out, by category                        total $${totalOut.toFixed(2)}`,
    `receipts/     ${receipts.length} receipt file(s) from project expenses, paid services and filed receipts`,
    '',
    'Notes',
    '- Expenses are what was PAID in the year. Supplies appear only where a price was entered when restocking.',
    '- Rental income is counted on the day it was confirmed received. Utility bills are listed in full;',
    '  the share tenants paid back appears in income.csv.',
    '- Sales marked OWED have not been paid yet.',
    '- This is a record, not tax advice.',
    '',
  ].join('\r\n');

  return {
    income: totalIn, expenses: totalOut, receipts: receipts.length,
    entries: [
      { name: 'README.txt', content: readme },
      { name: 'income.csv', content: csv(['Date', 'Category', 'What', 'Detail', 'From', 'Amount', 'Status'], income) },
      { name: 'expenses.csv', content: csv(['Date', 'Category', 'What', 'Paid to', 'Amount'], expenses) },
      ...receipts,
    ],
  };
}
