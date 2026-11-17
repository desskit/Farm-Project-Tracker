/**
 * Crew pay, and work put toward rent.
 *
 *  - Rates and rent rules, pay runs and paying out need finance.manage.
 *  - Typed-in hours are approved by someone with work.manage or
 *    finance.manage, never by the person who logged them.
 *  - Everyone sees their own hours and pay.
 *  - Approving a two-week pay run records each person's pay and puts the
 *    rent part on their open rent charges as credits (oldest first); a
 *    charge the credits cover in full is marked paid. Reopening a run (only
 *    before anything was paid out) takes all of that back.
 * This is a record of pay, not payroll tax filing.
 */
import 'server-only';
import { and, desc, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '@/db';
import { leaseTenants, payLines, payRuns, paySettings, rentCharges, rentCredits, timeEntries, users, workLogs, type RentRule } from '@/db/schema';
import { uid } from '@/lib/ids';
import { addDays, parseISO, todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { cents } from '@/lib/domain/money';
import { DEFAULT_PAY_ANCHOR, allocateCredit, chargeBalance, hoursFrom, payPeriodFor, splitPay, type Period } from '@/lib/domain/pay';
import type { SessionUser } from '@/lib/auth/session';
import { publishChange } from '@/lib/realtime/bus';
import { pushToPeople } from '@/lib/notify/events';
import { logActivity } from './activity';
import { DataError } from './errors';
import { recipientsWith } from './recipients';
import { getSetting, setSetting } from './settings';
import { creditsByCharge } from './rent';

const ANCHOR_KEY = 'pay-period-start';
const usd = (n: number) => `$${n.toFixed(2)}`;

function manager(user: SessionUser) {
  if (!can(user, 'finance.manage')) throw new DataError('Only someone who handles the farm’s money can manage pay.', 403);
}

export function canApproveHours(user: SessionUser): boolean {
  return can(user, 'work.manage') || can(user, 'finance.manage');
}

/* ---------------- pay periods ---------------- */

export async function payAnchor(): Promise<string> {
  const v = await getSetting<string>(ANCHOR_KEY);
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEFAULT_PAY_ANCHOR;
}

/** Start pay periods on this date (and every two weeks from it). */
export async function setPayAnchor(user: SessionUser, date: string): Promise<void> {
  manager(user);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DataError('Pick a date.', 400);
  const runs = await db.select({ id: payRuns.id }).from(payRuns).limit(1);
  if (runs.length) throw new DataError('Pay has already been approved on the current schedule, so the start day can’t change.', 409);
  await setSetting(ANCHOR_KEY, date);
}

export async function periodOf(date: string): Promise<Period> {
  return payPeriodFor(await payAnchor(), date);
}

/* ---------------- rates and rules ---------------- */

export type PaySettingView = typeof paySettings.$inferSelect & { name: string };

export async function listPaySettings(user: SessionUser): Promise<PaySettingView[]> {
  manager(user);
  const rows = await db.select({ p: paySettings, name: users.name }).from(paySettings).innerJoin(users, eq(users.id, paySettings.userId));
  return rows.map((r) => ({ ...r.p, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export type PaySettingInput = { hourlyRate: number; rentRule: RentRule; rentFixed?: number | null; active?: boolean };

export async function savePaySettings(user: SessionUser, userId: string, d: PaySettingInput): Promise<void> {
  manager(user);
  if (!(await recipientsWith('farm.view')).some((p) => p.id === userId)) throw new DataError('Pick someone on the farm.', 400);
  if (!(d.hourlyRate > 0)) throw new DataError('Enter an hourly rate.', 400);
  if (d.rentRule === 'fixed' && !((d.rentFixed ?? 0) > 0)) throw new DataError('Enter how much goes toward rent each pay period.', 400);
  const values = { hourlyRate: cents(d.hourlyRate), rentRule: d.rentRule, rentFixed: d.rentRule === 'fixed' ? cents(d.rentFixed!) : null, active: d.active ?? true, updatedAt: Date.now() };
  await db.insert(paySettings).values({ userId, ...values }).onConflictDoUpdate({ target: paySettings.userId, set: values });
}

/* ---------------- typed-in hours ---------------- */

export type WorkLogView = typeof workLogs.$inferSelect & { name: string };

async function periodApproved(date: string): Promise<boolean> {
  const p = await periodOf(date);
  return (await db.select({ id: payRuns.id }).from(payRuns).where(eq(payRuns.periodStart, p.start)).limit(1)).length > 0;
}

export async function addWorkLog(user: SessionUser, d: { date: string; hours: number; note?: string }): Promise<string> {
  if (!can(user, 'work.do')) throw new DataError('You can’t log work hours.', 403);
  if (d.date > todayISO()) throw new DataError('That date hasn’t happened yet.', 400);
  if (!(d.hours > 0) || d.hours > 24) throw new DataError('Enter between a quarter hour and 24 hours.', 400);
  if (await periodApproved(d.date)) throw new DataError('Pay for that period is already approved. Ask a manager to reopen it.', 409);
  const id = uid('wl');
  await db.insert(workLogs).values({ id, userId: user.id, date: d.date, hours: Math.round(d.hours * 4) / 4, note: d.note?.trim() ?? '' });
  publishChange('pay');
  return id;
}

export async function decideWorkLog(user: SessionUser, id: string, approve: boolean): Promise<void> {
  if (!canApproveHours(user)) throw new DataError('Only a manager can approve hours.', 403);
  const [w] = await db.select().from(workLogs).where(eq(workLogs.id, id)).limit(1);
  if (!w) throw new DataError('No such entry.', 404);
  if (w.userId === user.id) throw new DataError('Someone else has to approve your own hours.', 403);
  if (await periodApproved(w.date)) throw new DataError('Pay for that period is already approved. Reopen it first.', 409);
  await db.update(workLogs).set({ status: approve ? 'approved' : 'rejected', decidedBy: user.id, decidedAt: Date.now() }).where(eq(workLogs.id, id));
  if (!approve) await pushToPeople([w.userId], { title: 'Hours not approved', body: `${w.hours} h on ${w.date}${w.note ? ` (${w.note})` : ''}. Talk to ${user.name}.`, url: '/more/time' }, user.id);
  publishChange('pay');
}

/** Your own entry, while it's still waiting. */
export async function deleteWorkLog(user: SessionUser, id: string): Promise<void> {
  const [w] = await db.select().from(workLogs).where(eq(workLogs.id, id)).limit(1);
  if (!w || w.userId !== user.id) throw new DataError('No such entry.', 404);
  if (w.status !== 'pending') throw new DataError('Only hours still waiting for approval can be removed.', 409);
  await db.delete(workLogs).where(eq(workLogs.id, id));
  publishChange('pay');
}

export async function listWorkLogs(viewer: SessionUser, opts: { mine?: boolean; status?: 'pending' } = {}): Promise<WorkLogView[]> {
  const everyone = !opts.mine && canApproveHours(viewer);
  const where = [everyone ? undefined : eq(workLogs.userId, viewer.id), opts.status ? eq(workLogs.status, opts.status) : undefined].filter((x): x is NonNullable<typeof x> => !!x);
  const rows = await db.select({ w: workLogs, name: users.name }).from(workLogs).innerJoin(users, eq(users.id, workLogs.userId))
    .where(where.length ? and(...where) : undefined).orderBy(desc(workLogs.date), desc(workLogs.createdAt)).limit(200);
  return rows.map((r) => ({ ...r.w, name: r.name }));
}

export async function hoursToApproveCount(viewer: SessionUser): Promise<number> {
  if (!canApproveHours(viewer)) return 0;
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(workLogs).where(and(eq(workLogs.status, 'pending'), ne(workLogs.userId, viewer.id)));
  return Number(r?.n ?? 0);
}

/* ---------------- rent owed (for work credits) ---------------- */

type Open = { id: string; balance: number; dueDate: string; kind: string };

/** Charges this person still owes on (billed to them or their lease), with what's left on each. */
async function openChargesFor(userId: string): Promise<Open[]> {
  const leaseIds = (await db.select({ id: leaseTenants.leaseId }).from(leaseTenants).where(eq(leaseTenants.userId, userId))).map((r) => r.id);
  const rows = await db.select().from(rentCharges).where(ne(rentCharges.status, 'verified'));
  const mine = rows.filter((c) => c.userId === userId || (c.leaseId && leaseIds.includes(c.leaseId)));
  const credits = await creditsByCharge(mine.map((c) => c.id));
  return mine.map((c) => ({ id: c.id, balance: chargeBalance(c.amount, credits.get(c.id) ?? 0), dueDate: c.dueDate, kind: c.kind })).filter((c) => c.balance > 0);
}

/* ---------------- pay runs ---------------- */

export type PayLineView = {
  id: string | null;
  userId: string;
  name: string;
  timerHours: number;
  typedHours: number;
  /** Typed-in hours in the period still waiting for approval (not counted). */
  pendingHours: number;
  rate: number;
  gross: number;
  rentOwed: number;
  rule: RentRule;
  toRent: number;
  paidOut: number;
  paidOn: string | null;
  paidHow: string;
};
export type PayPeriodView = { period: Period; run: { id: string; approvedAt: number; approvedBy: string | null } | null; lines: PayLineView[] };

/** Hours per person in a period: finished timers that started in it, and approved typed-in hours dated in it. */
async function hoursIn(period: Period, userIds: string[]) {
  const fromMs = parseISO(period.start).getTime();
  const toMs = parseISO(addDays(period.end, 1)).getTime();
  const [timers, logs] = await Promise.all([
    userIds.length ? db.select({ userId: timeEntries.userId, seconds: timeEntries.seconds }).from(timeEntries)
      .where(and(inArray(timeEntries.userId, userIds), isNotNull(timeEntries.end), gte(timeEntries.start, fromMs), lt(timeEntries.start, toMs))) : Promise.resolve([]),
    userIds.length ? db.select({ userId: workLogs.userId, hours: workLogs.hours, status: workLogs.status }).from(workLogs)
      .where(and(inArray(workLogs.userId, userIds), gte(workLogs.date, period.start), lte(workLogs.date, period.end))) : Promise.resolve([]),
  ]);
  const out = new Map<string, { timer: number; typed: number; pending: number }>();
  const get = (id: string) => out.get(id) ?? (out.set(id, { timer: 0, typed: 0, pending: 0 }), out.get(id)!);
  const secs = new Map<string, number>();
  for (const t of timers) secs.set(t.userId, (secs.get(t.userId) ?? 0) + (t.seconds || 0));
  for (const [id, s] of secs) get(id).timer = hoursFrom(s);
  for (const l of logs) {
    if (l.status === 'approved') get(l.userId).typed += l.hours;
    else if (l.status === 'pending') get(l.userId).pending += l.hours;
  }
  return out;
}

/** A pay period: its approved pay, or what approving it now would pay. */
export async function payPeriodView(user: SessionUser, start: string): Promise<PayPeriodView> {
  manager(user);
  const period = await periodOf(start);
  const [run] = await db.select().from(payRuns).where(eq(payRuns.periodStart, period.start)).limit(1);
  if (run) {
    const rows = await db.select({ l: payLines, name: users.name }).from(payLines).leftJoin(users, eq(users.id, payLines.userId)).where(eq(payLines.runId, run.id));
    const settings = new Map((await db.select().from(paySettings)).map((s) => [s.userId, s]));
    return {
      period,
      run: { id: run.id, approvedAt: run.approvedAt, approvedBy: run.approvedBy },
      lines: rows.map(({ l, name }) => ({
        id: l.id, userId: l.userId ?? '', name: name ?? 'Former member', timerHours: l.timerHours, typedHours: l.typedHours, pendingHours: 0,
        rate: l.rate, gross: l.gross, rentOwed: 0, rule: settings.get(l.userId ?? '')?.rentRule ?? 'none', toRent: l.toRent, paidOut: l.paidOut, paidOn: l.paidOn, paidHow: l.paidHow,
      })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  const people = (await listPaySettings(user)).filter((p) => p.active);
  const hours = await hoursIn(period, people.map((p) => p.userId));
  const lines: PayLineView[] = [];
  for (const p of people) {
    const h = hours.get(p.userId) ?? { timer: 0, typed: 0, pending: 0 };
    const gross = cents((h.timer + h.typed) * p.hourlyRate);
    const rentOwed = cents((await openChargesFor(p.userId)).reduce((a, c) => a + c.balance, 0));
    const split = splitPay(gross, p.rentRule, p.rentFixed, rentOwed);
    lines.push({
      id: null, userId: p.userId, name: p.name, timerHours: h.timer, typedHours: h.typed, pendingHours: h.pending, rate: p.hourlyRate, gross,
      rentOwed, rule: p.rentRule, toRent: split.toRent, paidOut: split.paidOut, paidOn: null, paidHow: '',
    });
  }
  return { period, run: null, lines };
}

/**
 * Approve a period's pay. `toRent` overrides the rule for a person this
 * period (never more than their pay or what they owe). Writes the run, each
 * person's line and the rent credits in one go.
 */
export async function approvePayRun(user: SessionUser, start: string, toRent: Record<string, number> = {}): Promise<string> {
  manager(user);
  const view = await payPeriodView(user, start);
  if (view.run) throw new DataError('Pay for this period is already approved.', 409);
  if (view.period.start > todayISO()) throw new DataError('That pay period hasn’t started yet.', 400);
  const lines = view.lines.filter((l) => l.gross > 0);
  if (!lines.length) throw new DataError('No hours to pay in this period.', 400);

  const runId = uid('pr');
  const today = todayISO();
  const ops: BatchItem<'sqlite'>[] = [db.insert(payRuns).values({ id: runId, periodStart: view.period.start, periodEnd: view.period.end, approvedBy: user.id })];
  const settledCharges: string[] = [];
  const notices: { userId: string; gross: number; toRent: number; paidOut: number }[] = [];

  for (const l of lines) {
    const open = await openChargesFor(l.userId);
    const owed = cents(open.reduce((a, c) => a + c.balance, 0));
    const want = toRent[l.userId] ?? l.toRent;
    const rent = cents(Math.max(0, Math.min(want, l.gross, owed)));
    const lineId = uid('pl');
    ops.push(db.insert(payLines).values({
      id: lineId, runId, userId: l.userId, timerHours: l.timerHours, typedHours: l.typedHours, rate: l.rate, gross: l.gross, toRent: rent, paidOut: cents(l.gross - rent),
    }));
    for (const a of allocateCredit(rent, open)) {
      ops.push(db.insert(rentCredits).values({ id: uid('rc'), chargeId: a.chargeId, amount: a.amount, date: today, source: 'work', payLineId: lineId, settled: a.settles }));
      if (a.settles) settledCharges.push(a.chargeId);
    }
    notices.push({ userId: l.userId, gross: l.gross, toRent: rent, paidOut: cents(l.gross - rent) });
  }
  if (settledCharges.length) {
    ops.push(db.update(rentCharges).set({ status: 'verified', verifiedAt: today, verifiedBy: user.id, markedAt: today, markedBy: user.id, reminderStage: null, reminderSentOn: null })
      .where(inArray(rentCharges.id, settledCharges)));
  }
  await db.batch(ops as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

  for (const n of notices) {
    await pushToPeople([n.userId], {
      title: 'Your pay',
      body: n.toRent > 0 ? `${usd(n.gross)} for ${view.period.start} to ${view.period.end}: ${usd(n.toRent)} toward rent, ${usd(n.paidOut)} to you.` : `${usd(n.gross)} for ${view.period.start} to ${view.period.end}.`,
      url: '/more/time',
    }, user.id);
  }
  await logActivity(user.id, `approved pay for ${view.period.start} to ${view.period.end}`, { audience: 'finance.view', href: `/more/pay?period=${view.period.start}` });
  publishChange('pay');
  publishChange('rent');
  return runId;
}

/** The paid-out part was handed over. */
export async function markPayLinePaid(user: SessionUser, lineId: string, d: { paidOn?: string; how?: string }): Promise<void> {
  manager(user);
  const [l] = await db.select().from(payLines).where(eq(payLines.id, lineId)).limit(1);
  if (!l) throw new DataError('No such pay line.', 404);
  await db.update(payLines).set({ paidOn: d.paidOn || todayISO(), paidHow: d.how?.trim().slice(0, 40) ?? '' }).where(eq(payLines.id, lineId));
  publishChange('pay');
}

/** Undo an approval (before anything was paid out): removes its pay and rent credits, and reopens rent they had covered. */
export async function reopenPayRun(user: SessionUser, runId: string): Promise<void> {
  manager(user);
  const lines = await db.select().from(payLines).where(eq(payLines.runId, runId));
  if (!lines.length && !(await db.select({ id: payRuns.id }).from(payRuns).where(eq(payRuns.id, runId)).limit(1)).length) throw new DataError('No such pay run.', 404);
  if (lines.some((l) => l.paidOn)) throw new DataError('Some of this pay has been paid out, so it can’t be reopened.', 409);
  const settled = lines.length
    ? (await db.select({ chargeId: rentCredits.chargeId }).from(rentCredits).where(and(inArray(rentCredits.payLineId, lines.map((l) => l.id)), eq(rentCredits.settled, true)))).map((r) => r.chargeId)
    : [];
  const ops: BatchItem<'sqlite'>[] = [];
  if (settled.length) {
    ops.push(db.update(rentCharges).set({ status: 'unpaid', verifiedAt: null, verifiedBy: null, markedAt: null, markedBy: null })
      .where(and(inArray(rentCharges.id, settled), eq(rentCharges.status, 'verified'))));
  }
  ops.push(db.delete(payRuns).where(eq(payRuns.id, runId)));
  await db.batch(ops as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  publishChange('pay');
  publishChange('rent');
}

/* ---------------- your own ---------------- */

export type MyPay = {
  setting: { hourlyRate: number; rentRule: RentRule; rentFixed: number | null } | null;
  period: Period;
  thisPeriod: { timer: number; typed: number; pending: number };
  lines: (typeof payLines.$inferSelect & { periodStart: string; periodEnd: string })[];
  logs: WorkLogView[];
  rentLeft: number;
};

export async function myPay(viewer: SessionUser): Promise<MyPay> {
  const today = todayISO();
  const period = await periodOf(today);
  const [setting] = await db.select().from(paySettings).where(eq(paySettings.userId, viewer.id)).limit(1);
  const [hours, lines, logs, open] = await Promise.all([
    hoursIn(period, [viewer.id]),
    db.select({ l: payLines, start: payRuns.periodStart, end: payRuns.periodEnd }).from(payLines).innerJoin(payRuns, eq(payRuns.id, payLines.runId))
      .where(eq(payLines.userId, viewer.id)).orderBy(desc(payRuns.periodStart)).limit(12),
    listWorkLogs(viewer, { mine: true }),
    openChargesFor(viewer.id),
  ]);
  return {
    setting: setting ? { hourlyRate: setting.hourlyRate, rentRule: setting.rentRule, rentFixed: setting.rentFixed } : null,
    period,
    thisPeriod: hours.get(viewer.id) ?? { timer: 0, typed: 0, pending: 0 },
    lines: lines.map((r) => ({ ...r.l, periodStart: r.start, periodEnd: r.end })),
    logs: logs.slice(0, 20),
    rentLeft: cents(open.reduce((a, c) => a + c.balance, 0)),
  };
}

/** Gross pay approved for periods ending in [from, to]: profit's and spending's labor cost. */
export async function laborCost(from: string, to: string): Promise<{ total: number; byMonth: Map<string, number> }> {
  const rows = await db.select({ gross: payLines.gross, end: payRuns.periodEnd }).from(payLines).innerJoin(payRuns, eq(payRuns.id, payLines.runId))
    .where(and(gte(payRuns.periodEnd, from), lte(payRuns.periodEnd, to)));
  const byMonth = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    total += r.gross;
    byMonth.set(r.end.slice(0, 7), cents((byMonth.get(r.end.slice(0, 7)) ?? 0) + r.gross));
  }
  return { total: cents(total), byMonth };
}
