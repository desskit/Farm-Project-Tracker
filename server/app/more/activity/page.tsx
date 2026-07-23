import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listActivity } from '@/lib/data/activity';

export default async function ActivityPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const acts = await listActivity(40);

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Activity</h1>
      </div>

      {!acts.length ? (
        <div className="empty">Nothing yet — completed work and changes will show up here.</div>
      ) : (
        <div className="card">
          {acts.map((a) => {
            const when = new Date(a.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return (
              <div className="hist-row" key={a.id}>
                <span>
                  <strong>{a.userName}</strong> {a.text}
                </span>
                <span className="subtle">{when}</span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
