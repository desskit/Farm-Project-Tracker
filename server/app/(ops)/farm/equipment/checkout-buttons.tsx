'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut } from 'lucide-react';
import type { CheckoutView } from '@/lib/data/equipment';
import { fmtDate } from '@/lib/domain/dates';
import { useMutation } from '@/lib/client/mutate';
import { Banner, Button, Card, Dialog, Field, Input, StatusPill } from '@/components/ui';
import s from '../animals/animals.module.css';

/** Check out / check in, for a list row or the asset page. */
export function CheckoutButtons({ assetId, name, out, me, canManage, today }: { assetId: string; name: string; out: CheckoutView | null; me: string; canManage: boolean; today: string }) {
  const router = useRouter();
  const m = useMutation();
  const [open, setOpen] = useState(false);
  async function checkIn() {
    if (await m.run({ url: `/api/equipment/${assetId}/checkin`, body: {}, label: `Returned ${name}` })) router.refresh();
  }
  if (out) {
    const mine = out.userId === me;
    return (
      <>
        {(mine || canManage) && <Button size="sm" variant={mine ? 'primary' : 'secondary'} icon={<LogIn />} loading={m.busy} onClick={checkIn}>{mine ? 'Bring back' : 'Check in'}</Button>}
        {m.error && <span className={s.err}>{m.error}</span>}
      </>
    );
  }
  return (
    <>
      <Button size="sm" variant="secondary" icon={<LogOut />} onClick={() => setOpen(true)}>Take it</Button>
      <Dialog sheet open={open} onClose={() => setOpen(false)} title={`Take ${name}`}>
        {open && <CheckoutForm assetId={assetId} name={name} today={today} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function CheckoutForm({ assetId, name, today, onDone }: { assetId: string; name: string; today: string; onDone: () => void }) {
  const router = useRouter();
  const m = useMutation();
  const [dueBack, setDueBack] = useState('');
  const [note, setNote] = useState('');
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (await m.run({ url: `/api/equipment/${assetId}/checkout`, body: { dueBack: dueBack || null, note }, label: `Took ${name}` })) { onDone(); router.refresh(); }
  }
  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="Bringing it back by (optional)" htmlFor="co-due" hint="You’ll get a reminder if it’s still out after this day.">
        <Input id="co-due" type="date" min={today} value={dueBack} onChange={(e) => setDueBack(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="co-note"><Input id="co-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Taking it to the north field" /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      {m.queued && <Banner tone="ok">Saved — it’ll sync when you’re back online.</Banner>}
      <Button type="submit" block loading={m.busy}>Take it</Button>
    </form>
  );
}

/** The asset page's card: who has it, since when, and the last few times it went out. */
export function CheckoutCard({ assetId, name, current, history, me, canManage, today }: {
  assetId: string; name: string; current: CheckoutView | null; history: (CheckoutView & { inAt: number | null })[]; me: string; canManage: boolean; today: string;
}) {
  const day = (ms: number) => fmtDate(new Date(ms).toISOString().slice(0, 10));
  return (
    <Card title="Who has it" action={<CheckoutButtons assetId={assetId} name={name} out={current} me={me} canManage={canManage} today={today} />}>
      {current ? (
        <p className={s.muted}>
          <strong>{current.userId === me ? 'You have it' : current.who}</strong> since {day(current.outAt)}
          {current.dueBack ? ` · back by ${fmtDate(current.dueBack)}` : ''}{current.note ? ` · ${current.note}` : ''}{' '}
          {current.overdue && <StatusPill tone="overdue">Overdue</StatusPill>}
        </p>
      ) : (
        <p className={s.muted}>It’s here. Tap “Take it” when you take it.</p>
      )}
      {history.length > 0 && (
        <p className={s.muted}>Before: {history.slice(0, 5).map((h) => `${h.who} (${day(h.outAt)}${h.inAt ? ` – ${day(h.inAt)}` : ''})`).join(' · ')}</p>
      )}
    </Card>
  );
}
