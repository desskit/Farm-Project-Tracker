'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PersonRow as Person } from '@/lib/data/users';

/**
 * Admin controls for one person: change role, resend a pending invite, or
 * remove them. The server refuses to demote/remove the last admin and to
 * remove your own account, so those cases surface as errors rather than
 * being hidden here.
 */
export function PersonRow({ person, isSelf }: { person: Person; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState<{ emailed: boolean; url: string } | null>(null);
  const [needsForce, setNeedsForce] = useState(false);

  async function onRole(role: string) {
    setBusy('role');
    setError(null);
    const res = await fetch(`/api/admin/users/${person.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not change role.');
      return;
    }
    router.refresh();
  }

  async function onResend() {
    setBusy('resend');
    setError(null);
    setResent(null);
    const res = await fetch(`/api/admin/users/${person.id}/invite`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || 'Could not resend the invite.');
      return;
    }
    setResent({ emailed: !!data.emailed, url: data.inviteUrl });
  }

  async function onSetActive(active: boolean) {
    if (
      !active &&
      !confirm(
        `Deactivate ${person.name}? They'll be signed out and can't log in, but all their history is kept. You can turn them back on any time.`,
      )
    ) {
      return;
    }
    setBusy('active');
    setError(null);
    const res = await fetch(`/api/admin/users/${person.id}/active`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not update this account.');
      return;
    }
    router.refresh();
  }

  async function onRemove(force = false) {
    if (!force && !confirm(`Remove ${person.name}? They immediately lose access to the farm.`)) return;
    setBusy('remove');
    setError(null);
    const res = await fetch(`/api/admin/users/${person.id}${force ? '?force=1' : ''}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.status === 409) {
      // Removal would destroy rent/time records — surface exactly what's lost.
      setError(data.error || 'Removing this person would delete some records.');
      setNeedsForce(true);
      return;
    }
    if (!res.ok) {
      setError(data.error || 'Could not remove this person.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="card" style={person.active ? undefined : { opacity: 0.72 }}>
      <div className="item">
        <span className="who-avatar sm">{(person.name || '?').charAt(0)}</span>
        <div className="item-main">
          <p className="item-title">
            {person.name}
            {isSelf && <span className="chip" style={{ marginLeft: 8 }}>you</span>}
          </p>
          <p className="item-sub">{person.email}</p>
        </div>
        {!person.active ? (
          <span className="badge neutral">deactivated</span>
        ) : (
          person.pending && <span className="badge today">invite pending</span>
        )}
      </div>

      <div className="row-actions" style={{ marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={person.role}
          disabled={busy !== null || !person.active}
          onChange={(e) => onRole(e.target.value)}
          aria-label={`Role for ${person.name}`}
          style={{ maxWidth: 140 }}
        >
          <option value="worker">Worker</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        {person.active && person.pending && (
          <button className="btn small ghost" disabled={busy !== null} onClick={onResend}>
            {busy === 'resend' ? 'Sending…' : '✉️ Resend invite'}
          </button>
        )}
        {!isSelf &&
          (person.active ? (
            <button className="btn small ghost" disabled={busy !== null} onClick={() => onSetActive(false)}>
              {busy === 'active' ? 'Working…' : 'Deactivate'}
            </button>
          ) : (
            <button className="btn small primary" disabled={busy !== null} onClick={() => onSetActive(true)}>
              {busy === 'active' ? 'Working…' : 'Reactivate'}
            </button>
          ))}
        {!isSelf && !person.active && (
          <button className="btn small ghost danger" disabled={busy !== null} onClick={() => onRemove(false)}>
            Delete permanently
          </button>
        )}
      </div>

      {needsForce && (
        <div className="notice" style={{ marginTop: 10 }}>
          <div className="row-actions" style={{ flexWrap: 'wrap' }}>
            <button className="btn small ghost danger" disabled={busy !== null} onClick={() => onRemove(true)}>
              {busy === 'remove' ? 'Removing…' : 'Delete anyway'}
            </button>
            <button
              className="btn small ghost"
              disabled={busy !== null}
              onClick={() => {
                setNeedsForce(false);
                setError(null);
              }}
            >
              Keep them
            </button>
          </div>
        </div>
      )}

      {resent && (
        <div className="notice" style={{ marginTop: 10 }}>
          {resent.emailed ? (
            <>
              <strong>✅ Invite resent</strong> to {person.email}.
            </>
          ) : (
            <>
              <strong>New invite link</strong> — email isn&apos;t configured, so send this along:
              <div style={{ marginTop: 6 }}>
                <code style={{ wordBreak: 'break-all' }}>{resent.url}</code>
              </div>
            </>
          )}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
