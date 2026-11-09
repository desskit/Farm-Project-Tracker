/** Rentals: leases bill rent, co-tenants pay, utilities bill back, late fees once, lease reminders once. */
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import {
  addInspection, addUtilityAccount, addUtilityBill, applyLateFees, createLease, createRentalUnit, deleteUtilityBill, endLease, leaseRemindersDue, rentalUnitDetail, updateLease,
} from '@/lib/data/rentals';
import { ensureRentCharges, markRentPaid, rentAssignmentFor, setRent, stopRent } from '@/lib/data/rent';
import { createRequest } from '@/lib/data/requests';
import { addDays, currentMonthKey, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const mk = currentMonthKey();
const charges = (leaseId: string) => db.select().from(schema.rentCharges).where(eq(schema.rentCharges.leaseId, leaseId));

describe('rentals', () => {
  it('bills one rent per lease per month to the primary tenant; co-tenants can pay it', async () => {
    const mgr = await makeUser('manager');
    const a = await makeUser('renter');
    const b = await makeUser('renter');
    const unit = await createRentalUnit(mgr, { name: 'Cabin', kind: 'cabin' });
    const lease = await createLease(mgr, unit, { tenantIds: [a.id, b.id], primaryId: a.id, startDate: `${mk}-01`, rent: 800, dueDay: 5 });
    await expect(createLease(mgr, unit, { tenantIds: [b.id], startDate: T, rent: 1 })).rejects.toThrow(/already has an active lease/);
    await ensureRentCharges();
    await ensureRentCharges();
    const [c] = await charges(lease);
    expect((await charges(lease)).length).toBe(1);
    expect([c.userId, c.amount, c.dueDate]).toEqual([a.id, 800, `${mk}-05`]);
    await markRentPaid(b, c.id);
    await updateLease(mgr, lease, { rent: 850 });
    expect((await charges(lease))[0].amount).toBe(800); // already marked paid: left alone
    expect((await rentAssignmentFor(a.id))?.amount).toBe(850);
    const outsider = await makeUser('renter');
    await expect(markRentPaid(outsider, c.id)).rejects.toThrow(/Only the renter/);
  });

  it('keeps the simple per-person rent controls working on top of leases', async () => {
    const mgr = await makeUser('manager');
    const r = await makeUser('renter', 'Pat');
    await setRent(mgr, r.id, 500, 1);
    const l = await rentAssignmentFor(r.id);
    expect(l?.amount).toBe(500);
    await ensureRentCharges();
    await setRent(mgr, r.id, 550, 3);
    expect((await charges(l!.leaseId))[0]).toMatchObject({ amount: 550, dueDate: `${mk}-03` });
    await stopRent(mgr, r.id);
    expect(await rentAssignmentFor(r.id)).toBeNull();
    expect(await charges(l!.leaseId)).toHaveLength(0);
  });

  it('bills the tenant’s share of a utility, and takes it back if the bill is removed', async () => {
    const mgr = await makeUser('manager');
    const r = await makeUser('renter');
    const unit = await createRentalUnit(mgr, { name: 'House' });
    const lease = await createLease(mgr, unit, { tenantIds: [r.id], startDate: T, rent: 1000 });
    const acct = await addUtilityAccount(mgr, unit, { kind: 'electric', billBackPct: 50 });
    const { id, chargeId } = await addUtilityBill(mgr, acct, { period: mk, amount: 120.5 });
    const [c] = await db.select().from(schema.rentCharges).where(eq(schema.rentCharges.id, chargeId!));
    expect([c.kind, c.amount, c.userId, c.leaseId]).toEqual(['utility', 60.25, r.id, lease]);
    await deleteUtilityBill(mgr, id);
    expect(await db.select().from(schema.rentCharges).where(eq(schema.rentCharges.id, chargeId!))).toHaveLength(0);
  });

  it('adds a late fee once, after the grace days', async () => {
    const mgr = await makeUser('manager');
    const r = await makeUser('renter');
    const unit = await createRentalUnit(mgr, { name: 'Apt 2' });
    const lease = await createLease(mgr, unit, { tenantIds: [r.id], startDate: '2026-01-01', rent: 700, lateFee: 35, graceDays: 3 });
    await db.insert(schema.rentCharges).values({ id: 'rc-late', userId: r.id, leaseId: lease, month: '2026-01', amount: 700, dueDate: '2026-01-01' });
    expect(await applyLateFees('2026-01-04')).toBe(0);
    expect(await applyLateFees('2026-01-05')).toBe(1);
    expect(await applyLateFees('2026-01-06')).toBe(0);
    const fees = await db.select().from(schema.rentCharges).where(and(eq(schema.rentCharges.leaseId, lease), eq(schema.rentCharges.kind, 'late_fee')));
    expect(fees.map((f) => f.amount)).toEqual([35]);
  });

  it('reminds about a lease end once per stage, ends cleanly, and compares move-in with move-out', async () => {
    const mgr = await makeUser('manager');
    const r = await makeUser('renter');
    const unit = await createRentalUnit(mgr, { name: 'Room 1' });
    const lease = await createLease(mgr, unit, { tenantIds: [r.id], startDate: addDays(T, -300), endDate: addDays(T, 30), rent: 400, noticeDays: 60 });
    const first = await leaseRemindersDue(T);
    expect(first.filter((x) => x.leaseId === lease).map((x) => x.stage)).toEqual(['renewal']);
    expect((await leaseRemindersDue(T)).some((x) => x.leaseId === lease)).toBe(false);
    expect((await leaseRemindersDue(addDays(T, 20))).find((x) => x.leaseId === lease)?.stage).toBe('ending');

    const rq = await createRequest(r, { title: 'Door sticks' });
    await addInspection(mgr, unit, { kind: 'move_in', date: addDays(T, -300), items: [{ area: 'Kitchen', condition: 'good', notes: '' }] });
    await endLease(mgr, lease, T);
    await addInspection(mgr, unit, { kind: 'move_out', date: T, items: [{ area: 'Kitchen', condition: 'poor', notes: 'burn' }] });
    const d = await rentalUnitDetail(unit);
    expect(d.current).toBeNull();
    expect(d.past[0].tenants[0].id).toBe(r.id);
    expect(d.requests.map((x) => x.id)).toEqual([rq]);
    expect(d.comparisons[0].changes.filter((c) => c.worse).map((c) => c.area)).toEqual(['Kitchen']);
  });

  it('only lets rental managers manage rentals', async () => {
    const family = await makeUser('family');
    await expect(createRentalUnit(family, { name: 'x' })).rejects.toThrow(/Only managers/);
  });
});
