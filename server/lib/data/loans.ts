/**
 * Loans: a sale to someone on the farm, paid back in set instalments with
 * no interest.
 *
 * Who handles a loan (sets it up, confirms payments, cancels it) depends on
 * who sold the thing:
 *  - a farm sale: people with finance.manage; people with finance.view see
 *    every farm loan;
 *  - a personal sale (one person selling to another): the seller alone. Nobody
 *    else on the farm sees it, managers included.
 * The borrower always sees their own loans and marks payments ("I paid").
 * The sale stays "owed" until confirmed payments cover it, then it is marked
 * paid on the day the last payment is confirmed.
 */
import 'server-only';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { loanPayments, loans, sales, users } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { cents, saleKindLabel } from '@/lib/domain/money';
import { MAX_INSTALMENTS, instalmentCount, loanSchedule, loanState, type LoanEvery, type LoanState } from '@/lib/domain/loans';
import type { SessionUser } from '@/lib/auth/session';
import { publishChange } from '@/lib/realtime/bus';
import { pushToPeople } from '@/lib/notify/events';
import { logActivity } from './activity';
import { DataError } from './errors';
import { recipientsWith } from './recipients';

export type LoanTerms = { borrowerId: string; instalment: number; every: LoanEvery; firstDue: string };

/** People a loan can be made to: everyone active on the farm. */
export async function loanBorrowers(): Promise<{ id: string; name: string }[]> {
  return (await recipientsWith('farm.view')).map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Checks the terms and returns the borrower's name. Throws a friendly error when something's off. */
export async function checkLoanTerms(user: SessionUser, amount: number, saleDate: string, t: LoanTerms, personal = false): Promise<string> {
  if (!personal && !can(user, 'finance.manage')) throw new DataError('Only someone who handles the farm’s money can set up a loan on a farm sale.', 403);
  if (personal && t.borrowerId === user.id) throw new DataError('You can’t lend to yourself.', 400);
  const borrower = (await loanBorrowers()).find((b) => b.id === t.borrowerId);
  if (!borrower) throw new DataError('Pick someone on the farm to lend to.', 400);
  if (!(t.instalment > 0)) throw new DataError('Enter how much each payment is.', 400);
  if (t.firstDue < saleDate) throw new DataError('The first payment can’t be before the sale.', 400);
  if (instalmentCount(amount, t.instalment) > MAX_INSTALMENTS) throw new DataError(`That’s more than ${MAX_INSTALMENTS} payments. Make each payment bigger.`, 400);
  return borrower.name;
}

/** The row to insert alongside the sale (same batch, so neither exists without the other). */
export function loanRow(user: SessionUser, saleId: string, amount: number, t: LoanTerms) {
  return { id: uid('ln'), saleId, borrowerId: t.borrowerId, principal: cents(amount), instalment: cents(Math.min(t.instalment, amount)), every: t.every, firstDue: t.firstDue, createdBy: user.id };
}

/** After a loan sale is saved: tell the borrower. */
export async function announceLoan(user: SessionUser, borrowerId: string, item: string, amount: number, loanId: string, personal = false): Promise<void> {
  if (!personal) await logActivity(user.id, `set up a loan for ${item}`, { audience: 'finance.view', href: `/more/loans/${loanId}` });
  await pushToPeople([borrowerId], { title: personal ? `${user.name} set up a payment plan` : 'New loan', body: `${item}: $${amount.toFixed(2)}, paid back over time.`, url: `/more/loans/${loanId}` }, user.id);
}

type LoanRow = typeof loans.$inferSelect;
type PaymentRow = typeof loanPayments.$inferSelect & { markedByName: string | null };

export type LoanView = LoanRow & {
  item: string;
  serial: string;
  saleDate: string;
  borrowerName: string;
  /** A personal sale: the seller, not the farm, handles the loan. */
  personal: boolean;
  sellerId: string | null;
  /** "The farm" or the person who sold it. */
  sellerName: string;
  state: LoanState;
  pending: PaymentRow[];
  payments: PaymentRow[];
};

async function hydrate(rows: LoanRow[], today: string): Promise<LoanView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [saleRows, pays, people] = await Promise.all([
    db.select({ id: sales.id, item: sales.item, kind: sales.kind, category: sales.category, serial: sales.serial, date: sales.date, personal: sales.personal, sellerId: sales.sellerId })
      .from(sales).where(inArray(sales.id, rows.map((r) => r.saleId))),
    db.select().from(loanPayments).where(inArray(loanPayments.loanId, ids)).orderBy(desc(loanPayments.date), desc(loanPayments.createdAt)),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const name = new Map(people.map((p) => [p.id, p.name]));
  const sale = new Map(saleRows.map((s) => [s.id, s]));
  return rows.map((l) => {
    const mine = pays.filter((p) => p.loanId === l.id).map((p) => ({ ...p, markedByName: p.markedBy ? name.get(p.markedBy) ?? null : null }));
    const confirmed = mine.filter((p) => p.status === 'confirmed');
    const s = sale.get(l.saleId);
    const personal = !!s?.personal;
    return {
      ...l,
      item: s?.item || (s ? saleKindLabel(s) : 'Sale'),
      serial: s?.serial ?? '',
      saleDate: s?.date ?? '',
      borrowerName: l.borrowerId ? name.get(l.borrowerId) ?? 'Someone' : 'Someone no longer here',
      personal,
      sellerId: personal ? s?.sellerId ?? null : null,
      sellerName: personal ? (s?.sellerId && name.get(s.sellerId)) || 'Someone no longer here' : 'The farm',
      state: loanState(loanSchedule(l.principal, l.instalment, l.every, l.firstDue), confirmed.reduce((a, p) => a + p.amount, 0), today),
      pending: mine.filter((p) => p.status === 'pending'),
      payments: confirmed,
    };
  });
}

/** Whether this person handles the loan: confirms payments, records cash, cancels it. */
export function handlesLoan(viewer: SessionUser, l: Pick<LoanView, 'personal' | 'sellerId'>): boolean {
  return l.personal ? l.sellerId === viewer.id : can(viewer, 'finance.manage');
}

function mayView(viewer: SessionUser, l: Pick<LoanView, 'personal' | 'sellerId' | 'borrowerId'>): boolean {
  if (l.borrowerId === viewer.id) return true;
  return l.personal ? l.sellerId === viewer.id : can(viewer, 'finance.view');
}

/** Loans this person may see: theirs to repay, their personal sales, and (with finance.view) the farm's. */
export async function listLoans(viewer: SessionUser, today = todayISO()): Promise<LoanView[]> {
  const mySales = db.select({ id: sales.id }).from(sales).where(and(eq(sales.personal, true), eq(sales.sellerId, viewer.id)));
  const farmSales = db.select({ id: sales.id }).from(sales).where(eq(sales.personal, false));
  const rows = await db.select().from(loans)
    .where(or(eq(loans.borrowerId, viewer.id), inArray(loans.saleId, mySales), can(viewer, 'finance.view') ? inArray(loans.saleId, farmSales) : undefined))
    .orderBy(desc(loans.createdAt));
  return (await hydrate(rows, today)).filter((l) => mayView(viewer, l));
}

export async function hasLoans(viewer: SessionUser): Promise<boolean> {
  if (can(viewer, 'finance.view')) return true;
  return (await listLoans(viewer)).length > 0;
}

/** One loan, for its borrower or whoever may see it. Anyone else gets "not found". */
export async function loanForViewer(viewer: SessionUser, id: string, today = todayISO()): Promise<LoanView> {
  const [l] = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
  const view = l ? (await hydrate([l], today))[0] : null;
  if (!view || !mayView(viewer, view)) throw new DataError('No such loan.', 404);
  return view;
}

/** Who to tell about a loan's payments: the seller of a personal sale, else the farm's money managers. */
async function handlersOf(l: Pick<LoanView, 'personal' | 'sellerId'>): Promise<string[]> {
  if (l.personal) return l.sellerId ? [l.sellerId] : [];
  return (await recipientsWith('finance.manage')).map((m) => m.id);
}

/** "I paid": the borrower records a payment for confirmation. A payment the handler takes in person counts straight away. */
export async function markLoanPayment(user: SessionUser, loanId: string, d: { amount: number; date?: string; note?: string }): Promise<string> {
  const loan = await loanForViewer(user, loanId);
  const handler = handlesLoan(user, loan);
  if (loan.borrowerId !== user.id && !handler) throw new DataError('Only the borrower can mark a payment.', 403);
  if (loan.status === 'paid') throw new DataError('This loan is already paid off.', 400);
  const date = d.date || todayISO();
  if (date > todayISO()) throw new DataError('That date hasn’t happened yet.', 400);
  const amount = cents(d.amount);
  const waiting = cents(loan.pending.reduce((a, p) => a + p.amount, 0));
  const room = cents(loan.state.balance - waiting);
  if (!(amount > 0)) throw new DataError('Enter how much was paid.', 400);
  if (amount > room) throw new DataError(room > 0 ? `Only $${room.toFixed(2)} is left to pay${waiting ? ' after the payments waiting to be confirmed' : ''}.` : 'The rest is already waiting to be confirmed.', 400);
  const id = uid('lp');
  const autoConfirm = handler && loan.borrowerId !== user.id;
  await db.insert(loanPayments).values({
    id, loanId, date, amount, note: d.note?.trim() ?? '', markedBy: user.id,
    status: autoConfirm ? 'confirmed' : 'pending', confirmedBy: autoConfirm ? user.id : null, confirmedAt: autoConfirm ? Date.now() : null,
  });
  if (autoConfirm) {
    await settle(loanId);
    if (loan.borrowerId) await pushToPeople([loan.borrowerId], { title: 'Loan payment recorded', body: `$${amount.toFixed(2)} toward ${loan.item}.`, url: `/more/loans/${loanId}` }, user.id);
  } else {
    await pushToPeople(await handlersOf(loan), { title: 'Loan payment to confirm', body: `${user.name} paid $${amount.toFixed(2)} toward ${loan.item}.`, url: `/more/loans/${loanId}` }, user.id);
  }
  publishChange('sales');
  return id;
}

async function paymentOr404(viewer: SessionUser, id: string) {
  const [p] = await db.select().from(loanPayments).where(eq(loanPayments.id, id)).limit(1);
  if (!p) throw new DataError('No such payment.', 404);
  const loan = await loanForViewer(viewer, p.loanId).catch(() => null);
  if (!loan) throw new DataError('No such payment.', 404);
  return { p, loan };
}

/** Marks the loan (and its sale) paid off once confirmed payments cover it, or reopens both if they no longer do. */
async function settle(loanId: string): Promise<void> {
  const [l] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!l) return;
  const confirmed = await db.select({ amount: loanPayments.amount }).from(loanPayments).where(and(eq(loanPayments.loanId, loanId), eq(loanPayments.status, 'confirmed')));
  const paid = cents(confirmed.reduce((a, p) => a + p.amount, 0));
  const done = paid >= cents(l.principal);
  const today = todayISO();
  if (done && l.status !== 'paid') {
    await db.batch([
      db.update(loans).set({ status: 'paid', paidOffOn: today }).where(eq(loans.id, loanId)),
      db.update(sales).set({ paid: true, paidOn: today }).where(eq(sales.id, l.saleId)),
    ]);
  } else if (!done && l.status === 'paid') {
    await db.batch([
      db.update(loans).set({ status: 'active', paidOffOn: null }).where(eq(loans.id, loanId)),
      db.update(sales).set({ paid: false, paidOn: null }).where(eq(sales.id, l.saleId)),
    ]);
  }
}

export async function confirmLoanPayment(user: SessionUser, paymentId: string): Promise<void> {
  const { p, loan } = await paymentOr404(user, paymentId);
  if (!handlesLoan(user, loan)) throw new DataError(loan.personal ? 'Only the seller can confirm payments.' : 'Only someone who handles the farm’s money can confirm payments.', 403);
  if (p.status === 'confirmed') return;
  await db.update(loanPayments).set({ status: 'confirmed', confirmedBy: user.id, confirmedAt: Date.now() }).where(eq(loanPayments.id, paymentId));
  await settle(loan.id);
  const [after] = await db.select({ status: loans.status }).from(loans).where(eq(loans.id, loan.id)).limit(1);
  if (loan.borrowerId) {
    await pushToPeople([loan.borrowerId], after?.status === 'paid'
      ? { title: 'Loan paid off', body: 'Your last payment is confirmed. Thank you!', url: `/more/loans/${loan.id}` }
      : { title: 'Payment confirmed', body: `$${p.amount.toFixed(2)} received.`, url: `/more/loans/${loan.id}` }, user.id);
  }
  publishChange('sales');
}

/**
 * Takes a payment off the loan. A waiting payment can be withdrawn by whoever
 * marked it, or turned down by whoever handles the loan; a confirmed one only
 * by whoever handles it (a mistake), which reopens the loan if it had been
 * paid off.
 */
export async function deleteLoanPayment(user: SessionUser, paymentId: string): Promise<void> {
  const { p, loan } = await paymentOr404(user, paymentId);
  const handler = handlesLoan(user, loan);
  if (p.status === 'confirmed' ? !handler : !(handler || p.markedBy === user.id)) {
    throw new DataError(p.status === 'confirmed' ? 'Only whoever handles this loan can remove a confirmed payment.' : 'Only whoever marked it can withdraw this payment.', 403);
  }
  await db.delete(loanPayments).where(eq(loanPayments.id, paymentId));
  if (p.status === 'confirmed') await settle(loan.id);
  else if (handler && p.markedBy !== user.id && p.markedBy) {
    await pushToPeople([p.markedBy], { title: 'Payment not confirmed', body: `The $${p.amount.toFixed(2)} payment you marked wasn’t confirmed. Talk to ${loan.personal ? loan.sellerName : 'whoever handles the money'}.`, url: `/more/loans/${loan.id}` }, user.id);
  }
  publishChange('sales');
}

/** Undo a loan set up by mistake. Only while nothing has been paid; the sale stays, as owed. */
export async function cancelLoan(user: SessionUser, loanId: string): Promise<void> {
  const loan = await loanForViewer(user, loanId);
  if (!handlesLoan(user, loan)) throw new DataError(loan.personal ? 'Only the seller can cancel this loan.' : 'Only someone who handles the farm’s money can cancel a loan.', 403);
  if (loan.payments.length > 0) throw new DataError('Payments have already been made on this loan, so it can’t be cancelled.', 409);
  await db.delete(loans).where(eq(loans.id, loanId));
  publishChange('sales');
}

/** For the sales list: which sales are loans, and what's left on each. */
export async function loanSummaryForSales(saleIds: string[], today = todayISO()): Promise<Map<string, { loanId: string; balance: number; late: boolean }>> {
  if (!saleIds.length) return new Map();
  const rows = await db.select().from(loans).where(inArray(loans.saleId, saleIds));
  const views = await hydrate(rows, today);
  return new Map(views.map((v) => [v.saleId, { loanId: v.id, balance: v.state.balance, late: v.state.overdue > 0 }]));
}

/** Farm-loan payments waiting for a money manager to confirm (Today's tile). Personal loans are their sellers' business. */
export async function loanPaymentsToConfirm(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(loanPayments)
    .innerJoin(loans, eq(loans.id, loanPayments.loanId)).innerJoin(sales, eq(sales.id, loans.saleId))
    .where(and(eq(loanPayments.status, 'pending'), eq(sales.personal, false)));
  return Number(r?.n ?? 0);
}

/** For a sale with a loan: whether it may be deleted (only while nothing has been paid on it). */
export async function assertSaleDeletable(saleId: string): Promise<void> {
  const [l] = await db.select({ id: loans.id }).from(loans).where(eq(loans.saleId, saleId)).limit(1);
  if (!l) return;
  const [paid] = await db.select({ n: sql<number>`count(*)` }).from(loanPayments).where(and(eq(loanPayments.loanId, l.id), eq(loanPayments.status, 'confirmed')));
  if (Number(paid?.n ?? 0) > 0) throw new DataError('Payments have been made on this sale’s loan, so it can’t be deleted.', 409);
}

export async function saleHasLoan(saleId: string): Promise<boolean> {
  const [l] = await db.select({ id: loans.id }).from(loans).where(eq(loans.saleId, saleId)).limit(1);
  return !!l;
}

/** Every active loan, for the reminder job only (it decides who hears about each). */
export async function activeLoansForReminders(today = todayISO()): Promise<LoanView[]> {
  return hydrate(await db.select().from(loans).where(eq(loans.status, 'active')), today);
}

export { handlersOf as loanHandlers };
