/** Simple mode: the land owner's rent board. */
import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { rentBoard } from '@/lib/data/simple';
import { createLease, createRentalUnit } from '@/lib/data/rentals';
import { ensureRentCharges, markRentPaid, verifyRent } from '@/lib/data/rent';
import { addDays, currentMonthKey, todayISO } from '@/lib/domain/dates';

await useTestDb();
const mk = currentMonthKey();
const T = todayISO();

describe('rent board', () => {
  it('names each line by unit and tenant, says where it stands, and adds it up', async () => {
    const owner = await makeUser('manager', 'Owner');
    const laura = await makeUser('renter', 'Laura');
    const sam = await makeUser('renter', 'Sam');
    const kim = await makeUser('renter', 'Kim');
    const crew = await makeUser('worker', 'Crew');
    const cabin = await createRentalUnit(owner, { name: 'Cabin', kind: 'cabin' });
    const house = await createRentalUnit(owner, { name: 'House', kind: 'house' });
    const barn = await createRentalUnit(owner, { name: 'Barn loft', kind: 'other' });
    await createLease(owner, cabin, { tenantIds: [laura.id], primaryId: laura.id, startDate: `${mk}-01`, rent: 800, dueDay: 28 });
    await createLease(owner, house, { tenantIds: [sam.id], primaryId: sam.id, startDate: `${mk}-01`, rent: 1200, dueDay: 28 });
    await createLease(owner, barn, { tenantIds: [kim.id], primaryId: kim.id, startDate: `${mk}-01`, rent: 500, dueDay: 28 });
    await ensureRentCharges();

    let b = await rentBoard(owner, mk, T);
    const id = (who: string) => b.rows.find((r) => r.who.includes(who))!.id;
    await markRentPaid(laura, id('Laura')); // says they paid
    await verifyRent(owner, id('Sam')); // cash handed over: recorded straight from unpaid

    b = await rentBoard(owner, mk, T);
    expect(b.rows.map((r) => [r.who, r.what, r.status])).toEqual([
      ['Cabin · Laura', 'Rent', 'waiting'], // needs the owner's OK first
      ['Barn loft · Kim', 'Rent', 'owed'],
      ['House · Sam', 'Rent', 'paid'],
    ]);
    expect(b).toMatchObject({ paidCount: 1, collected: 1200, owed: 1300, waiting: 1 });

    // After the due date, unpaid rent reads as late.
    const late = await rentBoard(owner, mk, addDays(`${mk}-28`, 1));
    expect(late.rows.find((r) => r.who.includes('Kim'))?.status).toBe('late');

    // Only people who see the farm's money get the board.
    await expect(rentBoard(crew, mk, T)).rejects.toThrow();
    await expect(rentBoard(laura, mk, T)).rejects.toThrow();
  });
});
