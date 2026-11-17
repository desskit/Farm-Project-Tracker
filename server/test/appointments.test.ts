/** Appointments: who sees them, who changes them, and the day-before reminder. */
import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { addAppointment, deleteAppointment, listAppointments, runAppointmentReminders, setAppointmentStatus, updateAppointment, whenLabel } from '@/lib/data/appointments';
import { calendarItems } from '@/lib/data/calendar';
import { createLease, createRentalUnit } from '@/lib/data/rentals';
import { saveContact } from '@/lib/data/contacts';
import { addDays, currentMonthKey, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

describe('appointments', () => {
  it('show to the farm, except rental visits, which only rental managers, the people listed and the tenants see', async () => {
    const boss = await makeUser('manager', 'Boss');
    const crew = await makeUser('worker', 'Sam');
    const tenant = await makeUser('renter', 'Rae');
    const other = await makeUser('renter', 'Otto');
    const unit = await createRentalUnit(boss, { name: 'Cabin', kind: 'cabin' });
    await createLease(boss, unit, { tenantIds: [tenant.id], primaryId: tenant.id, startDate: `${currentMonthKey()}-01`, rent: 700, dueDay: 1 });
    const vet = await saveContact(boss, null, { name: 'Dr. Hale', kind: 'vet', phone: '555-0100' });
    await db.insert(schema.animalGroups).values({ id: 'g1', name: 'Goats', species: 'goat', kind: 'herd', headCount: 3 });

    await expect(addAppointment(crew, { title: 'Nope', date: T })).rejects.toThrow(/manager/);
    const farrier = await addAppointment(boss, { title: 'Hoof trims', date: addDays(T, 1), time: '09:30', contactId: vet, linkType: 'animal_group', linkId: 'g1', people: [crew.id] });
    const inspect = await addAppointment(boss, { title: 'Smoke alarm check', date: addDays(T, 1), linkType: 'rental_unit', linkId: unit });

    const titles = async (u: typeof boss) => (await listAppointments(u, T, addDays(T, 7))).map((a) => a.title).sort();
    expect(await titles(boss)).toEqual(['Hoof trims', 'Smoke alarm check']);
    expect(await titles(crew)).toEqual(['Hoof trims']);
    expect(await titles(tenant)).toEqual(['Smoke alarm check']);
    expect(await titles(other)).toEqual([]);

    const [a] = (await listAppointments(boss, T, addDays(T, 7), { linkType: 'animal_group', linkId: 'g1' }));
    expect(a).toMatchObject({ contactName: 'Dr. Hale', contactPhone: '555-0100', linkLabel: 'Goats', linkHref: '/farm/animals/g1' });
    expect(whenLabel(a)).toMatch(/9:30 am$/);
    expect((await calendarItems(crew, T, addDays(T, 7))).filter((i) => i.kind === 'appointment')).toHaveLength(1);

    // Reminders the day before: one per appointment, sent once.
    expect((await runAppointmentReminders(T)).sent).toBe(2);
    expect((await runAppointmentReminders(T)).sent).toBe(0);

    await expect(updateAppointment(crew, farrier, { title: 'x', date: T })).rejects.toThrow(/manager/);
    await updateAppointment(boss, farrier, { title: 'Hoof trims and shots', date: addDays(T, 2), people: [crew.id] });
    await setAppointmentStatus(boss, inspect, 'cancelled');
    expect(await titles(tenant)).toEqual([]);
    await expect(deleteAppointment(other, farrier)).rejects.toThrow(/No such appointment/);
    await deleteAppointment(boss, farrier);
    expect(await titles(boss)).toEqual([]);
  });
});
