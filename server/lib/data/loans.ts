/**
 * Loans: a sale to someone on the farm, paid back in set instalments with
 * no interest.
 *
 *  - Making a loan (as part of recording a sale) and confirming payments
 *    need finance.manage.
 *  - The borrower sees their own loans and marks payments ("I paid");
 *    people with finance.view see every loan.
 *  - The sale stays "owed" until confirmed payments cover it, then it is
 *    marked paid on the day the last payment is confirmed.
 */
import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { loanPayments, loans, sales, users } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { cents } from '@/lib/domain/money';
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
export async function checkLoanTerms(user: SessionUser, amount: number, saleDate: string, t: LoanTerms): Promise<string> {
  if (!can(user, 'finance.manage')) throw new DataError('Only someone who handles the farm’s money can set up a loan.', 403);
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
export async function announceLoan(user: SessionUser, borrowerId: string, item: string, amount: number, loanId: string): Promise<void> {
  await logActivity(user.id, `set up a loan for ${item}`, { audience: 'finance.view', href: `/more/loans/${loanId}` });
  await pushToPeople([borrowerId], { title: 'New loan', body: `${item}: $${amount.toFixed(2)}, paid back over time.`, url: `/more/loans/${loanId}` }, user.id);
}

type LoanRow = typeof loans.$inferSelect;
type PaymentRow = typeof loanPayments.$inferSelect & { markedByName: string | null };

export type LoanView = LoanRow & {
  item: string;
  saleDate: string;
  borrowerName: string;
  state: LoanState;
  pending: PaymentRow[];
  payments: PaymentRow[];
};

async function hydrate(rows: LoanRow[], today: string): Promise<LoanView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [saleRows, pays, people] = await Promise.all([
    db.select({ id: sales.id, item: sales.item, kind: sales.kind, date: sales.date }).from(sales).where(inArray(sales.id, rows.map((r) => r.saleId))),
    db.select().from(loanPayments).where(inArray(loanPayments.loanId, ids)).orderBy(desc(loanPayments.date), desc(loanPayments.createdAt)),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const name = new Map(people.map((p) => [p.id, p.name]));
  const sale = new Map(saleRows.map((s) => [s.id, s]));
  return rows.map((l) => {
    const mine = pays.filter((p) => p.loanId === l.id).map((p) => ({ ...p, markedByName: p.markedBy ? name.get(p.markedBy) ?? null : null }));
    const confirmed = mine.filter((p) => p.status === 'confirmed');
    const s = sale.get(l.saleId);
    return {
      ...l,
      item: s?.item || s?.kind || 'Sale',
      saleDate: s?.date ?? '',
      borrowerName: l.borrowerId ? name.get(l.borrowerId) ?? 'Someone' : 'Someone no longer here',
      state: loanState(loanSchedule(l.principal, l.instalment, l.every, l.firstDue), confirmed.reduce((a, p) => a + p.amount, 0), today),
      pending: mine.filter((p) => p.status === 'pending'),
      payments: confirmed,
    };
  });
}

/** Everyone's loans for people who see the farm's money; otherwise your own. */
export async function listLoans(viewer: SessionUser, today = todayISO()): Promise<LoanView[]> {
  const rows = can(viewer, 'finance.view')
    ? await db.select().from(loans).orderBy(desc(loans.createdAt))
    : await db.select().from(loans).where(eq(loans.borrowerId, viewer.id)).orderBy(desc(loans.createdAt));
  return hydrate(rows, today);
}

export async function hasLoans(viewer: SessionUser): Promise<boolean> {
  if (can(viewer, 'finance.view')) return true;
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(loans).where(eq(loans.borrowerId, viewer.id));
  return Number(r?.n ?? 0) > 0;
}

/** One loan, for its borrower or someone who sees the farm's money. Anyone else gets "not found". */
export async function loanForViewer(viewer: SessionUser, id: string, today = todayISO()): Promise<LoanView> {
  const [l] = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
  if (!l || (l.borrowerId !== viewer.id && !can(viewer, 'finance.view'))) throw new DataError('No such loan.', 404);
  return (await hydrate([l], today))[0];
}

/** "I paid": the borrower records a payment for confirmation. A money manager's entry counts straight away. */
export async function markLoanPayment(user: SessionUser, loanId: string, d: { amount: number; date?: string; note?: string }): Promise<string> {
  const loan = await loanForViewer(user, loanId);
  const manager = can(user, 'finance.manage');
  if (loan.borrowerId !== user.id && !manager) throw new DataError('Only the borrower can mark a payment.', 403);
  if (loan.status === 'paid') throw new DataError('This loan is already paid off.', 400);
  const date = d.date || todayISO();
  if (date > todayISO()) throw new DataError('That date hasn’t happened yet.', 400);
  const amount = cents(d.amount);
  const waiting = cents(loan.pending.reduce((a, p) => a + p.amount, 0));
  const room = cents(loan.state.balance - waiting);
  if (!(amount > 0)) throw new DataError('Enter how much was paid.', 400);
  if (amount > room) throw new DataError(room > 0 ? `Only $${room.toFixed(2)} is left to pay${waiting ? ' after the payments waiting to be confirmed' : ''}.` : 'The rest is already waiting to be confirmed.', 400);
  const id = uid('lp');
  const autoConfirm = manager && loan.borrowerId !== user.id;
  await db.insert(loanPayments).values({
    id, loanId, date, amount, note: d.note?.trim() ?? '', markedBy: user.id,
    status: autoConfirm ? 'confirmed' : 'pending', confirmedBy: autoConfirm ? user.id : null, confirmedAt: autoConfirm ? Date.now() : null,
  });
  if (autoConfirm) {
    await settle(loanId);
    if (loan.borrowerId) await pushToPeople([loan.borrowerId], { title: 'Loan payment recorded', body: `$${amount.toFixed(2)} toward ${loan.item}.`, url: `/more/loans/${loanId}` }, user.id);
  } else {
    const managers = (await recipientsWith('finance.manage')).map((m) => m.id);
    await pushToPeople(managers, { title: 'Loan payment to confirm', body: `${user.name} paid $${amount.toFixed(2)} toward ${loan.item}.`, url: `/more/loans/${loanId}` }, user.id);
  }
  publishChange('sales');
  return id;
}

async function paymentOr404(id: string) {
  const [p] = await db.select().from(loanPayments).where(eq(loanPayments.id, id)).limit(1);
  if (!p) throw new DataError('No such payment.', 404);
  const [l] = await db.select().from(loans).where(eq(loans.id, p.loanId)).limit(1);
  if (!l) throw new DataError('No such payment.', 404);
  return { p, l };
}

/** Marks the loan (and its sale) paid off once confirmed payments cover it, or reopens both if they no longer do. */
async function settle(loanId: string): Promise<void> {
  const [l] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!l) return;
  const confirmed = await db.select({ amount: loanPayments.amount, date: loanPayments.date }).from(loanPayments).where(and(eq(loanPayments.loanId, loanId), eq(loanPayments.status, 'confirmed')));
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
  if (!can(user, 'finance.manage')) throw new DataError('Only someone who handles the farm’s money can confirm payments.', 403);
  const { p, l } = await paymentOr404(paymentId);
  if (p.status === 'confirmed') return;
  await db.update(loanPayments).set({ status: 'confirmed', confirmedBy: user.id, confirmedAt: Date.now() }).where(eq(loanPayments.id, paymentId));
  await settle(l.id);
  const [after] = await db.select({ status: loans.status }).from(loans).where(eq(loans.id, l.id)).limit(1);
  if (l.borrowerId) {
    await pushToPeople([l.borrowerId], after?.status === 'paid'
      ? { title: 'Loan paid off', body: 'Your last payment is confirmed. Thank you!', url: `/more/loans/${l.id}` }
      : { title: 'Payment confirmed', body: `$${p.amount.toFixed(2)} received.`, url: `/more/loans/${l.id}` }, user.id);
  }
  publishChange('sales');
}

/**
 * Takes a payment off the loan. A waiting payment can be withdrawn by whoever
 * marked it, or turned down by a money manager; a confirmed one only by a
 * money manager (a mistake), which reopens the loan if it had been paid off.
 */
export async function deleteLoanPayment(user: SessionUser, paymentId: string): Promise<void> {
  const { p, l } = await paymentOr404(paymentId);
  const manager = can(user, 'finance.manage');
  if (p.status === 'confirmed' ? !manager : !(manager || p.markedBy === user.id)) {
    if (l.borrowerId !== user.id && !can(user, 'finance.view')) throw new DataError('No such payment.', 404);
    throw new DataError(p.status === 'confirmed' ? 'Only someone who handles the farm’s money can remove a confirmed payment.' : 'Only whoever marked it can withdraw this payment.', 403);
  }
  await db.delete(loanPayments).where(eq(loanPayments.id, paymentId));
  if (p.status === 'confirmed') await settle(l.id);
  else if (manager && p.markedBy !== user.id && p.markedBy) {
    await pushToPeople([p.markedBy], { title: 'Payment not confirmed', body: `The $${p.amount.toFixed(2)} payment you marked wasn’t confirmed. Talk to whoever handles the money.`, url: `/more/loans/${l.id}` }, user.id);
  }
  publishChange('sales');
}

/** Undo a loan set up by mistake. Only while nothing has been paid; the sale stays, as owed. */
export async function cancelLoan(user: SessionUser, loanId: string): Promise<void> {
  if (!can(user, 'finance.manage')) throw new DataError('Only someone who handles the farm’s money can cancel a loan.', 403);
  const [l] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!l) throw new DataError('No such loan.', 404);
  const [paid] = await db.select({ n: sql<number>`count(*)` }).from(loanPayments).where(and(eq(loanPayments.loanId, loanId), eq(loanPayments.status, 'confirmed')));
  if (Number(paid?.n ?? 0) > 0) throw new DataError('Payments have already been made on this loan, so it can’t be cancelled.', 409);
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

/** Payments waiting for a money manager to confirm (Today's tile). */
export async function loanPaymentsToConfirm(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(loanPayments).where(eq(loanPayments.status, 'pending'));
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
