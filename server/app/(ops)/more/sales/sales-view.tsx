'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CircleDollarSign, FileText, Plus, Trash2 } from 'lucide-react';
import type { SaleRow } from '@/lib/data/sales';
import { COMMON_UNITS, SALE_KIND_LABEL, SALE_UNITS, categoryChoices, saleKindLabel } from '@/lib/domain/money';
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
  sales, canLogFarm, canManage, me, seesAll, today, groups, places, loans, borrowers, categories, title, personalList = false,
}: {
  sales: SaleRow[]; canLogFarm: boolean; canManage: boolean; me: string; seesAll: boolean; today: string; groups: Opt[]; places: Opt[];
  loans: Record<string, LoanInfo>; borrowers: Opt[]; categories: string[]; title?: string;
  /** The "your personal sales" list: its form starts on a personal sale. */
  personalList?: boolean;
}) {
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
      <Card title={title} action={<Button size="sm" icon={<Plus />} onClick={() => setOpen(true)}>Record a sale</Button>} flush>
        {sales.length === 0 ? (
          <EmptyState icon={<CircleDollarSign />} title="No sales here">
            {canLogFarm ? 'Record eggs, produce, animals or hay as you sell them, or something of your own: tools, a truck, a firearm.' : 'Record something you sold to someone: tools, a truck, a firearm. Only you and the buyer see it.'}
          </EmptyState>
        ) : (
          sales.map((x) => {
            const mine = x.personal ? x.sellerId === me : x.userId === me || canManage;
            const loan = loans[x.id];
            return (
              <div key={x.id} className={s.event}>
                <span className={s.eventMain}>
                  <strong>{money(x.amount)} · {x.item || saleKindLabel(x)}{x.qty ? ` (${x.qty} ${x.unit})` : ''}</strong>
                  <small>
                    {fmtDate(x.date)}{x.item ? ` · ${saleKindLabel(x)}` : ''}{x.serial ? ` · #${x.serial}` : ''}{x.buyer ? ` · to ${x.buyer}` : ''}{x.groupName ? ` · ${x.groupName}` : ''}{x.unitName ? ` · ${x.unitName}` : ''}
                    {seesAll && x.byName ? ` · by ${x.byName}` : ''}{x.notes ? ` · ${x.notes}` : ''}
                  </small>
                </span>
                {loan ? (
                  <Link href={`/more/loans/${loan.loanId}`} className={s.rowLink}>
                    <StatusPill tone={loan.balance === 0 ? 'done' : loan.late ? 'overdue' : 'upcoming'}>{loan.balance === 0 ? 'Loan paid off' : `Loan · ${money(loan.balance)} left`}</StatusPill>
                  </Link>
                ) : x.paid ? <StatusPill tone="done">Paid</StatusPill> : <StatusPill tone="overdue">Owed</StatusPill>}
                {mine && !x.paid && !loan && <Button size="sm" variant="secondary" onClick={() => act(`/api/sales/${x.id}`, 'PATCH', { paid: true })}>Got paid</Button>}
                <Link href={`/more/sales/${x.id}/bill`} className={s.rowLink} aria-label="Bill of sale" title="Bill of sale"><FileText aria-hidden width={18} height={18} /></Link>
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
        {open && <SaleForm today={today} groups={groups} places={places} borrowers={borrowers} me={me} canLogFarm={canLogFarm} canManage={canManage} categories={categories} startPersonal={personalList || !canLogFarm} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

const firstDueAfter = (date: string, every: LoanEvery) => (every === 'week' ? addDays(date, 7) : addMonthsClamped(date, 1));

const BUILT_IN = ['eggs', 'milk', 'produce', 'animal', 'hay'] as const;
type BuiltIn = (typeof BUILT_IN)[number];
const isBuiltIn = (v: string): v is BuiltIn => (BUILT_IN as readonly string[]).includes(v);

function SaleForm({ today, groups, places, borrowers, me, canLogFarm, canManage, categories, startPersonal, onDone }: {
  today: string; groups: Opt[]; places: Opt[]; borrowers: Opt[]; me: string; canLogFarm: boolean; canManage: boolean; categories: string[]; startPersonal: boolean; onDone: () => void;
}) {
  const m = useMutation();
  const [personal, setPersonal] = useState(startPersonal);
  // "eggs" … "hay", "cat:<name>" for a category of your own, or "new" to type one.
  const [what, setWhat] = useState<string>(startPersonal ? 'new' : 'eggs');
  const [newCat, setNewCat] = useState('');
  const [f, setF] = useState({ item: '', qty: '', unit: startPersonal ? 'each' : SALE_UNITS.eggs[0], amount: '', buyer: '', date: today, from: '', notes: '', serial: '' });
  const [paid, setPaid] = useState(true);
  const [onLoan, setOnLoan] = useState(false);
  const [loan, setLoan] = useState({ borrowerId: '', instalment: '', every: 'month' as LoanEvery, firstDue: firstDueAfter(today, 'month') });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const builtIn = isBuiltIn(what) ? what : null;
  const category = what === 'new' ? newCat.trim() : what.startsWith('cat:') ? what.slice(4) : '';
  const fromAnimals = builtIn === 'eggs' || builtIn === 'milk' || builtIn === 'animal';
  const sources = personal ? [] : fromAnimals ? groups : builtIn === 'produce' || builtIn === 'hay' ? places : [];
  // Goods sold by weight or count don't have serial numbers; everything else might.
  const showSerial = !builtIn || builtIn === 'animal';
  const lendTo = borrowers.filter((b) => !personal || b.id !== me);
  const canLend = lendTo.length > 0 && (personal || canManage);
  const choices = categoryChoices(categories);

  function pick(v: string) {
    setWhat(v);
    setF({ ...f, unit: isBuiltIn(v) ? SALE_UNITS[v][0] : isBuiltIn(what) ? 'each' : f.unit, from: '' });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      kind: builtIn ?? 'other', category, serial: showSerial ? f.serial : '', personal,
      item: f.item, qty: f.qty ? Number(f.qty) : null, unit: f.unit, amount: Number(f.amount), buyer: f.buyer, paid, date: f.date, notes: f.notes,
      groupId: !personal && fromAnimals && f.from ? f.from : null, landUnitId: !personal && !fromAnimals && f.from ? f.from : null,
      loan: canLend && onLoan ? { borrowerId: loan.borrowerId, instalment: Number(loan.instalment), every: loan.every, firstDue: loan.firstDue } : null,
    };
    if (await m.run({ url: '/api/sales', body, label: `Sale: $${f.amount}` })) onDone();
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      {canLogFarm && (
        <Field label="Who’s selling" htmlFor="sl-seller" hint={personal ? 'Only you and the buyer see it. It doesn’t count toward the farm’s sales, profit or taxes.' : undefined}>
          <Select id="sl-seller" value={personal ? 'me' : 'farm'} onChange={(e) => setPersonal(e.target.value === 'me')}>
            <option value="farm">The farm</option>
            <option value="me">Me (a personal sale)</option>
          </Select>
        </Field>
      )}
      {!canLogFarm && <p className={s.muted}>A personal sale: only you and the buyer see it.</p>}
      <div className={s.two}>
        <Field label="What" htmlFor="sl-kind">
          <Select id="sl-kind" value={what} onChange={(e) => pick(e.target.value)}>
            <optgroup label="Farm goods">
              {BUILT_IN.map((k) => <option key={k} value={k}>{SALE_KIND_LABEL[k]}</option>)}
            </optgroup>
            <optgroup label="Categories">
              {choices.map((c) => <option key={c} value={`cat:${c}`}>{c}</option>)}
              <option value="new">Something else…</option>
            </optgroup>
          </Select>
        </Field>
        {what === 'new' && (
          <Field label="Category" htmlFor="sl-cat" hint="Your own word for it; it’ll be offered next time.">
            <Input id="sl-cat" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={40} placeholder="e.g. Saddles" required />
          </Field>
        )}
        <Field label="Description (optional)" htmlFor="sl-item">
          <Input id="sl-item" value={f.item} onChange={set('item')} maxLength={80} placeholder={builtIn === 'produce' ? 'Tomatoes' : builtIn === 'animal' ? '2 wethers' : builtIn ? '' : 'Make and model'} />
        </Field>
        {showSerial && (
          <Field label="Serial or ID number (optional)" htmlFor="sl-serial" hint="Serial, VIN, tag or registration.">
            <Input id="sl-serial" value={f.serial} onChange={set('serial')} maxLength={80} autoComplete="off" />
          </Field>
        )}
        <Field label="How much" htmlFor="sl-qty"><Input id="sl-qty" type="number" inputMode="decimal" min="0" step="any" value={f.qty} onChange={set('qty')} /></Field>
        <Field label="Unit" htmlFor="sl-unit">
          {builtIn ? (
            <Select id="sl-unit" value={f.unit} onChange={set('unit')}>
              {SALE_UNITS[builtIn].map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          ) : (
            <>
              <Input id="sl-unit" list="sl-units" value={f.unit} onChange={set('unit')} maxLength={20} />
              <datalist id="sl-units">{COMMON_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
            </>
          )}
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
      {canLend && (
        <Switch label="Pay over time" hint={personal ? 'They pay you back in set amounts. You confirm each payment. No interest.' : 'A loan to someone on the farm, paid back in set amounts. No interest.'} checked={onLoan} onChange={setOnLoan} />
      )}
      {canLend && onLoan ? <LoanFields borrowers={lendTo} amount={Number(f.amount) || 0} saleDate={f.date} loan={loan} setLoan={setLoan} /> : (
        <Switch label="Paid" hint="Turn off if they still owe you." checked={paid} onChange={setPaid} />
      )}
      <Field label="Notes" htmlFor="sl-notes"><Textarea id="sl-notes" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      {m.queued && <Banner tone="ok">Saved — it’ll sync when you’re back online.</Banner>}
      <Button type="submit" block loading={m.busy} disabled={what === 'new' && !newCat.trim()}>Save sale</Button>
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
