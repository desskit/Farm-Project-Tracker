'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleDollarSign, Plus, Trash2 } from 'lucide-react';
import type { SaleRow } from '@/lib/data/sales';
import type { SaleKind } from '@/db/schema';
import { SALE_KIND_LABEL, SALE_UNITS } from '@/lib/domain/money';
import { addDays, fmtDate } from '@/lib/domain/dates';
import { EVERY_LABEL, addMonthsClamped, loanSchedule, type LoanEvery } from '@/lib/domain/loans';
import { useMutation } from '@/lib/client/mutate';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, Select, StatusPill, Switch, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../../farm/animals/animals.module.css';

type Opt = { id: string; name: string };
type LoanInfo = { loanId: string; balance: number; late: boolean };
const money = (n: number) => `$${n.toFixed(2)}`;

export function SalesView({
  sales, canLog, canManage, me, seesAll, today, groups, places, loans, borrowers,
}: { sales: SaleRow[]; canLog: boolean; canManage: boolean; me: string; seesAll: boolean; today: string; groups: Opt[]; places: Opt[]; loans: Record<string, LoanInfo>; borrowers: Opt[] }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(url: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error || 'Could not change that.');
  }

  return (
    <>
      <Card action={canLog ? <Button size="sm" icon={<Plus />} onClick={() => setOpen(true)}>Record a sale</Button> : undefined} flush>
        {sales.length === 0 ? (
          <EmptyState icon={<CircleDollarSign />} title="No sales here">{canLog ? 'Record eggs, produce, animals or hay as you sell them.' : undefined}</EmptyState>
        ) : (
          sales.map((x) => {
            const mine = x.userId === me || canManage;
            const loan = loans[x.id];
            return (
              <div key={x.id} className={s.event}>
                <span className={s.eventMain}>
                  <strong>{money(x.amount)} · {x.item || SALE_KIND_LABEL[x.kind]}{x.qty ? ` (${x.qty} ${x.unit})` : ''}</strong>
                  <small>
                    {fmtDate(x.date)}{x.buyer ? ` · ${x.buyer}` : ''}{x.groupName ? ` · ${x.groupName}` : ''}{x.unitName ? ` · ${x.unitName}` : ''}
                    {seesAll && x.byName ? ` · by ${x.byName}` : ''}{x.notes ? ` · ${x.notes}` : ''}
                  </small>
                </span>
                {loan ? (
                  <Link href={`/more/loans/${loan.loanId}`} className={s.rowLink}>
                    <StatusPill tone={loan.balance === 0 ? 'done' : loan.late ? 'overdue' : 'upcoming'}>{loan.balance === 0 ? 'Loan paid off' : `Loan · ${money(loan.balance)} left`}</StatusPill>
                  </Link>
                ) : x.paid ? <StatusPill tone="done">Paid</StatusPill> : <StatusPill tone="overdue">Owed</StatusPill>}
                {mine && !x.paid && !loan && <Button size="sm" variant="secondary" onClick={() => act(`/api/sales/${x.id}`, 'PATCH', { paid: true })}>Got paid</Button>}
                {mine && !x.animalEventId && (
                  <IconButton label="Delete sale" onClick={async () => { if (await askConfirm('Delete this sale?')) act(`/api/sales/${x.id}`, 'DELETE'); }}><Trash2 /></IconButton>
                )}
              </div>
            );
          })
        )}
      </Card>
      {error && <Banner tone="danger">{error}</Banner>}
      <Dialog sheet open={open} onClose={() => setOpen(false)} title="Record a sale">
        {open && <SaleForm today={today} groups={groups} places={places} borrowers={canManage ? borrowers : []} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

const firstDueAfter = (date: string, every: LoanEvery) => (every === 'week' ? addDays(date, 7) : addMonthsClamped(date, 1));

function SaleForm({ today, groups, places, borrowers, onDone }: { today: string; groups: Opt[]; places: Opt[]; borrowers: Opt[]; onDone: () => void }) {
  const m = useMutation();
  const [onLoan, setOnLoan] = useState(false);
  const [loan, setLoan] = useState({ borrowerId: '', instalment: '', every: 'month' as LoanEvery, firstDue: firstDueAfter(today, 'month') });
  const [kind, setKind] = useState<SaleKind>('eggs');
  const [f, setF] = useState({ item: '', qty: '', unit: SALE_UNITS.eggs[0], amount: '', buyer: '', date: today, from: '', notes: '' });
  const [paid, setPaid] = useState(true);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const fromAnimals = kind === 'eggs' || kind === 'milk' || kind === 'animal';
  const sources = fromAnimals ? groups : kind === 'produce' || kind === 'hay' ? places : [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      kind, item: f.item, qty: f.qty ? Number(f.qty) : null, unit: f.unit, amount: Number(f.amount), buyer: f.buyer, paid, date: f.date, notes: f.notes,
      groupId: fromAnimals && f.from ? f.from : null, landUnitId: !fromAnimals && f.from ? f.from : null,
      loan: onLoan ? { borrowerId: loan.borrowerId, instalment: Number(loan.instalment), every: loan.every, firstDue: loan.firstDue } : null,
    };
    if (await m.run({ url: '/api/sales', body, label: `Sale: $${f.amount}` })) onDone();
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <div className={s.two}>
        <Field label="What" htmlFor="sl-kind">
          <Select id="sl-kind" value={kind} onChange={(e) => { const k = e.target.value as SaleKind; setKind(k); setF({ ...f, unit: SALE_UNITS[k][0], from: '' }); }}>
            {Object.entries(SALE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Description (optional)" htmlFor="sl-item"><Input id="sl-item" value={f.item} onChange={set('item')} maxLength={80} placeholder={kind === 'produce' ? 'Tomatoes' : kind === 'animal' ? '2 wethers' : ''} /></Field>
        <Field label="How much" htmlFor="sl-qty"><Input id="sl-qty" type="number" inputMode="decimal" min="0" step="any" value={f.qty} onChange={set('qty')} /></Field>
        <Field label="Unit" htmlFor="sl-unit">
          <Select id="sl-unit" value={f.unit} onChange={set('unit')}>
            {SALE_UNITS[kind].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Total ($)" htmlFor="sl-amt"><Input id="sl-amt" type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Date" htmlFor="sl-date"><Input id="sl-date" type="date" value={f.date} max={today} onChange={set('date')} /></Field>
        {!onLoan && <Field label="Buyer (optional)" htmlFor="sl-buyer"><Input id="sl-buyer" value={f.buyer} onChange={set('buyer')} maxLength={80} /></Field>}
        {sources.length > 0 && (
          <Field label="From" htmlFor="sl-from" hint="Counts toward that herd’s or garden’s profit.">
            <Select id="sl-from" value={f.from} onChange={set('from')}>
              <option value="">Not set</option>
              {sources.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      {borrowers.length > 0 && (
        <Switch label="Pay over time" hint="A loan to someone on the farm, paid back in set amounts. No interest." checked={onLoan} onChange={setOnLoan} />
      )}
      {onLoan ? <LoanFields borrowers={borrowers} amount={Number(f.amount) || 0} saleDate={f.date} loan={loan} setLoan={setLoan} /> : (
        <Switch label="Paid" hint="Turn off if they still owe you." checked={paid} onChange={setPaid} />
      )}
      <Field label="Notes" htmlFor="sl-notes"><Textarea id="sl-notes" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      {m.queued && <Banner tone="ok">Saved — it’ll sync when you’re back online.</Banner>}
      <Button type="submit" block loading={m.busy}>Save sale</Button>
    </form>
  );
}

type LoanForm = { borrowerId: string; instalment: string; every: LoanEvery; firstDue: string };

function LoanFields({ borrowers, amount, saleDate, loan, setLoan }: { borrowers: Opt[]; amount: number; saleDate: string; loan: LoanForm; setLoan: (l: LoanForm) => void }) {
  const each = Number(loan.instalment) || 0;
  const plan = amount > 0 && each > 0 ? loanSchedule(amount, each, loan.every, loan.firstDue) : [];
  const last = plan.at(-1);
  return (
    <>
      <div className={s.two}>
        <Field label="Who’s buying" htmlFor="ln-who">
          <Select id="ln-who" value={loan.borrowerId} onChange={(e) => setLoan({ ...loan, borrowerId: e.target.value })} required>
            <option value="">Pick someone</option>
            {borrowers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Each payment ($)" htmlFor="ln-each"><Input id="ln-each" type="number" inputMode="decimal" min="0.01" step="0.01" value={loan.instalment} onChange={(e) => setLoan({ ...loan, instalment: e.target.value })} required /></Field>
        <Field label="How often" htmlFor="ln-every">
          <Select id="ln-every" value={loan.every} onChange={(e) => { const every = e.target.value as LoanEvery; setLoan({ ...loan, every, firstDue: firstDueAfter(saleDate, every) }); }}>
            <option value="week">Every week</option>
            <option value="month">Every month</option>
          </Select>
        </Field>
        <Field label="First payment" htmlFor="ln-first"><Input id="ln-first" type="date" min={saleDate} value={loan.firstDue} onChange={(e) => setLoan({ ...loan, firstDue: e.target.value })} required /></Field>
      </div>
      {last && (
        <Banner tone="info">
          {plan.length === 1
            ? `One payment of ${money(last.amount)} on ${fmtDate(last.date)}.`
            : `${plan.length} payments ${EVERY_LABEL[loan.every]}, ${money(plan[0].amount)} each${last.amount !== plan[0].amount ? ` (the last one ${money(last.amount)})` : ''}, finishing ${fmtDate(last.date)}.`}
          {' '}They’ll get a reminder before each one.
        </Banner>
      )}
    </>
  );
}
