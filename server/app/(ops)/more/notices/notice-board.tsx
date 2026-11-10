'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Megaphone, Trash2 } from 'lucide-react';
import type { NoticeAudience } from '@/db/schema';
import { fmtDate } from '@/lib/domain/dates';
import { Banner, Button, Card, EmptyState, Field, IconButton, Input, Select, StatusPill, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../../farm/animals/animals.module.css';

const AUDIENCE: Record<NoticeAudience, string> = { farm: 'The farm (crew, family, managers)', tenants: 'Tenants', everyone: 'Everyone' };
type Notice = { id: string; title: string; body: string; audience: NoticeAudience; expiresOn: string | null; byName: string | null };

export function NoticeBoard({ audiences, notices }: { audiences: NoticeAudience[]; notices: Notice[] }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [f, setF] = useState({ title: '', body: '', audience: audiences[0], expiresOn: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, expiresOn: f.expiresOn || null }) });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || 'Could not post it.');
    setF({ ...f, title: '', body: '', expiresOn: '' });
    router.refresh();
  }
  async function onDelete(n: Notice) {
    if (!(await askConfirm(`Take down “${n.title}”?`))) return;
    const res = await fetch(`/api/notices/${n.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error || 'Could not take it down.');
  }

  return (
    <>
      <Card title="Post a notice">
        <form className={s.form} onSubmit={onSubmit}>
          <Field label="Headline" htmlFor="nt-title"><Input id="nt-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={120} placeholder="Water off Thursday 9–noon" /></Field>
          <Field label="Details (optional)" htmlFor="nt-body"><Textarea id="nt-body" rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <div className={s.two}>
            <Field label="Who sees it" htmlFor="nt-aud">
              <Select id="nt-aud" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as NoticeAudience })}>
                {audiences.map((a) => <option key={a} value={a}>{AUDIENCE[a]}</option>)}
              </Select>
            </Field>
            <Field label="Last day shown" htmlFor="nt-exp" hint="Blank = until you take it down"><Input id="nt-exp" type="date" value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} /></Field>
          </div>
          {error && <Banner tone="danger">{error}</Banner>}
          <Button type="submit" loading={busy} icon={<Megaphone />}>Post and notify</Button>
        </form>
      </Card>
      <Card title="Up now" flush>
        {notices.length === 0 ? (
          <EmptyState icon={<Megaphone />} title="Nothing posted" />
        ) : (
          notices.map((n) => (
            <div key={n.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{n.title}</strong>
                {n.body && <span>{n.body}</span>}
                <small>{n.byName ?? 'Someone'}{n.expiresOn ? ` · until ${fmtDate(n.expiresOn)}` : ''}</small>
              </span>
              <StatusPill tone="neutral">{n.audience === 'farm' ? 'Farm' : n.audience === 'tenants' ? 'Tenants' : 'Everyone'}</StatusPill>
              <IconButton label="Take down" onClick={() => onDelete(n)}><Trash2 /></IconButton>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
