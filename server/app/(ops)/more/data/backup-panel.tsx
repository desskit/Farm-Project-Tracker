'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BackupEntry } from '@/lib/backup';

function kb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Nightly local snapshots (db + uploads), with a manual "run now" for peace of mind. */
export function BackupPanel({ backups, keepDays }: { backups: BackupEntry[]; keepDays: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function runNow() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/backup', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || 'Backup failed.' });
        return;
      }
      setMsg({ ok: true, text: `Backed up ${kb(data.dbBytes)} database and ${data.fileCount} file(s).` });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Backup failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <p className="item-title">🗄️ Nightly local backup</p>
      <p className="subtle">
        Every night the server snapshots the database and uploaded files onto the same volume, keeping the last{' '}
        {keepDays} days. This protects against a bad restore or an accidental deletion — it does not protect against
        the disk itself failing, which is what the Proxmox/volume snapshot below is for.
      </p>
      <button className="btn block" disabled={busy} onClick={runNow}>
        {busy ? 'Running…' : 'Run backup now'}
      </button>
      {msg && (
        <p className={msg.ok ? undefined : 'error-text'} style={msg.ok ? { color: 'var(--brand)', fontWeight: 600 } : undefined}>
          {msg.text}
        </p>
      )}
      {backups.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {backups.map((b) => (
            <div className="hist-row" key={b.date}>
              <span>{b.date}</span>
              <span className="subtle">
                {kb(b.dbBytes)} db · {b.fileCount} file{b.fileCount === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
