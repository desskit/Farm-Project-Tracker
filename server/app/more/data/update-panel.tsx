'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Banner, Button, Card, Dialog, StatusPill } from '@/components/ui';
import type { DeployStatus } from '@/lib/deploy/control';
import s from './update-panel.module.css';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

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
      const res = await fetch('/api/admin/update', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start the update.');
      startVersion.current = data.current;
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the update.');
    } finally {
      setBusy(false);
    }
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
        <dd>{when(status.checkedAt)}</dd>
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
