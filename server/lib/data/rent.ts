/**
 * Rent charges. Rent is billed per lease (see ./rentals.ts): one 'rent'
 * charge per active lease per month, to the lease's primary tenant; utility
 * shares and late fees are charges too. Managers verify/reopen; anyone on the
 * lease can mark a charge paid. Charges are created on read and nightly
 * (ensureRentCharges).
 *
 * setRent / stopRent / rentAssignmentFor keep the simple "this person pays
 * $X on day N" controls working: they act on that person's lease.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { leaseTenants, leases, rentCharges, rentalUnits, users } from '@/db/schema';
import { leaseCoversMonth } from '@/lib/domain/rentals';
import { leaseIdsFor, primaryLeaseFor, syncCurrentRentCharge } from './rentals';
import { uid } from '@/lib/ids';
import { todayISO, currentMonthKey } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';
import { can } from '@/lib/domain/permissions';

/** The simple per-person view of rent: what they're billed and when, from their lease. */
export type RentAssignmentRow = { userId: string; amount: number; dueDay: number; active: boolean; leaseId: string };
export type RentChargeRow = typeof rentCharges.$inferSelect;
export type RentSummary = { count: number; unpaid: number; marked: number; verified: number; due: number; collected: number };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export async function rentAssignmentFor(userId: string): Promise<RentAssignmentRow | null> {
  const l = await primaryLeaseFor(userId);
  return l ? { userId, amount: l.rent, dueDay: l.dueDay, active: true, leaseId: l.id } : null;
}

/**
 * "This person pays $X on day N": updates their lease, or — for someone
 * without one — creates a unit in their name with a month-to-month lease.
 */
export async function setRent(user: SessionUser, targetUserId: string, amount: number, dueDay: number): Promise<void> {
  if (!can(user, 'finance.manage')) throw new DataError('Only managers and admins can assign rent.', 403);
  const amt = Number(amount);
  const day = Math.min(28, Math.max(1, Number(dueDay) || 1));
  if (!isFinite(amt) || amt <= 0) throw new DataError('Enter a valid monthly amount.', 400);
  const target = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target.length) throw new DataError('No such person.', 404);

  const existing = await primaryLeaseFor(targetUserId);
  if (existing) {
    await db.update(leases).set({ rent: amt, dueDay: day }).where(eq(leases.id, existing.id));
    await syncCurrentRentCharge(existing.id);
  } else {
    const unitId = uid('ru');
    const leaseId = uid('ls');
    await db.batch([
      db.insert(rentalUnits).values({ id: unitId, name: `${target[0].name}'s place`, kind: 'other' }),
      db.insert(leases).values({ id: leaseId, unitId, startDate: todayISO(), rent: amt, dueDay: day, notes: 'Month to month.' }),
      db.insert(leaseTenants).values({ leaseId, userId: targetUserId, isPrimary: true }),
    ]);
  }
  publishChange('rent');
}

/** Stop billing someone: ends their lease today and drops this month's unpaid rent. */
export async function stopRent(user: SessionUser, targetUserId: string): Promise<void> {
  if (!can(user, 'finance.manage')) throw new DataError('Only managers and admins can stop rent.', 403);
  const l = await primaryLeaseFor(targetUserId);
  if (!l) return;
  const mk = currentMonthKey();
  await db.batch([
    db.update(leases).set({ status: 'ended', endDate: todayISO() < l.startDate ? l.startDate : todayISO() }).where(eq(leases.id, l.id)),
    db.delete(rentCharges).where(and(eq(rentCharges.leaseId, l.id), eq(rentCharges.month, mk), eq(rentCharges.kind, 'rent'), eq(rentCharges.status, 'unpaid'))),
  ]);
  publishChange('rent');
}

/**
 * Create this month's rent charge for every active lease that runs this month.
 *
 * Called on read (so the rent page is always current) and nightly by cron —
 * the reminder job can't warn anyone about a charge that doesn't exist yet.
 */
export async function ensureRentCharges(): Promise<void> {
  const mk = currentMonthKey();
  const active = (await db.select().from(leases).where(eq(leases.status, 'active'))).filter((l) => leaseCoversMonth(l, mk));
  if (!active.length) return;
  const [existing, tenants] = await Promise.all([
    db.select({ leaseId: rentCharges.leaseId }).from(rentCharges).where(and(eq(rentCharges.month, mk), eq(rentCharges.kind, 'rent'))),
    db.select().from(leaseTenants).where(inArray(leaseTenants.leaseId, active.map((l) => l.id))),
  ]);
  const have = new Set(existing.map((c) => c.leaseId));
  const toCreate = active
    .filter((l) => !have.has(l.id))
    .map((l) => ({ l, payer: (tenants.find((t) => t.leaseId === l.id && t.isPrimary) ?? tenants.find((t) => t.leaseId === l.id))?.userId }))
    .filter((x): x is { l: typeof x.l; payer: string } => !!x.payer);
  if (toCreate.length) {
    await db.insert(rentCharges).values(
      toCreate.map(({ l, payer }) => ({
        id: uid('rc'),
        userId: payer,
        leaseId: l.id,
        kind: 'rent' as const,
        month: mk,
        amount: l.rent,
        dueDate: `${mk}-${pad2(l.dueDay)}`,
        status: 'unpaid' as const,
      })),
    )
      // The page and the nightly cron can both get here for the same month.
      // The (lease, month) unique index makes the loser of that race a no-op
      // instead of a second bill.
      .onConflictDoNothing();
  }
}

/** Charges someone can see as a tenant: billed to them, or on a lease they're on. */
export async function chargeIsMine(userId: string, c: Pick<RentChargeRow, 'userId' | 'leaseId'>, myLeases?: string[]): Promise<boolean> {
  if (c.userId === userId) return true;
  if (!c.leaseId) return false;
  return (myLeases ?? (await leaseIdsFor(userId))).includes(c.leaseId);
}

export async function rentChargesForMonth(mk: string): Promise<RentChargeRow[]> {
  await ensureRentCharges();
  const [charges, allUsers] = await Promise.all([
    db.select().from(rentCharges).where(eq(rentCharges.month, mk)),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const name = new Map(allUsers.map((u) => [u.id, u.name]));
  return charges.sort((a, b) => ((name.get(a.userId) ?? '') < (name.get(b.userId) ?? '') ? -1 : 1));
}

export async function rentChargeById(id: string): Promise<RentChargeRow | null> {
  const rows = await db.select().from(rentCharges).where(eq(rentCharges.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function rentHistoryFor(userId: string): Promise<RentChargeRow[]> {
  const rows = await db.select().from(rentCharges).where(eq(rentCharges.userId, userId));
  return rows.sort((a, b) => (a.month < b.month ? 1 : -1));
}

export async function markRentPaid(user: SessionUser, chargeId: string, note?: string): Promise<void> {
  const c = await rentChargeById(chargeId);
  if (!c) throw new DataError('No such charge.', 404);
  if (!can(user, 'finance.manage') && !(await chargeIsMine(user.id, c))) throw new DataError('Only the renter or a manager can mark this paid.', 403);
  if (c.status === 'verified') throw new DataError('Already verified.', 400);
  await db
    .update(rentCharges)
    .set({
      status: 'marked',
      markedAt: todayISO(),
      markedBy: user.id,
      note: note != null ? note : c.note,
      // Paid — stop reminding, and clear the stage so a later reopen starts fresh.
      reminderStage: null,
      reminderSentOn: null,
    })
    .where(eq(rentCharges.id, chargeId));
  publishChange('rent');
  await logActivity(user.id, `marked ${c.kind === 'rent' ? 'rent' : c.label || 'a charge'} paid (${c.month})`, { audience: 'finance.view', href: '/more/rent' });
}

export async function verifyRent(user: SessionUser, chargeId: string): Promise<void> {
  if (!can(user, 'finance.manage')) throw new DataError('Only managers and admins can verify rent.', 403);
  const c = await rentChargeById(chargeId);
  if (!c) throw new DataError('No such charge.', 404);
  if (c.status === 'verified') throw new DataError('Already verified.', 400);
  const patch: Partial<typeof rentCharges.$inferInsert> = { status: 'verified', verifiedAt: todayISO(), verifiedBy: user.id };
  if (c.status === 'unpaid') {
    patch.markedAt = todayISO();
    patch.markedBy = user.id;
  }
  await db.update(rentCharges).set(patch).where(eq(rentCharges.id, chargeId));
  publishChange('rent');
  await logActivity(user.id, `verified ${c.kind === 'rent' ? 'rent' : c.label || 'a charge'} (${c.month})`, { audience: 'finance.view', href: '/more/rent' });
}

export async function reopenRent(user: SessionUser, chargeId: string): Promise<void> {
  if (!can(user, 'finance.manage')) throw new DataError('Only managers and admins can reopen a charge.', 403);
  const c = await rentChargeById(chargeId);
  if (!c) throw new DataError('No such charge.', 404);
  await db
    .update(rentCharges)
    .set({
      status: 'unpaid',
      markedAt: null,
      markedBy: null,
      verifiedAt: null,
      verifiedBy: null,
      reminderStage: null,
      reminderSentOn: null,
    })
    .where(eq(rentCharges.id, chargeId));
  publishChange('rent');
}

export function rentSummary(charges: RentChargeRow[]): RentSummary {
  const s: RentSummary = { count: charges.length, unpaid: 0, marked: 0, verified: 0, due: 0, collected: 0 };
  for (const c of charges) {
    s.due += c.amount;
    if (c.status === 'verified') {
      s.verified++;
      s.collected += c.amount;
    } else if (c.status === 'marked') s.marked++;
    else s.unpaid++;
  }
  return s;
}
