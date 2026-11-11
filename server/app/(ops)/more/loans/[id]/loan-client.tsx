'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { useMutation } from '@/lib/client/mutate';
import { Banner, Button, Field, IconButton, Input } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../../../farm/animals/animals.module.css';

/** "I paid" (borrower) or "Took a payment" (money manager, counts straight away). */
export function PayForm({ loanId, suggested, max, today, manager }: { loanId: string; suggested: number; max: number; today: string; manager: boolean }) {
  const router = useRouter();
  const m = useMutation();
  const [amount, setAmount] = useState(suggested > 0 ? suggested.toFixed(2) : '');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (await m.run({ url: `/api/loans/${loanId}/payments`, body: { amount: Number(amount), date, note }, label: `Loan payment $${amount}` })) {
      setDone(true);
      setNote('');
      router.refresh();
    }
  }
  return (
    <form className={s.form} onSubmit={onSubmit}>
      <div className={s.two}>
        <Field label="Amount ($)" htmlFor="lp-amt" hint={`Up to $${max.toFixed(2)}`}><Input id="lp-amt" type="number" inputMode="decimal" min="0.01" max={max} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <Field label="Paid on" htmlFor="lp-date"><Input id="lp-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Note (optional)" htmlFor="lp-note"><Input id="lp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={manager ? 'Cash at the barn' : 'Venmo, cash…'} /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      {m.queued && <Banner tone="ok">Saved — it’ll sync when you’re back online.</Banner>}
      {done && !m.queued && <Banner tone="ok">{manager ? 'Payment recorded.' : 'Thanks! It’ll count once it’s confirmed.'}</Banner>}
      <Button type="submit" block loading={m.busy} disabled={!amount}>{manager ? 'Record payment' : 'I paid'}</Button>
    </form>
  );
}

/** Confirm / turn down a waiting payment, withdraw your own, or remove a mistaken confirmed one. */
export function PaymentActions({ paymentId, canConfirm, canRemove = canConfirm, removeLabel = 'Turn down' }: { paymentId: string; canConfirm?: boolean; canRemove?: boolean; removeLabel?: string }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(method: 'PATCH' | 'DELETE') {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/loans/payments/${paymentId}`, { method });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error || 'Could not change that.');
  }
  return (
    <>
      {canConfirm && <Button size="sm" icon={<Check />} loading={busy} onClick={() => send('PATCH')}>Confirm</Button>}
      {canRemove && <IconButton label={removeLabel} onClick={async () => { if (await askConfirm(`${removeLabel}?`)) send('DELETE'); }}><X /></IconButton>}
      {error && <span className={s.err}>{error}</span>}
    </>
  );
}

export function CancelLoan({ loanId }: { loanId: string }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const m = useMutation();
  async function onCancel() {
    if (!(await askConfirm('Cancel this loan? The sale stays, marked as owed.'))) return;
    if (await m.run({ url: `/api/loans/${loanId}`, method: 'DELETE', label: 'Cancel loan' })) router.push('/more/loans');
  }
  return (
    <>
      <Button variant="ghost" onClick={onCancel} loading={m.busy}>Cancel this loan</Button>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
    </>
  );
}
