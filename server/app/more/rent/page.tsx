import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { rentChargesForMonth, rentSummary, rentAssignmentFor } from '@/lib/data/rent';
import { listUsers } from '@/lib/data/users';
import { currentMonthKey, monthLabel } from '@/lib/domain/dates';
import { RentView } from './rent-view';

export default async function RentPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isManager = user.role === 'manager' || user.role === 'admin';
  const mk = currentMonthKey();

  const [allCharges, people] = await Promise.all([rentChargesForMonth(mk), listUsers()]);
  const charges = isManager ? allCharges : allCharges.filter((c) => c.userId === user.id);
  const summary = rentSummary(allCharges);

  // Managers need current assignment amounts to prefill the assign form.
  const assignments = isManager
    ? Object.fromEntries(await Promise.all(people.map(async (p) => [p.id, await rentAssignmentFor(p.id)] as const)))
    : {};

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Rent</h1>
      </div>
      <p className="subtle" style={{ marginTop: -8, marginBottom: 12 }}>
        {monthLabel(mk)}
      </p>

      <RentView
        charges={charges}
        summary={isManager ? summary : null}
        people={people}
        assignments={assignments}
        currentUser={user}
      />
    </main>
  );
}
