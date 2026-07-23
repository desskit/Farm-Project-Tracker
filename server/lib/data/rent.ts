/**
 * Rent data-access layer — ported from js/store.js's rent functions. Managers
 * assign/stop/verify/reopen; a worker (or manager) can mark their own charge
 * paid. Monthly charges are created lazily for active assignments on read
 * (ensureRentCharges), mirroring the prototype.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { rentAssignments, rentCharges, users } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO, currentMonthKey } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';

export type RentAssignmentRow = typeof rentAssignments.$inferSelect;
export type RentChargeRow = typeof rentCharges.$inferSelect;
export type RentSummary = { count: number; unpaid: number; marked: number; verified: number; due: number; collected: number };

function isManager(u: SessionUser): boolean {
  return u.role === 'manager' || u.role === 'admin';
}
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export async function rentAssignmentFor(userId: string): Promise<RentAssignmentRow | null> {
  const rows = await db.select().from(rentAssignments).where(eq(rentAssignments.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function setRent(user: SessionUser, targetUserId: string, amount: number, dueDay: number): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can assign rent.', 403);
  const amt = Number(amount);
  const day = Math.min(28, Math.max(1, Number(dueDay) || 1));
  if (!isFinite(amt) || amt <= 0) throw new DataError('Enter a valid monthly amount.', 400);
  const target = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target.length) throw new DataError('No such person.', 404);

  const existing = await rentAssignmentFor(targetUserId);
  if (existing) {
    await db.update(rentAssignments).set({ amount: amt, dueDay: day, active: true }).where(eq(rentAssignments.userId, targetUserId));
  } else {
    await db.insert(rentAssignments).values({ userId: targetUserId, amount: amt, dueDay: day, active: true });
  }

  // Keep this month's still-unpaid charge in sync with the new terms.
  const mk = currentMonthKey();
  const ch = await db
    .select()
    .from(rentCharges)
    .where(and(eq(rentCharges.userId, targetUserId), eq(rentCharges.month, mk)))
    .limit(1);
  if (ch[0] && ch[0].status === 'unpaid') {
    await db.update(rentCharges).set({ amount: amt, dueDate: `${mk}-${pad2(day)}` }).where(eq(rentCharges.id, ch[0].id));
  }
  publishChange('rent');
}

export async function stopRent(user: SessionUser, targetUserId: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can stop rent.', 403);
  await db.update(rentAssignments).set({ active: false }).where(eq(rentAssignments.userId, targetUserId));
  const mk = currentMonthKey();
  const charges = await db.select().from(rentCharges).where(and(eq(rentCharges.userId, targetUserId), eq(rentCharges.month, mk)));
  for (const c of charges) {
    if (c.status === 'unpaid') await db.delete(rentCharges).where(eq(rentCharges.id, c.id));
  }
  publishChange('rent');
}

/** Lazily create this month's charge for every active assignment. */
async function ensureRentCharges(): Promise<void> {
  const mk = currentMonthKey();
  const assignments = await db.select().from(rentAssignments).where(eq(rentAssignments.active, true));
  const existing = await db.select({ userId: rentCharges.userId }).from(rentCharges).where(eq(rentCharges.month, mk));
  const have = new Set(existing.map((c) => c.userId));
  const toCreate = assignments.filter((a) => !have.has(a.userId));
  if (toCreate.length) {
    await db.insert(rentCharges).values(
      toCreate.map((a) => ({
        id: uid('rc'),
        userId: a.userId,
        month: mk,
        amount: a.amount,
        dueDate: `${mk}-${pad2(a.dueDay)}`,
        status: 'unpaid' as const,
      })),
    );
  }
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
  if (c.userId !== user.id && !isManager(user)) throw new DataError('Only the renter or a manager can mark this paid.', 403);
  if (c.status === 'verified') throw new DataError('Already verified.', 400);
  await db
    .update(rentCharges)
    .set({ status: 'marked', markedAt: todayISO(), markedBy: user.id, note: note != null ? note : c.note })
    .where(eq(rentCharges.id, chargeId));
  await logActivity(user.id, `marked rent paid (${c.month})`);
}

export async function verifyRent(user: SessionUser, chargeId: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can verify rent.', 403);
  const c = await rentChargeById(chargeId);
  if (!c) throw new DataError('No such charge.', 404);
  if (c.status === 'verified') throw new DataError('Already verified.', 400);
  const patch: Partial<typeof rentCharges.$inferInsert> = { status: 'verified', verifiedAt: todayISO(), verifiedBy: user.id };
  if (c.status === 'unpaid') {
    patch.markedAt = todayISO();
    patch.markedBy = user.id;
  }
  await db.update(rentCharges).set(patch).where(eq(rentCharges.id, chargeId));
  await logActivity(user.id, `verified rent (${c.month})`);
}

export async function reopenRent(user: SessionUser, chargeId: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can reopen a charge.', 403);
  const c = await rentChargeById(chargeId);
  if (!c) throw new DataError('No such charge.', 404);
  await db
    .update(rentCharges)
    .set({ status: 'unpaid', markedAt: null, markedBy: null, verifiedAt: null, verifiedBy: null })
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
