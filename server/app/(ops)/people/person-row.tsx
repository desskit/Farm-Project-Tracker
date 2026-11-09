'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, Mail, Power, Trash2 } from 'lucide-react';
import type { PersonRow as Person } from '@/lib/data/users';
import { ASSIGNABLE_ROLES, ROLE_LABEL } from '@/lib/domain/permissions';
import { Banner, Button, Select, StatusPill } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import { AccessPanel } from './access-panel';
import s from './people.module.css';

/**
 * Admin controls for one person: role, preview, resend a pending invite,
 * deactivate / reactivate, delete, and their access. The server refuses to
 * demote/remove the last admin and to remove your own account, so those
 * cases surface as errors rather than being hidden here.
 */
export function PersonRow({ person, isSelf }: { person: Person; isSelf: boolean }) {
  const { confirm: askConfirm } = useDialogs();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState<{ emailed: boolean; url: string } | null>(null);
  const [needsForce, setNeedsForce] = useState(false);

  async function call(key: string, url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    setBusy(key);
    setError(null);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    return { ok: res.ok, status: res.status, data };
  }

  async function onRole(role: string) {
    const r = await call('role', `/api/admin/users/${person.id}`, 'PATCH', { role });
    if (!r.ok) return setError(String(r.data.error || 'Could not change role.'));
    router.refresh();
  }

  async function onPreview() {
    const r = await call('preview', '/api/preview/start', 'POST', { userId: person.id });
    if (!r.ok) return setError(String(r.data.error || 'Could not start the preview.'));
    window.location.href = '/'; // full load, so every screen picks up their view
  }

  async function onResend() {
    setResent(null);
    const r = await call('resend', `/api/admin/users/${person.id}/invite`, 'POST');
    if (!r.ok) return setError(String(r.data.error || 'Could not resend the invite.'));
    setResent({ emailed: !!r.data.emailed, url: String(r.data.inviteUrl) });
  }

  async function onSetActive(active: boolean) {
    if (!active && !(await askConfirm(`Deactivate ${person.name}? They'll be signed out and can't log in, but all their history is kept. You can turn them back on any time.`))) return;
    const r = await call('active', `/api/admin/users/${person.id}/active`, 'PATCH', { active });
    if (!r.ok) return setError(String(r.data.error || 'Could not update this account.'));
    router.refresh();
  }

  async function onRemove(force = false) {
    if (!force && !(await askConfirm(`Remove ${person.name}? They immediately lose access to the farm.`))) return;
    const r = await call('remove', `/api/admin/users/${person.id}${force ? '?force=1' : ''}`, 'DELETE');
    if (r.status === 409) {
      // Removal would destroy rent/time records — surface exactly what's lost.
      setError(String(r.data.error || 'Removing this person would delete some records.'));
      return setNeedsForce(true);
    }
    if (!r.ok) return setError(String(r.data.error || 'Could not remove this person.'));
    router.refresh();
  }

  return (
    <article className={`${s.person} ${person.active ? '' : s.inactive}`}>
      <div className={s.head}>
        <span className={s.avatar} aria-hidden>{(person.name || '?').charAt(0)}</span>
        <div className={s.main}>
          <div className={s.name}>
            {person.name}
            {isSelf && <span className={s.you}>you</span>}
          </div>
          <div className={s.email}>{person.email}</div>
        </div>
        {!person.active ? <StatusPill tone="neutral">Deactivated</StatusPill> : person.pending && <StatusPill tone="today">Invite pending</StatusPill>}
      </div>

      <div className={s.controls}>
        <Select
          value={person.role}
          disabled={busy !== null || !person.active}
          onChange={(e) => onRole(e.target.value)}
          aria-label={`Role for ${person.name}`}
          className={s.roleSelect}
        >
          {(ASSIGNABLE_ROLES.includes(person.role) ? ASSIGNABLE_ROLES : [...ASSIGNABLE_ROLES, person.role]).map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </Select>
        {!isSelf && person.active && (
          <Button size="sm" variant="ghost" icon={<Eye />} loading={busy === 'preview'} disabled={busy !== null} onClick={onPreview} title="See the app as they do, read-only, for up to an hour">
            Preview as
          </Button>
        )}
        {person.active && person.pending && (
          <Button size="sm" variant="ghost" icon={<Mail />} loading={busy === 'resend'} disabled={busy !== null} onClick={onResend}>Resend invite</Button>
        )}
        {!isSelf &&
          (person.active ? (
            <Button size="sm" variant="ghost" icon={<Power />} loading={busy === 'active'} disabled={busy !== null} onClick={() => onSetActive(false)}>Deactivate</Button>
          ) : (
            <Button size="sm" icon={<Power />} loading={busy === 'active'} disabled={busy !== null} onClick={() => onSetActive(true)}>Reactivate</Button>
          ))}
        {!isSelf && !person.active && (
          <Button size="sm" variant="ghost" icon={<Trash2 />} loading={busy === 'remove' && !needsForce} disabled={busy !== null} onClick={() => onRemove(false)}>Delete permanently</Button>
        )}
      </div>

      {needsForce && (
        <div className={s.controls}>
          <Button size="sm" variant="danger" loading={busy === 'remove'} disabled={busy !== null} onClick={() => onRemove(true)}>Delete anyway</Button>
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => { setNeedsForce(false); setError(null); }}>Keep them</Button>
        </div>
      )}

      {resent && (
        <Banner tone={resent.emailed ? 'ok' : 'info'} title={resent.emailed ? 'Invite resent' : 'New invite link'}>
          {resent.emailed ? `Sent to ${person.email}.` : 'Email isn’t set up, so send this link yourself:'}
          {!resent.emailed && <InviteLink url={resent.url} />}
        </Banner>
      )}
      {error && <Banner tone="danger">{error}</Banner>}

      <AccessPanel person={person} isSelf={isSelf} />
    </article>
  );
}

export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={s.link}>
      <code>{url}</code>
      <Button
        size="sm"
        variant="secondary"
        icon={<Copy />}
        onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false))}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  );
}
