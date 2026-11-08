import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listUsers } from '@/lib/data/users';
import { InviteForm } from './invite-form';
import { PersonRow } from './person-row';
import { can } from '@/lib/domain/permissions';

export default async function PeoplePage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  if (!can(user, 'people.manage')) {
    return (
      <main className="view">
        <div className="sub-head">
          <Link href="/more" className="btn small ghost back-btn">
            ‹ More
          </Link>
          <h1>People</h1>
        </div>
        <div className="empty">Only admins can manage people.</div>
      </main>
    );
  }

  const people = await listUsers();

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>People</h1>
      </div>

      {people.map((p) => (
        <PersonRow key={p.id} person={p} isSelf={p.id === user.id} />
      ))}

      <p className="subtle">
        <a href="/more/access">Who sees what →</a> the full table of what each role can do.
      </p>

      <div className="section-title">Invite someone</div>
      <InviteForm />
    </main>
  );
}
