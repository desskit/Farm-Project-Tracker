import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { RestoreForm } from './restore-form';
import { BackupPanel } from './backup-panel';
import { listBackups } from '@/lib/backup';

export default async function DataPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isAdmin = user.role === 'admin';
  const backups = isAdmin ? await listBackups() : [];
  const keepDays = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS) || 7);

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
          <RestoreForm />
          <BackupPanel backups={backups} keepDays={keepDays} />
          <div className="notice">
            The nightly backup above lives on the same <strong>/data</strong> volume as the live data, so it won&apos;t
            survive the disk itself failing — pair it with a Proxmox snapshot or the off-box volume backup described in
            the deploy guide. The JSON export is a convenient portable copy on top of both.
          </div>
        </>
      )}
    </main>
  );
}
