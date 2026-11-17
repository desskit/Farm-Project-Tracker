/** Equipment checkout. */
import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { checkIn, checkOut, checkoutsFor, listEquipment, runCheckoutReminders } from '@/lib/data/equipment';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

describe('equipment checkout', () => {
  it('has one holder at a time, and only they or a manager bring it back', async () => {
    const boss = await makeUser('manager', 'Boss');
    const sam = await makeUser('worker', 'Sam');
    const kim = await makeUser('worker', 'Kim');
    const renter = await makeUser('renter', 'Rae');
    await db.insert(schema.assets).values([
      { id: 'a-saw', name: 'Chainsaw', category: 'Tools' },
      { id: 'a-barn', name: 'Big barn', category: 'Building' },
    ]);
    expect((await listEquipment(sam)).map((e) => e.name)).toEqual(['Chainsaw']); // buildings aren't taken out
    await expect(checkOut(sam, 'a-barn')).rejects.toThrow(/isn’t something/);
    await expect(checkOut(renter, 'a-saw')).rejects.toThrow();

    await checkOut(sam, 'a-saw', { dueBack: addDays(T, 2), note: 'north fence' });
    await expect(checkOut(kim, 'a-saw')).rejects.toThrow(/Someone else has it/);
    await expect(checkIn(kim, 'a-saw')).rejects.toThrow(/whoever has it/);
    expect((await listEquipment(boss))[0].out).toMatchObject({ who: 'Sam', note: 'north fence', overdue: false });

    await checkIn(boss, 'a-saw'); // a manager can
    await expect(checkIn(sam, 'a-saw')).rejects.toThrow(/isn’t checked out/);
    await checkOut(kim, 'a-saw');
    await checkIn(kim, 'a-saw');
    const h = await checkoutsFor('a-saw');
    expect(h.current).toBeNull();
    expect(h.history.map((x) => x.who)).toEqual(['Kim', 'Sam']);
  });

  it('nudges the holder once when it’s late, and managers once at three days', async () => {
    const sam = await makeUser('worker', 'Sam2');
    await db.insert(schema.assets).values({ id: 'a-trailer', name: 'Trailer', category: 'Equipment' });
    await checkOut(sam, 'a-trailer', { dueBack: T });
    expect((await runCheckoutReminders(T)).sent).toBe(0); // due today: not late yet
    expect((await runCheckoutReminders(addDays(T, 1))).sent).toBe(1);
    expect((await runCheckoutReminders(addDays(T, 2))).sent).toBe(0);
    expect((await runCheckoutReminders(addDays(T, 3))).sent).toBe(1); // managers, at three days late
    expect((await runCheckoutReminders(addDays(T, 4))).sent).toBe(0);
    expect((await listEquipment(sam, addDays(T, 1))).find((e) => e.name === 'Trailer')?.out?.overdue).toBe(true);
  });
});
