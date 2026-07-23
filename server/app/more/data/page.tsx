import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';

export default async function DataPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isAdmin = user.role === 'admin';

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Data &amp; backup</h1>
      </div>

      {!isAdmin ? (
        <div className="empty">Only admins can export farm data.</div>
      ) : (
        <>
          <div className="card">
            <p className="item-title">⬇︎ Download a backup</p>
            <p className="subtle">A full JSON export of the farm data (people, chores, upkeep, projects, supplies, rent, and history). Passwords and login tokens are never included.</p>
            <a href="/api/data/export" className="btn primary block" style={{ marginTop: 10 }} download>
              Download backup (JSON)
            </a>
          </div>
          <div className="notice">
            The live database and uploaded files also live in the server&apos;s <strong>/data</strong> volume — the whole
            thing is captured by a Proxmox snapshot or the volume backup described in the deploy guide. This JSON export
            is a convenient portable copy on top of that.
          </div>
        </>
      )}
    </main>
  );
}
