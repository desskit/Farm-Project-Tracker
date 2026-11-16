/** Loans: sales to people on the farm, paid back in instalments. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { addSale, deleteSale, listSales, setSalePaid } from '@/lib/data/sales';
import { cancelLoan, confirmLoanPayment, deleteLoanPayment, listLoans, loanForViewer, loanPaymentsToConfirm, markLoanPayment } from '@/lib/data/loans';
import { calendarItems } from '@/lib/data/calendar';
import { runLoanReminders } from '@/lib/notify/loan-reminders';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

async function setup() {
  const admin = await makeUser('admin', 'Boss');
  const crew = await makeUser('worker', 'Sam');
  const other = await makeUser('worker', 'Kim');
  const renter = await makeUser('renter', 'Tenant');
  return { admin, crew, other, renter };
}

describe('loans', () => {
  it('are set up with a sale, only by money managers, only to people on the farm', async () => {
    const { admin, crew, renter } = await setup();
    const fam = await makeUser('family');
    const terms = { borrowerId: crew.id, instalment: 100, every: 'week' as const, firstDue: addDays(T, 7) };
    await expect(addSale(fam, { kind: 'animal', item: 'Heifer', amount: 250, loan: terms })).rejects.toThrow(/handles the farm’s money/);
    await expect(addSale(admin, { kind: 'animal', amount: 250, loan: { ...terms, borrowerId: renter.id } })).rejects.toThrow(/someone on the farm/);
    await expect(addSale(admin, { kind: 'animal', amount: 250, loan: { ...terms, firstDue: addDays(T, -1) } })).rejects.toThrow(/before the sale/);
    await expect(addSale(admin, { kind: 'animal', amount: 5000, loan: { ...terms, instalment: 1 } })).rejects.toThrow(/more than 120/);

    const saleId = await addSale(admin, { kind: 'animal', item: 'Heifer', amount: 250, paid: true, buyer: 'ignored', loan: terms });
    const [sale] = await db.select().from(schema.sales).where(eq(schema.sales.id, saleId));
    expect(sale).toMatchObject({ paid: false, buyer: 'Sam' });
    await expect(setSalePaid(admin, saleId, true)).rejects.toThrow(/through its loan/);

    const [l] = await listLoans(crew);
    expect(l.state.schedule.map((i) => i.amount)).toEqual([100, 100, 50]);
    expect(l.item).toBe('Heifer');
  });

  it('are seen only by the borrower and people who see the money', async () => {
    const { admin, crew, other } = await setup();
    await addSale(admin, { kind: 'hay', item: 'Hay', amount: 90, loan: { borrowerId: crew.id, instalment: 30, every: 'month', firstDue: addDays(T, 3) } });
    const [l] = await listLoans(crew);
    expect(await listLoans(other)).toHaveLength(0);
    await expect(loanForViewer(other, l.id)).rejects.toThrow(/No such loan/);
    await expect(markLoanPayment(other, l.id, { amount: 30 })).rejects.toThrow(/No such loan/);
    expect((await listLoans(admin)).map((x) => x.id)).toContain(l.id);
    // On the borrower's calendar, not on anyone else's (without money access).
    const mine = (await calendarItems(crew, T, addDays(T, 70))).filter((i) => i.kind === 'loan');
    expect(mine).toHaveLength(3);
    expect((await calendarItems(other, T, addDays(T, 70))).filter((i) => i.kind === 'loan')).toHaveLength(0);
  });

  it('count a payment once it is confirmed, and mark the sale paid when the last one is', async () => {
    const { admin, crew } = await setup();
    const saleId = await addSale(admin, { kind: 'other', item: 'Saddle', amount: 200, loan: { borrowerId: crew.id, instalment: 100, every: 'month', firstDue: T } });
    const [l] = await listLoans(crew);

    const p1 = await markLoanPayment(crew, l.id, { amount: 100, note: 'cash' });
    expect((await loanForViewer(crew, l.id)).state.paid).toBe(0);
    expect(await loanPaymentsToConfirm()).toBe(1);
    await expect(confirmLoanPayment(crew, p1)).rejects.toThrow(/confirm payments/);
    // Can't mark more than is left once waiting payments are counted.
    await expect(markLoanPayment(crew, l.id, { amount: 150 })).rejects.toThrow(/Only \$100.00 is left/);
    await confirmLoanPayment(admin, p1);
    expect((await loanForViewer(crew, l.id)).state).toMatchObject({ paid: 100, balance: 100 });

    // A money manager taking cash counts straight away.
    await markLoanPayment(admin, l.id, { amount: 100 });
    const after = await loanForViewer(crew, l.id);
    expect(after.status).toBe('paid');
    expect((await db.select().from(schema.sales).where(eq(schema.sales.id, saleId)))[0].paid).toBe(true);
    await expect(markLoanPayment(crew, l.id, { amount: 1 })).rejects.toThrow(/already paid off/);

    // Removing a confirmed payment (a mistake) reopens the loan and the sale.
    await expect(deleteLoanPayment(crew, after.payments[0].id)).rejects.toThrow(/Only whoever handles/);
    await deleteLoanPayment(admin, after.payments[0].id);
    expect((await loanForViewer(crew, l.id)).status).toBe('active');
    expect((await db.select().from(schema.sales).where(eq(schema.sales.id, saleId)))[0].paid).toBe(false);

    // Paid loans can't be cancelled or their sale deleted.
    await expect(cancelLoan(admin, l.id)).rejects.toThrow(/already been made/);
    await expect(deleteSale(admin, saleId)).rejects.toThrow(/can’t be deleted/);
  });

  it('can be cancelled before anything is paid, leaving the sale owed', async () => {
    const { admin, crew } = await setup();
    const saleId = await addSale(admin, { kind: 'eggs', amount: 40, loan: { borrowerId: crew.id, instalment: 10, every: 'week', firstDue: T } });
    const [l] = await listLoans(crew);
    const p = await markLoanPayment(crew, l.id, { amount: 10 });
    await deleteLoanPayment(crew, p); // withdraw your own waiting payment
    await cancelLoan(admin, l.id);
    expect(await listLoans(crew)).toHaveLength(0);
    const [sale] = (await listSales(admin)).filter((x) => x.id === saleId);
    expect(sale.paid).toBe(false);
  });

  it('remind once per stage, and not when a payment is waiting', async () => {
    const { admin, crew } = await setup();
    // Far enough out that no other test's loan has a payment near these dates.
    const due = addDays(T, 200);
    await addSale(admin, { kind: 'other', item: 'Trailer', amount: 300, loan: { borrowerId: crew.id, instalment: 100, every: 'month', firstDue: due } });
    expect((await runLoanReminders(addDays(due, -3))).sent).toBe(1);
    expect((await runLoanReminders(addDays(due, -3))).sent).toBe(0);
    const [l] = await listLoans(crew);
    await markLoanPayment(crew, l.id, { amount: 100 });
    expect((await runLoanReminders(due)).sent).toBe(0);
  });
});

describe('personal sales', () => {
  it('are recorded by anyone on the farm, private to seller and buyer, and not the farm’s income', async () => {
    const { admin, crew, other } = await setup();
    const { saleForViewer } = await import('@/lib/data/sales');
    const { profitReport } = await import('@/lib/data/profit');
    const before = (await profitReport(`${T.slice(0, 4)}-01-01`, T)).income;

    // Crew can't record the farm's sales, but can record their own.
    await expect(addSale(crew, { kind: 'other', amount: 50 })).rejects.toThrow(/record your own/);
    const saleId = await addSale(crew, {
      kind: 'other', category: ' Firearms ', item: 'Bolt-action rifle', serial: 'SN-123', amount: 600, personal: true,
      loan: { borrowerId: other.id, instalment: 200, every: 'month', firstDue: T },
    });
    const [row] = await db.select().from(schema.sales).where(eq(schema.sales.id, saleId));
    expect(row).toMatchObject({ personal: true, sellerId: crew.id, category: 'Firearms', serial: 'SN-123', buyer: 'Kim', paid: false });

    // Not in the farm's books, and not visible to managers.
    expect((await profitReport(`${T.slice(0, 4)}-01-01`, T)).income).toBe(before);
    expect((await listSales(admin)).map((x) => x.id)).not.toContain(saleId);
    expect((await listSales(crew)).map((x) => x.id)).toContain(saleId);
    await expect(saleForViewer(admin, saleId)).rejects.toThrow(/No such sale/);
    expect((await saleForViewer(other, saleId)).sellerName).toBe('Sam'); // the buyer can see the bill of sale
    expect((await listLoans(admin)).map((l) => l.saleId)).not.toContain(saleId);

    // The seller, not a money manager, confirms payments.
    const [l] = (await listLoans(other)).filter((x) => x.saleId === saleId);
    expect(l).toMatchObject({ personal: true, sellerName: 'Sam', item: 'Bolt-action rifle', serial: 'SN-123' });
    const farmWaiting = await loanPaymentsToConfirm();
    const p = await markLoanPayment(other, l.id, { amount: 200 });
    expect(await loanPaymentsToConfirm()).toBe(farmWaiting); // not on the farm's "to confirm" tile
    await expect(confirmLoanPayment(admin, p)).rejects.toThrow(/No such payment/);
    await confirmLoanPayment(crew, p);
    expect((await loanForViewer(other, l.id)).state.paid).toBe(200);

    // A cash payment the seller takes counts at once.
    await markLoanPayment(crew, l.id, { amount: 400 });
    expect((await db.select().from(schema.sales).where(eq(schema.sales.id, saleId)))[0].paid).toBe(true);
    await expect(addSale(crew, { kind: 'other', amount: 10, personal: true, loan: { borrowerId: crew.id, instalment: 5, every: 'week', firstDue: T } })).rejects.toThrow(/yourself/);
  });
});
