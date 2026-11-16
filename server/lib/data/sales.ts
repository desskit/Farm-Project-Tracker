/**
 * What the farm sells: eggs, milk, produce, animals, hay. Each sale can name
 * a buyer and whether it's been paid, and can be tied to the herd or ground
 * it came from (that's what profit-by-enterprise reads).
 *
 * Recording the farm's sales needs sales.log. Seeing everyone's sales and
 * the totals needs finance.view; without it a person sees only what they
 * recorded.
 *
 * Personal sales (one person selling to another: a firearm, a truck, tools)
 * can be recorded by anyone on the farm, with themselves as the seller. They
 * are private to the seller (the buyer sees a loan, if there is one) and are
 * never counted as the farm's: not in its totals, profit or tax pack.
 */
import 'server-only';
import { and, desc, eq, gte, lte, or } from 'drizzle-orm';
import { db } from '@/db';
import { animalGroups, landUnits, loans, sales, users, type SaleKind } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { cents } from '@/lib/domain/money';
import type { SessionUser } from '@/lib/auth/session';
import { publishChange } from '@/lib/realtime/bus';
import { logActivity } from './activity';
import { DataError } from './errors';
import { announceLoan, assertSaleDeletable, checkLoanTerms, loanRow, saleHasLoan, type LoanTerms } from './loans';

export type SaleRow = typeof sales.$inferSelect & { byName: string | null; groupName: string | null; unitName: string | null };

/**
 * The farm's sales this person may see (all of them with finance.view, else
 * the ones they recorded), plus their own personal sales.
 */
export async function listSales(viewer: SessionUser, opts: { from?: string; to?: string; owedOnly?: boolean } = {}): Promise<SaleRow[]> {
  const farmSales = can(viewer, 'finance.view') ? eq(sales.personal, false) : and(eq(sales.personal, false), eq(sales.userId, viewer.id));
  const where = [
    opts.from ? gte(sales.date, opts.from) : undefined,
    opts.to ? lte(sales.date, opts.to) : undefined,
    opts.owedOnly ? eq(sales.paid, false) : undefined,
    or(farmSales, and(eq(sales.personal, true), eq(sales.sellerId, viewer.id))),
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const rows = await db
    .select({ s: sales, byName: users.name, groupName: animalGroups.name, unitName: landUnits.name })
    .from(sales)
    .leftJoin(users, eq(users.id, sales.userId))
    .leftJoin(animalGroups, eq(animalGroups.id, sales.groupId))
    .leftJoin(landUnits, eq(landUnits.id, sales.landUnitId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(sales.date), desc(sales.createdAt))
    .limit(300);
  return rows.map((r) => ({ ...r.s, byName: r.byName, groupName: r.groupName, unitName: r.unitName }));
}

/** Totals for the farm's sales; personal sales in `rows` are left out. */
export function salesTotals(allRows: { amount: number; paid: boolean; kind: SaleKind; personal?: boolean }[]) {
  const rows = allRows.filter((r) => !r.personal);
  const byKind = new Map<SaleKind, number>();
  let total = 0;
  let owed = 0;
  for (const r of rows) {
    total += r.amount;
    if (!r.paid) owed += r.amount;
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + r.amount);
  }
  return { total: cents(total), owed: cents(owed), byKind: [...byKind.entries()].map(([kind, amount]) => ({ kind, amount: cents(amount) })).sort((a, b) => b.amount - a.amount) };
}

export type SaleInput = {
  date?: string; kind: SaleKind; item?: string; qty?: number | null; unit?: string; amount: number;
  buyer?: string; paid?: boolean; groupId?: string | null; landUnitId?: string | null; notes?: string;
  /** Your own name for what it is, e.g. "Firearms". */
  category?: string;
  serial?: string;
  /** Sold by the person recording it, not the farm. */
  personal?: boolean;
  /** Sold to someone on the farm, paid back in instalments. */
  loan?: LoanTerms | null;
};

export function canRecordFarmSales(user: SessionUser): boolean {
  return can(user, 'sales.log');
}

/** Anyone on the farm can record what they personally sold. */
export function canRecordPersonalSales(user: SessionUser): boolean {
  return can(user, 'farm.view');
}

export async function addSale(user: SessionUser, d: SaleInput): Promise<string> {
  const personal = !!d.personal;
  if (personal ? !canRecordPersonalSales(user) : !canRecordFarmSales(user)) throw new DataError(personal ? 'You can’t record sales.' : 'You can’t record the farm’s sales. You can record your own (personal) ones.', 403);
  if (!(d.amount > 0)) throw new DataError('Enter what it sold for.', 400);
  const date = d.date || todayISO();
  if (date > todayISO()) throw new DataError('That date hasn’t happened yet.', 400);
  const borrowerName = d.loan ? await checkLoanTerms(user, d.amount, date, d.loan, personal) : null;
  const paid = d.loan ? false : d.paid !== false;
  const id = uid('sl');
  const sale = db.insert(sales).values({
    id, date, kind: d.kind, item: d.item?.trim() ?? '', qty: d.qty ?? null, unit: d.unit?.trim() ?? '', amount: cents(d.amount),
    buyer: borrowerName ?? d.buyer?.trim() ?? '', paid, paidOn: paid ? date : null,
    // A personal sale isn't from the farm's herds or ground.
    groupId: personal ? null : d.groupId || null, landUnitId: personal ? null : d.landUnitId || null,
    notes: d.notes?.trim() ?? '', userId: user.id,
    category: d.category?.trim().slice(0, 40) ?? '', serial: d.serial?.trim().slice(0, 80) ?? '',
    personal, sellerId: personal ? user.id : null,
  });
  if (d.loan) {
    const row = loanRow(user, id, d.amount, d.loan);
    await db.batch([sale, db.insert(loans).values(row)]);
    await announceLoan(user, d.loan.borrowerId, d.item?.trim() || d.category?.trim() || d.kind, cents(d.amount), row.id, personal);
  } else {
    await sale;
  }
  // Personal sales are nobody else's business.
  if (!personal) await logActivity(user.id, `recorded a sale: ${d.item?.trim() || d.category?.trim() || d.kind}`, { audience: 'finance.view', href: '/more/sales' });
  publishChange('sales');
  return id;
}

async function mine(user: SessionUser, id: string) {
  const [s] = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
  if (!s || (s.personal && s.sellerId !== user.id)) throw new DataError('No such sale.', 404);
  if (!s.personal && s.userId !== user.id && !can(user, 'finance.manage')) throw new DataError('Only whoever recorded it, or a manager, can change this sale.', 403);
  return s;
}

/** One sale with what a bill of sale needs, for whoever may see it (else "not found"). */
export async function saleForViewer(viewer: SessionUser, id: string) {
  const [row] = await db.select({ s: sales, byName: users.name }).from(sales).leftJoin(users, eq(users.id, sales.userId)).where(eq(sales.id, id)).limit(1);
  if (!row) throw new DataError('No such sale.', 404);
  const s = row.s;
  const [loan] = await db.select().from(loans).where(eq(loans.saleId, id)).limit(1);
  const isBorrower = !!loan && loan.borrowerId === viewer.id;
  const allowed = s.personal
    ? s.sellerId === viewer.id || isBorrower
    : can(viewer, 'finance.view') || s.userId === viewer.id || isBorrower;
  if (!allowed) throw new DataError('No such sale.', 404);
  const [seller] = s.sellerId ? await db.select({ name: users.name }).from(users).where(eq(users.id, s.sellerId)).limit(1) : [];
  return { sale: s, recordedBy: row.byName, sellerName: s.personal ? seller?.name ?? 'Former member' : null, loanId: loan?.id ?? null };
}

export async function setSalePaid(user: SessionUser, id: string, paid: boolean): Promise<void> {
  await mine(user, id);
  if (await saleHasLoan(id)) throw new DataError('This sale is paid off through its loan: record payments on the loan.', 409);
  await db.update(sales).set({ paid, paidOn: paid ? todayISO() : null }).where(eq(sales.id, id));
  publishChange('sales');
}

export async function deleteSale(user: SessionUser, id: string): Promise<void> {
  const s = await mine(user, id);
  if (s.animalEventId) throw new DataError('This came from an animal sale — remove that entry on the animals’ page instead.', 409);
  await assertSaleDeletable(id);
  await db.delete(sales).where(eq(sales.id, id));
  publishChange('sales');
}
