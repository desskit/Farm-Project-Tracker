/**
 * Rentals: units, leases (with their tenants), utilities billed back,
 * inspections and the lease jobs (late fees, lease-end reminders).
 *
 * Rent itself is still billed through rent_charges (see ./rent.ts), now one
 * 'rent' charge per lease per month, billed to the lease's primary tenant.
 * Everyone on a lease can see and mark its charges.
 *
 * Managing any of this needs rentals.manage.
 */
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '@/db';
import {
  inspections, leaseTenants, leases, maintenanceRequests, rentCharges, rentalUnits, users, utilityAccounts, utilityBills,
  type InspectionItem, type InspectionKind, type RentalKind, type UtilityKind,
} from '@/db/schema';
import { uid } from '@/lib/ids';
import { addDays, currentMonthKey, fmtDate, monthLabel, todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { UTILITY_LABEL, compareInspections, lateFeeDue, leaseStage, type LeaseStage } from '@/lib/domain/rentals';
import type { SessionUser } from '@/lib/auth/session';
import { publishChange } from '@/lib/realtime/bus';
import { logActivity } from './activity';
import { DataError } from './errors';

export type UnitRow = typeof rentalUnits.$inferSelect;
export type LeaseRow = typeof leases.$inferSelect;
export type LeaseView = LeaseRow & { tenants: { id: string; name: string; isPrimary: boolean }[] };

const pad2 = (n: number) => String(n).padStart(2, '0');
function need(user: SessionUser) {
  if (!can(user, 'rentals.manage')) throw new DataError('Only managers and admins can manage rentals.', 403);
}
async function runBatch(ops: BatchItem<'sqlite'>[]) {
  if (ops.length) await db.batch(ops as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}
async function unitOr404(id: string): Promise<UnitRow> {
  const [u] = await db.select().from(rentalUnits).where(eq(rentalUnits.id, id)).limit(1);
  if (!u) throw new DataError('No such unit.', 404);
  return u;
}
async function leaseOr404(id: string): Promise<LeaseRow> {
  const [l] = await db.select().from(leases).where(eq(leases.id, id)).limit(1);
  if (!l) throw new DataError('No such lease.', 404);
  return l;
}

async function withTenants(rows: LeaseRow[]): Promise<LeaseView[]> {
  if (!rows.length) return [];
  const t = await db.select({ leaseId: leaseTenants.leaseId, id: users.id, name: users.name, isPrimary: leaseTenants.isPrimary })
    .from(leaseTenants).innerJoin(users, eq(users.id, leaseTenants.userId)).where(inArray(leaseTenants.leaseId, rows.map((r) => r.id)));
  return rows.map((l) => ({
    ...l,
    tenants: t.filter((x) => x.leaseId === l.id).map(({ id, name, isPrimary }) => ({ id, name, isPrimary })).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
  }));
}

/* ---------------- tenants' view ---------------- */

/** Lease ids someone is on (any status) — what charges and documents they may see. */
export async function leaseIdsFor(userId: string): Promise<string[]> {
  return (await db.select({ id: leaseTenants.leaseId }).from(leaseTenants).where(eq(leaseTenants.userId, userId))).map((r) => r.id);
}

/** Someone's current lease, if they rent. */
export async function activeLeaseFor(userId: string): Promise<LeaseView | null> {
  const rows = await db.select({ l: leases }).from(leases).innerJoin(leaseTenants, eq(leaseTenants.leaseId, leases.id))
    .where(and(eq(leaseTenants.userId, userId), eq(leases.status, 'active'))).orderBy(desc(leases.startDate)).limit(1);
  return rows[0] ? (await withTenants([rows[0].l]))[0] : null;
}

/** The lease where this person is the one billed — what the old per-person rent setting maps to. */
export async function primaryLeaseFor(userId: string): Promise<LeaseRow | null> {
  const rows = await db.select({ l: leases }).from(leases).innerJoin(leaseTenants, eq(leaseTenants.leaseId, leases.id))
    .where(and(eq(leaseTenants.userId, userId), eq(leaseTenants.isPrimary, true), eq(leases.status, 'active'))).limit(1);
  return rows[0]?.l ?? null;
}

async function primaryTenant(leaseId: string): Promise<string | null> {
  const rows = await db.select({ userId: leaseTenants.userId, isPrimary: leaseTenants.isPrimary }).from(leaseTenants).where(eq(leaseTenants.leaseId, leaseId));
  return (rows.find((r) => r.isPrimary) ?? rows[0])?.userId ?? null;
}

/* ---------------- reading (managers) ---------------- */

export type UnitSummary = UnitRow & { lease: LeaseView | null; openRequests: number; lastInspection: string | null; stage: LeaseStage | null };

export async function listRentalUnits(): Promise<UnitSummary[]> {
  const today = todayISO();
  const [units, active, reqs, insp] = await Promise.all([
    db.select().from(rentalUnits),
    db.select().from(leases).where(eq(leases.status, 'active')),
    db.select({ unitId: maintenanceRequests.unitId }).from(maintenanceRequests).where(inArray(maintenanceRequests.status, ['open', 'in_progress'])),
    db.select({ unitId: inspections.unitId, date: inspections.date }).from(inspections),
  ]);
  const lv = await withTenants(active);
  return units
    .map((u) => {
      const lease = lv.find((l) => l.unitId === u.id) ?? null;
      return {
        ...u,
        lease,
        openRequests: reqs.filter((r) => r.unitId === u.id).length,
        lastInspection: insp.filter((i) => i.unitId === u.id).map((i) => i.date).sort().pop() ?? null,
        stage: lease ? leaseStage(lease.endDate, lease.noticeDays, today) : null,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function rentalUnitDetail(id: string) {
  const unit = await unitOr404(id);
  const [ls, accounts, insp, reqs] = await Promise.all([
    db.select().from(leases).where(eq(leases.unitId, id)).orderBy(desc(leases.startDate)),
    db.select().from(utilityAccounts).where(eq(utilityAccounts.unitId, id)),
    db.select().from(inspections).where(eq(inspections.unitId, id)).orderBy(desc(inspections.date)),
    db.select().from(maintenanceRequests).where(eq(maintenanceRequests.unitId, id)).orderBy(desc(maintenanceRequests.updatedAt)).limit(20),
  ]);
  const leaseViews = await withTenants(ls);
  const leaseIds = ls.map((l) => l.id);
  const [bills, charges] = await Promise.all([
    accounts.length ? db.select().from(utilityBills).where(inArray(utilityBills.accountId, accounts.map((a) => a.id))).orderBy(desc(utilityBills.period)) : Promise.resolve([]),
    leaseIds.length ? db.select().from(rentCharges).where(inArray(rentCharges.leaseId, leaseIds)).orderBy(desc(rentCharges.month)).limit(36) : Promise.resolve([]),
  ]);
  // Each move-out next to the move-in it should be compared with (same lease, else the latest before it).
  const comparisons = insp
    .filter((i) => i.kind === 'move_out')
    .map((out) => {
      const moveIn = insp.find((i) => i.kind === 'move_in' && i.leaseId && i.leaseId === out.leaseId)
        ?? insp.find((i) => i.kind === 'move_in' && i.date <= out.date);
      return moveIn ? { outId: out.id, inId: moveIn.id, inDate: moveIn.date, changes: compareInspections(moveIn.items, out.items) } : null;
    })
    .filter((c): c is NonNullable<typeof c> => !!c);
  return {
    unit,
    current: leaseViews.find((l) => l.status === 'active') ?? null,
    past: leaseViews.filter((l) => l.status !== 'active'),
    accounts: accounts.map((a) => ({ ...a, bills: bills.filter((b) => b.accountId === a.id).slice(0, 6) })),
    inspections: insp,
    comparisons,
    requests: reqs,
    charges,
  };
}

/* ---------------- units ---------------- */

export type RentalUnitInput = { name: string; kind?: RentalKind; address?: string; notes?: string };

export async function createRentalUnit(user: SessionUser, d: RentalUnitInput): Promise<string> {
  need(user);
  const id = uid('ru');
  await db.insert(rentalUnits).values({ id, name: d.name.trim(), kind: d.kind ?? 'other', address: d.address?.trim() ?? '', notes: d.notes ?? '' });
  publishChange('rent');
  return id;
}

export async function updateRentalUnit(user: SessionUser, id: string, d: Partial<RentalUnitInput> & { active?: boolean }): Promise<void> {
  need(user);
  await unitOr404(id);
  const patch: Partial<typeof rentalUnits.$inferInsert> = {};
  if (d.name?.trim()) patch.name = d.name.trim();
  if (d.kind) patch.kind = d.kind;
  if (d.address !== undefined) patch.address = d.address.trim();
  if (d.notes !== undefined) patch.notes = d.notes;
  if (d.active !== undefined) patch.active = d.active;
  if (Object.keys(patch).length) await db.update(rentalUnits).set(patch).where(eq(rentalUnits.id, id));
  publishChange('rent');
}

/* ---------------- leases ---------------- */

export type LeaseInput = {
  tenantIds: string[]; primaryId?: string; startDate: string; endDate?: string | null; rent: number; dueDay?: number;
  deposit?: number | null; lateFee?: number | null; graceDays?: number; noticeDays?: number; notes?: string;
};

async function checkTenants(ids: string[]): Promise<string[]> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) throw new DataError('Pick at least one tenant.', 400);
  const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, uniq));
  if (found.length !== uniq.length) throw new DataError('One of those people no longer exists.', 400);
  return uniq;
}
function checkTerms(d: { rent?: number; startDate?: string; endDate?: string | null }) {
  if (d.rent !== undefined && !(d.rent > 0)) throw new DataError('Enter the monthly rent.', 400);
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw new DataError('The lease ends before it starts.', 400);
}

export async function createLease(user: SessionUser, unitId: string, d: LeaseInput): Promise<string> {
  need(user);
  const unit = await unitOr404(unitId);
  checkTerms(d);
  const tenants = await checkTenants(d.tenantIds);
  const primary = d.primaryId && tenants.includes(d.primaryId) ? d.primaryId : tenants[0];
  const [open] = await db.select({ id: leases.id }).from(leases).where(and(eq(leases.unitId, unitId), eq(leases.status, 'active'))).limit(1);
  if (open) throw new DataError(`${unit.name} already has an active lease — end it first.`, 409);
  // One person, one bill: they can't be the billed tenant on two active leases.
  if (await primaryLeaseFor(primary)) throw new DataError('That person is already the main tenant on another active lease.', 409);
  const id = uid('ls');
  await runBatch([
    db.insert(leases).values({
      id, unitId, startDate: d.startDate, endDate: d.endDate || null, rent: d.rent, dueDay: Math.min(28, Math.max(1, d.dueDay ?? 1)),
      deposit: d.deposit ?? null, lateFee: d.lateFee ?? null, graceDays: d.graceDays ?? 5, noticeDays: d.noticeDays ?? 60, notes: d.notes ?? '',
    }),
    ...tenants.map((t) => db.insert(leaseTenants).values({ leaseId: id, userId: t, isPrimary: t === primary })),
  ]);
  await logActivity(user.id, `started a lease on ${unit.name}`, { audience: 'finance.view', href: `/more/rentals/${unitId}` });
  publishChange('rent');
  return id;
}

/** Change terms or tenants. Keeps this month's still-unpaid rent in step with new terms. */
export async function updateLease(user: SessionUser, id: string, d: Partial<LeaseInput>): Promise<void> {
  need(user);
  const l = await leaseOr404(id);
  checkTerms({ ...d, startDate: d.startDate ?? l.startDate, endDate: d.endDate === undefined ? l.endDate : d.endDate });
  const patch: Partial<typeof leases.$inferInsert> = {};
  if (d.startDate) patch.startDate = d.startDate;
  if (d.endDate !== undefined) {
    patch.endDate = d.endDate || null;
    patch.reminderStage = null; // a new end date gets its own reminders
    patch.reminderSentOn = null;
  }
  if (d.rent !== undefined) patch.rent = d.rent;
  if (d.dueDay !== undefined) patch.dueDay = Math.min(28, Math.max(1, d.dueDay));
  if (d.deposit !== undefined) patch.deposit = d.deposit;
  if (d.lateFee !== undefined) patch.lateFee = d.lateFee;
  if (d.graceDays !== undefined) patch.graceDays = d.graceDays;
  if (d.noticeDays !== undefined) patch.noticeDays = d.noticeDays;
  if (d.notes !== undefined) patch.notes = d.notes;
  const ops: BatchItem<'sqlite'>[] = [];
  if (Object.keys(patch).length) ops.push(db.update(leases).set(patch).where(eq(leases.id, id)));
  if (d.tenantIds) {
    const tenants = await checkTenants(d.tenantIds);
    const primary = d.primaryId && tenants.includes(d.primaryId) ? d.primaryId : tenants[0];
    ops.push(db.delete(leaseTenants).where(eq(leaseTenants.leaseId, id)));
    ops.push(...tenants.map((t) => db.insert(leaseTenants).values({ leaseId: id, userId: t, isPrimary: t === primary })));
    // This month's unpaid rent follows the billed tenant.
    ops.push(db.update(rentCharges).set({ userId: primary }).where(and(eq(rentCharges.leaseId, id), eq(rentCharges.month, currentMonthKey()), eq(rentCharges.status, 'unpaid'))));
  }
  await runBatch(ops);
  await syncCurrentRentCharge(id);
  publishChange('rent');
}

/** Match this month's unpaid rent charge to the lease's current rent and due day. */
export async function syncCurrentRentCharge(leaseId: string): Promise<void> {
  const l = await leaseOr404(leaseId);
  const mk = currentMonthKey();
  await db.update(rentCharges).set({ amount: l.rent, dueDate: `${mk}-${pad2(l.dueDay)}` })
    .where(and(eq(rentCharges.leaseId, leaseId), eq(rentCharges.month, mk), eq(rentCharges.kind, 'rent'), eq(rentCharges.status, 'unpaid')));
}

/** End a lease. Unpaid rent for months after it ends is dropped; anything else stays to be settled. */
export async function endLease(user: SessionUser, id: string, endDate = todayISO()): Promise<void> {
  need(user);
  const l = await leaseOr404(id);
  if (endDate < l.startDate) throw new DataError('A lease can’t end before it starts.', 400);
  const unpaid = await db.select().from(rentCharges).where(and(eq(rentCharges.leaseId, id), eq(rentCharges.kind, 'rent'), eq(rentCharges.status, 'unpaid')));
  // Rent due after the last day isn't owed.
  const drop = unpaid.filter((c) => c.dueDate > endDate).map((c) => c.id);
  await runBatch([
    db.update(leases).set({ status: 'ended', endDate }).where(eq(leases.id, id)),
    ...(drop.length ? [db.delete(rentCharges).where(inArray(rentCharges.id, drop))] : []),
  ]);
  const unit = await unitOr404(l.unitId);
  await logActivity(user.id, `ended the lease on ${unit.name}`, { audience: 'finance.view', href: `/more/rentals/${l.unitId}` });
  publishChange('rent');
}

/* ---------------- utilities ---------------- */

export async function addUtilityAccount(user: SessionUser, unitId: string, d: { kind: UtilityKind; provider?: string; accountNo?: string; billBackPct?: number }): Promise<string> {
  need(user);
  await unitOr404(unitId);
  const id = uid('ua');
  await db.insert(utilityAccounts).values({ id, unitId, kind: d.kind, provider: d.provider?.trim() ?? '', accountNo: d.accountNo?.trim() ?? '', billBackPct: Math.min(100, Math.max(0, Math.round(d.billBackPct ?? 100))) });
  publishChange('rent');
  return id;
}

export async function updateUtilityAccount(user: SessionUser, id: string, d: { provider?: string; accountNo?: string; billBackPct?: number; active?: boolean }): Promise<void> {
  need(user);
  const patch: Partial<typeof utilityAccounts.$inferInsert> = {};
  if (d.provider !== undefined) patch.provider = d.provider.trim();
  if (d.accountNo !== undefined) patch.accountNo = d.accountNo.trim();
  if (d.billBackPct !== undefined) patch.billBackPct = Math.min(100, Math.max(0, Math.round(d.billBackPct)));
  if (d.active !== undefined) patch.active = d.active;
  if (Object.keys(patch).length) await db.update(utilityAccounts).set(patch).where(eq(utilityAccounts.id, id));
  publishChange('rent');
}

/**
 * Record a utility bill. If the tenant pays a share and the unit has an active
 * lease, their share becomes a charge on the rent page, due in two weeks.
 */
export async function addUtilityBill(user: SessionUser, accountId: string, d: { period: string; amount: number; notes?: string }): Promise<{ id: string; chargeId: string | null }> {
  need(user);
  const [a] = await db.select().from(utilityAccounts).where(eq(utilityAccounts.id, accountId)).limit(1);
  if (!a) throw new DataError('No such utility account.', 404);
  if (!(d.amount > 0)) throw new DataError('Enter the bill amount.', 400);
  const unit = await unitOr404(a.unitId);
  const [lease] = await db.select().from(leases).where(and(eq(leases.unitId, a.unitId), eq(leases.status, 'active'))).limit(1);
  const share = Math.round(d.amount * a.billBackPct) / 100;
  const tenant = lease && share > 0 ? await primaryTenant(lease.id) : null;
  const id = uid('ub');
  const chargeId = tenant ? uid('rc') : null;
  const label = `${UTILITY_LABEL[a.kind]} · ${monthLabel(d.period)}${a.billBackPct < 100 ? ` (${a.billBackPct}%)` : ''}`;
  await runBatch([
    ...(chargeId && lease && tenant
      ? [db.insert(rentCharges).values({ id: chargeId, userId: tenant, leaseId: lease.id, kind: 'utility', label, month: currentMonthKey(), amount: share, dueDate: addDays(todayISO(), 14), status: 'unpaid' })]
      : []),
    db.insert(utilityBills).values({ id, accountId, period: d.period, amount: d.amount, chargeId, notes: d.notes ?? '', userId: user.id }),
  ]);
  await logActivity(user.id, `recorded ${UTILITY_LABEL[a.kind].toLowerCase()} bill for ${unit.name}${chargeId ? ` ($${share.toFixed(2)} billed to tenant)` : ''}`, { audience: 'finance.view', href: `/more/rentals/${a.unitId}` });
  publishChange('rent');
  return { id, chargeId };
}

/** Remove a bill, and its tenant charge if that hasn't been paid. */
export async function deleteUtilityBill(user: SessionUser, id: string): Promise<void> {
  need(user);
  const [b] = await db.select().from(utilityBills).where(eq(utilityBills.id, id)).limit(1);
  if (!b) throw new DataError('No such bill.', 404);
  const [c] = b.chargeId ? await db.select().from(rentCharges).where(eq(rentCharges.id, b.chargeId)).limit(1) : [];
  if (c && c.status !== 'unpaid') throw new DataError('The tenant has already paid their share — reopen that charge first.', 409);
  await runBatch([
    db.delete(utilityBills).where(eq(utilityBills.id, id)),
    ...(c ? [db.delete(rentCharges).where(eq(rentCharges.id, c.id))] : []),
  ]);
  publishChange('rent');
}

/* ---------------- inspections ---------------- */

export async function addInspection(user: SessionUser, unitId: string, d: { kind: InspectionKind; date: string; items: InspectionItem[]; notes?: string }): Promise<string> {
  need(user);
  const unit = await unitOr404(unitId);
  const items = d.items.filter((i) => i.area.trim()).map((i) => ({ area: i.area.trim(), condition: i.condition, notes: i.notes.trim() }));
  if (!items.length) throw new DataError('Rate at least one area.', 400);
  // Tie it to the lease it belongs to: the active one, or for a move-out the latest.
  const [lease] = await db.select().from(leases).where(eq(leases.unitId, unitId)).orderBy(desc(leases.status), desc(leases.startDate)).limit(1);
  const id = uid('in');
  await db.insert(inspections).values({ id, unitId, leaseId: lease?.id ?? null, kind: d.kind, date: d.date, items, notes: d.notes ?? '', userId: user.id });
  await logActivity(user.id, `recorded a ${d.kind.replace('_', '-')} inspection of ${unit.name}`, { audience: 'finance.view', href: `/more/rentals/${unitId}` });
  publishChange('rent');
  return id;
}

export async function deleteInspection(user: SessionUser, id: string): Promise<void> {
  need(user);
  await db.delete(inspections).where(eq(inspections.id, id));
  publishChange('rent');
}

/* ---------------- daily jobs ---------------- */

/** Add each lease's late fee once, after its grace days, to rent still unpaid. */
export async function applyLateFees(today = todayISO()): Promise<number> {
  const rows = await db.select({ c: rentCharges, l: leases }).from(rentCharges).innerJoin(leases, eq(leases.id, rentCharges.leaseId))
    .where(and(eq(rentCharges.kind, 'rent'), eq(rentCharges.status, 'unpaid')));
  const due = rows.filter((r) => (r.l.lateFee ?? 0) > 0 && lateFeeDue(r.c.dueDate, today, r.l.graceDays));
  if (!due.length) return 0;
  const existing = await db.select({ leaseId: rentCharges.leaseId, month: rentCharges.month }).from(rentCharges)
    .where(and(eq(rentCharges.kind, 'late_fee'), inArray(rentCharges.leaseId, due.map((r) => r.l.id))));
  const have = new Set(existing.map((e) => `${e.leaseId}|${e.month}`));
  const add = due.filter((r) => !have.has(`${r.l.id}|${r.c.month}`));
  if (!add.length) return 0;
  await db.insert(rentCharges).values(add.map((r) => ({
    id: uid('rc'), userId: r.c.userId, leaseId: r.l.id, kind: 'late_fee' as const, label: `Late fee · ${monthLabel(r.c.month)}`,
    month: r.c.month, amount: r.l.lateFee!, dueDate: today, status: 'unpaid' as const,
  })));
  publishChange('rent');
  return add.length;
}

/** Leases whose end is coming (or has passed) and haven't had this stage's reminder. Marks them sent. */
export async function leaseRemindersDue(today = todayISO()): Promise<{ leaseId: string; unitId: string; unitName: string; stage: LeaseStage; endDate: string; tenants: string[] }[]> {
  const rows = await db.select({ l: leases, unitName: rentalUnits.name }).from(leases).innerJoin(rentalUnits, eq(rentalUnits.id, leases.unitId))
    .where(and(eq(leases.status, 'active'), isNotNull(leases.endDate)));
  const out: { leaseId: string; unitId: string; unitName: string; stage: LeaseStage; endDate: string; tenants: string[] }[] = [];
  for (const { l, unitName } of rows) {
    const stage = leaseStage(l.endDate, l.noticeDays, today);
    if (!stage || stage === l.reminderStage) continue;
    await db.update(leases).set({ reminderStage: stage, reminderSentOn: today }).where(eq(leases.id, l.id));
    const t = await withTenants([l]);
    out.push({ leaseId: l.id, unitId: l.unitId, unitName, stage, endDate: l.endDate!, tenants: t[0].tenants.map((x) => x.name) });
  }
  return out;
}

export function leaseReminderText(r: { unitName: string; stage: LeaseStage; endDate: string; tenants: string[] }): string {
  const who = r.tenants.join(' & ') || 'the tenant';
  return r.stage === 'renewal' ? `${r.unitName}: ${who}’s lease ends ${fmtDate(r.endDate)} — time to talk renewal.`
    : r.stage === 'ending' ? `${r.unitName}: ${who}’s lease ends ${fmtDate(r.endDate)}. Renew, extend or plan the move-out inspection.`
      : `${r.unitName}: ${who}’s lease ended ${fmtDate(r.endDate)} but is still active. Extend it or end it.`;
}
