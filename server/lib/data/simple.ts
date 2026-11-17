/**
 * What the Simple home shows a land owner about rent: this month's charges,
 * one line per unit and tenant, in plain words.
 */
import 'server-only';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { leases, rentalUnits, users } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { currentMonthKey, todayISO } from '@/lib/domain/dates';
import { DataError } from './errors';
import { ensureRentCharges, rentChargesForMonth, rentSummary } from './rent';

export type RentBoardStatus = 'paid' | 'waiting' | 'owed' | 'late';
export type RentBoardRow = {
  id: string;
  /** "Cabin · Laura", or just the tenant for charges from before units. */
  who: string;
  /** "Rent", "Water", "Late fee"… */
  what: string;
  amount: number;
  dueDate: string;
  status: RentBoardStatus;
};
export type RentBoard = { month: string; rows: RentBoardRow[]; paidCount: number; collected: number; owed: number; waiting: number };

const ORDER: Record<RentBoardStatus, number> = { waiting: 0, late: 1, owed: 2, paid: 3 };

export async function rentBoard(viewer: SessionUser, month = currentMonthKey(), today = todayISO()): Promise<RentBoard> {
  if (!can(viewer, 'finance.view')) throw new DataError('Not found.', 404);
  await ensureRentCharges();
  const charges = await rentChargesForMonth(month);
  const leaseIds = [...new Set(charges.map((c) => c.leaseId).filter((x): x is string => !!x))];
  const [leaseRows, people] = await Promise.all([
    leaseIds.length ? db.select({ id: leases.id, unitId: leases.unitId }).from(leases).where(inArray(leases.id, leaseIds)) : Promise.resolve([]),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const unitIds = [...new Set(leaseRows.map((l) => l.unitId))];
  const units = unitIds.length ? await db.select({ id: rentalUnits.id, name: rentalUnits.name }).from(rentalUnits).where(inArray(rentalUnits.id, unitIds)) : [];
  const unitOfLease = new Map(leaseRows.map((l) => [l.id, units.find((u) => u.id === l.unitId)?.name ?? '']));
  const name = new Map(people.map((p) => [p.id, p.name]));

  const rows: RentBoardRow[] = charges.map((c) => {
    const unit = c.leaseId ? unitOfLease.get(c.leaseId) : '';
    const tenant = name.get(c.userId) ?? 'Former tenant';
    const status: RentBoardStatus = c.status === 'verified' ? 'paid' : c.status === 'marked' ? 'waiting' : c.dueDate < today ? 'late' : 'owed';
    return {
      id: c.id,
      who: unit ? `${unit} · ${tenant}` : tenant,
      what: c.kind === 'rent' ? 'Rent' : c.label || (c.kind === 'late_fee' ? 'Late fee' : 'Charge'),
      amount: c.amount,
      dueDate: c.dueDate,
      status,
    };
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.who.localeCompare(b.who));

  const sum = rentSummary(charges);
  return {
    month,
    rows,
    paidCount: rows.filter((r) => r.status === 'paid').length,
    collected: sum.collected,
    owed: Math.round((sum.due - sum.collected) * 100) / 100,
    waiting: rows.filter((r) => r.status === 'waiting').length,
  };
}
