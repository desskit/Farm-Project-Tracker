'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Banner, Button, Card, Dialog, StatusPill } from '@/components/ui';
import type { DeployStatus } from '@/lib/deploy/control';
import s from './update-panel.module.css';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/** "4 min ago", "3 h ago": how fresh the server's last check-in is. */
function ago(iso: string | null): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
}

/**
 * Admin "Update now". The request goes to the host (see lib/deploy/control.ts);
 * the host picks it up within a minute, runs the normal update and restarts
 * the app, so this polls and rides out the moment the server is restarting.
 */
export function UpdatePanel({ initial }: { initial: DeployStatus }) {
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const startVersion = useRef(initial.current);
  const inFlight = status.state === 'requested' || status.state === 'running';

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/update', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const next: DeployStatus = await res.json();
      setUnreachable(false);
      setStatus(next);
      // A new version is live: reload so this tab runs the new code too.
      if (next.state === 'ok' && next.current && startVersion.current && next.current !== startVersion.current) {
        window.location.reload();
      }
    } catch {
      setUnreachable(true); // expected for a few seconds while the app restarts
    }
  }, []);

  // A tab left open for hours would otherwise show what the server said when it
  // was opened. Check again on arrival and whenever the tab comes back.
  useEffect(() => {
    poll();
    const onShow = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [poll]);

  useEffect(() => {
    if (!inFlight && !unreachable) return;
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [inFlight, unreachable, poll]);

  async function updateNow() {
    setConfirming(false);
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/update', { method: 'POST' }).catch(() => {
        throw new Error('Couldn’t reach the server, so the update wasn’t started. Check your connection, then try again.');
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start the update.');
      startVersion.current = data.current;
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the update.');
    } finally {
      setBusy(false);
      poll();
    }
  }

  if (!status.available && status.checkedAt) {
    return (
      <Card title="Server updates" action={<StatusPill tone="overdue">Not responding</StatusPill>} className={s.panel}>
        <Banner tone="warn" title="The update helper on the server has stopped">
          It last checked in {when(status.checkedAt)} ({ago(status.checkedAt)}), so the <strong>Update now</strong> button can’t
          work, and the 3 a.m. update may not be running either. The app itself is fine; it’s still on <code>{status.current ?? 'the last version'}</code>.
        </Banner>
        <p className={s.muted}>
          The usual causes are the server restarting without its scheduled jobs, or its disk filling up. On the server,
          <code>crontab -l</code> should list <code>deploy-watch.sh</code> and <code>auto-update.sh</code>, and <code>df -h /</code> should
          show free space. Running <code>server/scripts/deploy-watch.sh</code> by hand brings this page back within a minute.
        </p>
      </Card>
    );
  }

  if (!status.available) {
    return (
      <Card title="Server updates" className={s.panel}>
        <p className={s.muted}>
          The <strong>Update now</strong> button needs a small helper running on the server. Until it&apos;s set up, the
          server still updates itself every night at 3 a.m. Setup: <code>scripts/README-auto-update.md</code>, &ldquo;Update
          button&rdquo;.
        </p>
      </Card>
    );
  }

  const pill =
    status.state === 'requested' ? <StatusPill tone="info">Waiting for the server</StatusPill>
    : status.state === 'running' ? <StatusPill tone="today">Updating…</StatusPill>
    : status.updateWaiting ? <StatusPill tone="upcoming">Update available</StatusPill>
    : <StatusPill tone="done">Up to date</StatusPill>;

  return (
    <Card title="Server updates" action={pill} className={s.panel}>
      <dl className={s.facts}>
        <dt>Running</dt>
        <dd><code>{status.current ?? '—'}</code></dd>
        <dt>Newest tested</dt>
        <dd><code>{status.latest ?? '—'}</code></dd>
        <dt>Last update</dt>
        <dd>
          {when(status.finishedAt)}
          {status.state === 'failed' && ' — failed, previous version kept'}
        </dd>
        <dt>Checked</dt>
        <dd>{when(status.checkedAt)}{status.checkedAt ? ` (${ago(status.checkedAt)})` : ''}</dd>
      </dl>

      {unreachable && inFlight && (
        <Banner tone="info" title="Restarting">The server is switching versions. This page reconnects by itself.</Banner>
      )}
      {status.state === 'requested' && !unreachable && (
        <Banner tone="info">Requested. The server starts within a minute; a full update takes 3–5 minutes.</Banner>
      )}
      {status.state === 'failed' && (
        <Banner tone="danger" title="The last update didn't go through">
          The server rolled back to the version that was working, so nothing is broken. The log below says why.
        </Banner>
      )}
      {error && <Banner tone="danger">{error}</Banner>}

      <div className={s.actions}>
        <Button icon={<RefreshCw />} onClick={() => setConfirming(true)} loading={busy} disabled={inFlight}>
          {inFlight ? 'Update in progress' : status.updateWaiting ? 'Update now' : 'Check and update now'}
        </Button>
      </div>
      <p className={s.muted}>
        Only installs versions that passed the automatic tests. The database is snapshotted first, and a version that
        doesn&apos;t come up healthy is rolled back on its own. The server also does this every night at 3 a.m.
      </p>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Update the server now?">
        <p className={s.muted}>
          Everyone loses the app for up to a minute while it restarts. Anything people save on their phones in that
          minute is queued and sent once it&apos;s back.
        </p>
        <div className={s.actions}>
          <Button onClick={updateNow}>Update now</Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
        </div>
      </Dialog>

      {status.logTail && (
        <details className={s.log}>
          <summary>Update log</summary>
          <pre>{status.logTail}</pre>
        </details>
      )}
    </Card>
  );
}
