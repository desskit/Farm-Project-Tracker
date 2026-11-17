/** Crew pay, and work put toward rent. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import {
  addWorkLog, approvePayRun, decideWorkLog, deleteWorkLog, hoursToApproveCount, markPayLinePaid, myPay, payPeriodView, periodOf, reopenPayRun, savePaySettings,
} from '@/lib/data/pay';
import { createLease, createRentalUnit } from '@/lib/data/rentals';
import { creditsByCharge, ensureRentCharges, rentSummary } from '@/lib/data/rent';
import { profitReport } from '@/lib/data/profit';
import { addDays, currentMonthKey, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const mk = currentMonthKey();

async function setup() {
  const boss = await makeUser('manager', 'Boss');
  const foreman = await makeUser('manager', 'Foreman');
  const sam = await makeUser('worker', 'Sam');
  const kim = await makeUser('worker', 'Kim');
  const unit = await createRentalUnit(boss, { name: 'Bunkhouse', kind: 'other' });
  await createLease(boss, unit, { tenantIds: [sam.id], primaryId: sam.id, startDate: `${mk}-01`, rent: 500, dueDay: 28 });
  await ensureRentCharges();
  const [charge] = await db.select().from(schema.rentCharges).where(eq(schema.rentCharges.userId, sam.id));
  return { boss, foreman, sam, kim, charge };
}

/** A finished timer of `hours` that started today. */
async function timer(userId: string, hours: number) {
  const start = Date.now() - hours * 3600_000 - 60_000;
  await db.insert(schema.timeEntries).values({ id: `te${Math.random()}`, kind: 'chore', refId: 'x', userId, start, end: start + hours * 3600_000, seconds: hours * 3600 });
}

describe('typed-in hours', () => {
  it('count only once someone else approves them', async () => {
    const { boss, sam, kim } = await setup();
    await expect(addWorkLog(sam, { date: addDays(T, 1), hours: 3 })).rejects.toThrow(/hasn’t happened/);
    const mine = await addWorkLog(sam, { date: T, hours: 4, note: 'fencing' });
    const gone = await addWorkLog(sam, { date: T, hours: 1 });
    await deleteWorkLog(sam, gone);
    await expect(deleteWorkLog(kim, mine)).rejects.toThrow(/No such entry/);
    await expect(decideWorkLog(sam, mine, true)).rejects.toThrow(/approve hours/);
    expect(await hoursToApproveCount(boss)).toBeGreaterThan(0);
    expect((await myPay(sam)).thisPeriod).toMatchObject({ typed: 0, pending: 4 });
    await decideWorkLog(boss, mine, true);
    expect((await myPay(sam)).thisPeriod).toMatchObject({ typed: 4, pending: 0 });
    await expect(deleteWorkLog(sam, mine)).rejects.toThrow(/still waiting/);
  });
});

describe('pay runs', () => {
  it('put pay toward rent by each person’s rule, settle covered rent, and can be taken back', async () => {
    const { boss, foreman, sam, kim, charge } = await setup();
    await expect(savePaySettings(sam, sam.id, { hourlyRate: 99, rentRule: 'none' })).rejects.toThrow(/handles the farm’s money/);
    await expect(savePaySettings(boss, sam.id, { hourlyRate: 20, rentRule: 'fixed' })).rejects.toThrow(/toward rent each pay period/);
    await savePaySettings(boss, sam.id, { hourlyRate: 20, rentRule: 'all' });
    await savePaySettings(boss, kim.id, { hourlyRate: 15, rentRule: 'none' });
    await timer(sam.id, 10);
    await timer(kim.id, 4);
    const typed = await addWorkLog(sam, { date: T, hours: 5 });
    await decideWorkLog(foreman, typed, true);

    const period = await periodOf(T);
    const preview = await payPeriodView(boss, T);
    const line = (who: string) => preview.lines.find((l) => l.name === who)!;
    // Sam's 15 h × $20 = $300, all toward his $500 rent; Kim has no rent.
    expect(line('Sam')).toMatchObject({ timerHours: 10, typedHours: 5, gross: 300, rentOwed: 500, toRent: 300, paidOut: 0 });
    expect(line('Kim')).toMatchObject({ gross: 60, toRent: 0, paidOut: 60 });

    // Override: only $100 toward rent this time.
    const runId = await approvePayRun(boss, period.start, { [sam.id]: 100 });
    await expect(approvePayRun(boss, period.start)).rejects.toThrow(/already approved/);
    let credits = await creditsByCharge([charge.id]);
    expect(credits.get(charge.id)).toBe(100);
    expect((await db.select().from(schema.rentCharges).where(eq(schema.rentCharges.id, charge.id)))[0].status).toBe('unpaid');
    const charges = await db.select().from(schema.rentCharges).where(eq(schema.rentCharges.id, charge.id));
    expect(rentSummary(charges, credits).collected).toBe(100);
    // Hours in an approved period are locked.
    await expect(addWorkLog(sam, { date: T, hours: 1 })).rejects.toThrow(/already approved/);

    const mine = await myPay(sam);
    expect(mine.lines[0]).toMatchObject({ gross: 300, toRent: 100, paidOut: 200 });
    expect(mine.rentLeft).toBe(400);
    expect((await profitReport(period.start, addDays(period.end, 1))).costs).toBeGreaterThanOrEqual(360);

    // Take it back, then approve with the rule: $300 of $500.
    await reopenPayRun(boss, runId);
    expect((await creditsByCharge([charge.id])).get(charge.id)).toBeUndefined();
    await approvePayRun(boss, period.start);
    expect((await creditsByCharge([charge.id])).get(charge.id)).toBe(300);
    const view = await payPeriodView(boss, T);
    const samLine = view.lines.find((l) => l.name === 'Sam')!;
    await markPayLinePaid(boss, view.lines.find((l) => l.name === 'Kim')!.id!, { how: 'cash' });
    await expect(reopenPayRun(boss, view.run!.id)).rejects.toThrow(/paid out/);
    expect(samLine.toRent).toBe(300);
  });

  it('marks rent paid when work covers all of it, and reopening un-pays it', async () => {
    const { boss, sam, charge } = await setup();
    await savePaySettings(boss, sam.id, { hourlyRate: 50, rentRule: 'all' });
    // Use the previous period, so this test doesn't collide with the one above.
    const prev = await periodOf(addDays((await periodOf(T)).start, -1));
    const start = new Date(`${prev.start}T09:00:00`).getTime();
    await db.insert(schema.timeEntries).values({ id: 'te-prev', kind: 'chore', refId: 'x', userId: sam.id, start, end: start + 12 * 3600_000, seconds: 12 * 3600 });
    const runId = await approvePayRun(boss, prev.start);
    // $600 of work: $500 covers the rent, $100 is paid out.
    const [after] = await db.select().from(schema.rentCharges).where(eq(schema.rentCharges.id, charge.id));
    expect(after.status).toBe('verified');
    const line = (await payPeriodView(boss, prev.start)).lines.find((l) => l.name === 'Sam')!;
    expect(line).toMatchObject({ gross: 600, toRent: 500, paidOut: 100 });
    await reopenPayRun(boss, runId);
    const [back] = await db.select().from(schema.rentCharges).where(eq(schema.rentCharges.id, charge.id));
    expect(back.status).toBe('unpaid');
  });
});
