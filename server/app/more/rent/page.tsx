import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import s from './rent.module.css';
import { getSessionUser } from '@/lib/auth/session';
import { rentChargesForMonth, rentSummary, rentAssignmentFor } from '@/lib/data/rent';
import { listRentDocs, docCountsByRenter } from '@/lib/data/rent-docs';
import { listUsers } from '@/lib/data/users';
import { currentMonthKey, monthLabel } from '@/lib/domain/dates';
import { RentView } from './rent-view';
import { RentDocs } from './rent-docs';
import { can } from '@/lib/domain/permissions';

export default async function RentPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isManager = can(user, 'finance.view');
  const mk = currentMonthKey();

  const [allCharges, people] = await Promise.all([rentChargesForMonth(mk), listUsers()]);
  const charges = isManager ? allCharges : allCharges.filter((c) => c.userId === user.id);
  const summary = rentSummary(allCharges);

  // Managers need current assignment amounts to prefill the assign form.
  const assignments = isManager
    ? Object.fromEntries(await Promise.all(people.map(async (p) => [p.id, await rentAssignmentFor(p.id)] as const)))
    : {};

  // Paperwork follows the tenancy, not the month — so it's listed for anyone
  // who rents (or already has documents on file), not just this month's
  // charges. A renter only ever sees their own.
  const docCounts = await docCountsByRenter(people.map((p) => p.id));
  const renterIds = isManager
    ? people.filter((p) => assignments[p.id] || docCounts[p.id] > 0).map((p) => p.id)
    : [user.id];
  const ownAssignment = isManager ? null : await rentAssignmentFor(user.id);
  const showDocs = isManager ? renterIds.length > 0 : !!ownAssignment || docCounts[user.id] > 0;

  const docsByRenter = Object.fromEntries(
    await Promise.all(renterIds.map(async (id) => [id, await listRentDocs(user, id)] as const)),
  );
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  return (
    <main className={s.wrap}>
      <PageHeader
        back={<Link href={can(user, 'farm.view') ? '/more' : '/'} aria-label="Back" className={s.back}><ChevronLeft /></Link>}
        title="Rent"
        subtitle={monthLabel(mk)}
      />

      <RentView
        charges={charges}
        summary={isManager ? summary : null}
        people={people}
        assignments={assignments}
        currentUser={user}
      />

      {showDocs && (
        <section className={s.section} id="documents-section">
          <h2>Rental documents</h2>
          <p className={s.docsIntro}>
            {isManager
              ? 'Leases, deposits, inspections, and insurance — kept with the renter, not the month. Only that renter and managers can open them.'
              : 'Your lease and related paperwork. Only you and a farm manager can open these.'}
          </p>
          {renterIds.map((id) => (
            <RentDocs
              key={id}
              renterId={id}
              renterName={nameById.get(id) ?? 'Someone'}
              docs={docsByRenter[id] ?? []}
              currentUser={user}
              showHeading={isManager}
            />
          ))}
        </section>
      )}
    </main>
  );
}
