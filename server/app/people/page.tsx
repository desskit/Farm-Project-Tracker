import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listUsers } from '@/lib/data/users';
import { InviteForm } from './invite-form';

export default async function PeoplePage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  if (user.role !== 'admin') {
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
        <div className="card" key={p.id}>
          <div className="item">
            <span className="who-avatar sm">{(p.name || '?').charAt(0)}</span>
            <div className="item-main">
              <p className="item-title">{p.name}</p>
              <p className="item-sub">
                {p.email} · {p.role}
              </p>
            </div>
            {p.pending && <span className="badge today">invite pending</span>}
          </div>
        </div>
      ))}

      <div className="section-title">Invite someone</div>
      <InviteForm />
    </main>
  );
}
