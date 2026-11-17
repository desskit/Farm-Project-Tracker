import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { listAppointments } from '@/lib/data/appointments';
import { listContacts } from '@/lib/data/contacts';
import { listGroups } from '@/lib/data/livestock';
import { listUnits } from '@/lib/data/land';
import { listRentalUnits } from '@/lib/data/rentals';
import { loanBorrowers } from '@/lib/data/loans';
import { db } from '@/db';
import { assets } from '@/db/schema';
import { can } from '@/lib/domain/permissions';
import { addDays, todayISO } from '@/lib/domain/dates';
import { Screen } from '@/components/patterns/screen';
import { AppointmentsView } from './appointments-view';

export const metadata = { title: 'Appointments · Farm Project Tracker' };

/** Visits on a set day: the vet, the farrier, inspectors, contractors. */
export default async function AppointmentsPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const today = todayISO();
  const canAdd = can(user, 'work.manage') || can(user, 'rentals.manage');
  const [upcoming, recent, contactRows, groups, units, rentals, assetRows, people] = await Promise.all([
    listAppointments(user, today, addDays(today, 365)),
    listAppointments(user, addDays(today, -60), addDays(today, -1), { includeDone: true }),
    canAdd ? listContacts(user) : Promise.resolve([]),
    canAdd && can(user, 'animals.view') ? listGroups() : Promise.resolve([]),
    canAdd && can(user, 'land.view') ? listUnits() : Promise.resolve([]),
    can(user, 'rentals.manage') ? listRentalUnits() : Promise.resolve([]),
    canAdd ? db.select({ id: assets.id, name: assets.name }).from(assets) : Promise.resolve([]),
    canAdd ? loanBorrowers() : Promise.resolve([]),
  ]);
  const about = [
    ...(can(user, 'work.manage') ? groups.map((g) => ({ value: `animal_group:${g.id}`, label: g.name, group: 'Animals' })) : []),
    ...rentals.map((u) => ({ value: `rental_unit:${u.id}`, label: u.name, group: 'Rentals' })),
    ...(can(user, 'work.manage') ? assetRows.map((a) => ({ value: `asset:${a.id}`, label: a.name, group: 'Equipment & assets' })) : []),
    ...(can(user, 'work.manage') ? units.map((u) => ({ value: `land_unit:${u.id}`, label: u.name, group: 'Land' })) : []),
  ];

  return (
    <Screen title="Appointments" subtitle="The vet, the farrier, inspectors and contractors" back="/more">
      <AppointmentsView
        upcoming={upcoming}
        recent={recent.reverse()}
        canAdd={canAdd}
        today={today}
        contacts={contactRows.map((c) => ({ id: c.id, label: `${c.name}${c.kind !== 'other' ? ` (${c.kind})` : ''}` }))}
        about={about}
        people={people}
        rentalsOnly={!can(user, 'work.manage')}
      />
    </Screen>
  );
}
