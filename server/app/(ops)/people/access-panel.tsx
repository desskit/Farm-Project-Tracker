'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Button, Field, Input, Switch } from '@/components/ui';
import type { PersonRow as Person } from '@/lib/data/users';
import { CAP_LABEL, ROLE_BLURB, can, resolveCaps, toggleable, type Cap } from '@/lib/domain/permissions';
import s from './access-panel.module.css';

const dateOf = (ms: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * One person's access: what their role means, the permissions an admin can
 * switch for them, and when their access ends.
 */
export function AccessPanel({ person, isSelf }: { person: Person; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [endDate, setEndDate] = useState(dateOf(person.accessExpiresAt));
  const defaults = resolveCaps(person.role);
  const switchable = toggleable(person.role);
  const override = (cap: Cap) => person.overrides.find((o) => o.cap === cap);
  const ended = person.accessExpiresAt != null && person.accessExpiresAt <= Date.now();
  // Admins never get an end date (the server refuses it too).
  const canEnd = !can({ role: person.role }, 'system.admin') && !isSelf;

  async function send(key: string, body: object) {
    setBusy(key);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${person.id}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className={s.panel}>
      <summary className={s.summary}>
        Access
        {person.overrides.some((o) => switchable.includes(o.cap as Cap)) && <span className={s.tag}>customised</span>}
        {person.accessExpiresAt && <span className={s.tag}>{ended ? 'ended' : `until ${new Date(person.accessExpiresAt).toLocaleDateString()}`}</span>}
      </summary>
      <div className={s.body}>
        <p className={s.blurb}>{ROLE_BLURB[person.role]}</p>

        {switchable.length > 0 && (
          <div className={s.switches}>
            {switchable.map((cap) => {
              const o = override(cap);
              const on = o ? o.allow : defaults.includes(cap);
              return (
                <div key={cap}>
                  <Switch
                    label={CAP_LABEL[cap]}
                    hint={o ? 'Changed for this person' : `Default for this role: ${defaults.includes(cap) ? 'on' : 'off'}`}
                    checked={on}
                    disabled={busy !== null || !person.active}
                    onChange={(v) => send(cap, { cap, allow: v === defaults.includes(cap) ? null : v })}
                  />
                </div>
              );
            })}
          </div>
        )}

        {canEnd && (
          <div className={s.end}>
            <Field label="Access ends" htmlFor={`end-${person.id}`} hint="For guests and seasonal help. After this day they can't sign in.">
              <Input id={`end-${person.id}`} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <div className={s.row}>
              <Button
                size="sm"
                disabled={!endDate || busy !== null}
                loading={busy === 'end'}
                onClick={() => send('end', { accessExpiresAt: new Date(`${endDate}T23:59:59`).getTime() })}
              >
                Save end date
              </Button>
              {person.accessExpiresAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => {
                    setEndDate('');
                    send('end', { accessExpiresAt: null });
                  }}
                >
                  No end date
                </Button>
              )}
            </div>
          </div>
        )}

        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </details>
  );
}
