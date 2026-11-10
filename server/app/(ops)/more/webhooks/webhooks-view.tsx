'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Webhook } from 'lucide-react';
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LIST } from '@/lib/domain/webhooks';
import { useMutation } from '@/lib/client/mutate';
import { Banner, Button, Card, Dialog, EmptyState, Field, Input, ListRow, StatusPill, Switch } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../../farm/animals/animals.module.css';

type Hook = { id: string; name: string; url: string; events: string[]; secret: string; active: boolean; lastStatus: string; lastAt: number | null };

export function WebhooksView({ hooks }: { hooks: Hook[] }) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Hook | null>(null);
  return (
    <>
      <Banner tone="info">
        When one of these things happens, the farm sends a small message to the address you give. Works with IFTTT’s Webhooks service, Home Assistant and similar. Addresses must be https:// and public; names of people are left out.
      </Banner>
      <Card title="Webhooks" action={<Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAdding(true)}>Add</Button>} flush>
        {hooks.length === 0 ? (
          <EmptyState icon={<Webhook />} title="No webhooks yet">Add one to flash a light on a frost warning, or post low stock to a group chat.</EmptyState>
        ) : (
          hooks.map((h) => (
            <ListRow
              key={h.id}
              lead={<Webhook />}
              onClick={() => setOpen(h)}
              title={h.name}
              meta={`${h.events.length ? `${h.events.length} event${h.events.length === 1 ? '' : 's'}` : 'All events'} · ${new URL(h.url).hostname}`}
              trail={!h.active ? <StatusPill tone="neutral">Off</StatusPill> : h.lastStatus ? <StatusPill tone={/^2\d\d$/.test(h.lastStatus) ? 'done' : 'overdue'}>{h.lastStatus}</StatusPill> : <StatusPill tone="info">Not sent yet</StatusPill>}
            />
          ))
        )}
      </Card>
      <Dialog sheet open={adding} onClose={() => setAdding(false)} title="Add a webhook">
        {adding && <HookForm onDone={() => setAdding(false)} />}
      </Dialog>
      <Dialog sheet open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open && <HookForm hook={open} onDone={() => setOpen(null)} />}
      </Dialog>
    </>
  );
}

function HookForm({ hook, onDone }: { hook?: Hook; onDone: () => void }) {
  const router = useRouter();
  const m = useMutation();
  const { confirm: askConfirm } = useDialogs();
  const [name, setName] = useState(hook?.name ?? '');
  const [url, setUrl] = useState(hook?.url ?? '');
  const [events, setEvents] = useState<string[]>(hook?.events ?? []);
  const [active, setActive] = useState(hook?.active ?? true);
  const [result, setResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const toggle = (e: string, on: boolean) => setEvents(on ? [...events, e] : events.filter((x) => x !== e));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await m.run({ url: hook ? `/api/webhooks/${hook.id}` : '/api/webhooks', method: hook ? 'PATCH' : 'POST', body: { name, url, events, active }, label: 'Webhook' });
    if (ok) { onDone(); router.refresh(); }
  }
  async function test() {
    if (!hook) return;
    setTesting(true);
    setResult(null);
    const res = await fetch(`/api/webhooks/${hook.id}/test`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setResult(res.ok ? `The other end answered: ${j.status}` : j.error || 'Could not send.');
    setTesting(false);
    router.refresh();
  }
  async function remove() {
    if (!hook || !(await askConfirm(`Delete the webhook "${hook.name}"?`))) return;
    if (await m.run({ url: `/api/webhooks/${hook.id}`, method: 'DELETE', label: 'Delete webhook' })) { onDone(); router.refresh(); }
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="Name" htmlFor="wh-name"><Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Barn lights" /></Field>
      <Field label="Address" htmlFor="wh-url" hint="Must start with https://"><Input id="wh-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={500} placeholder="https://maker.ifttt.com/trigger/…" /></Field>
      <p className={s.muted}>Send when… (leave all off to send everything)</p>
      {WEBHOOK_EVENT_LIST.map((e) => <Switch key={e} label={WEBHOOK_EVENTS[e]} checked={events.includes(e)} onChange={(on) => toggle(e, on)} />)}
      {hook && <Switch label="Turned on" checked={active} onChange={setActive} />}
      {hook && <Field label="Signing secret" htmlFor="wh-secret" hint="Each message carries an X-Farm-Signature header: sha256= the HMAC of the body with this secret."><Input id="wh-secret" readOnly value={hook.secret} onFocus={(e) => e.target.select()} /></Field>}
      {result && <Banner tone="info">{result}</Banner>}
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      <div className={s.actions}>
        <Button type="submit" loading={m.busy}>Save</Button>
        {hook && <Button variant="secondary" loading={testing} onClick={test}>Send a test</Button>}
        {hook && <Button variant="ghost" onClick={remove} disabled={m.busy}>Delete</Button>}
      </div>
    </form>
  );
}
