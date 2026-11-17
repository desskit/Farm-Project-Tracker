'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, Repeat, SkipForward, Trash2 } from 'lucide-react';
import type { StandingOrderRow } from '@/lib/data/standing-orders';
import type { SaleKind } from '@/db/schema';
import { EVERY_ORDER_LABEL, type OrderEvery } from '@/lib/domain/standing';
import { SALE_KIND_LABEL, SALE_UNITS, saleKindLabel } from '@/lib/domain/money';
import { fmtDate, relativeLabel } from '@/lib/domain/dates';
import { useMutation } from '@/lib/client/mutate';
import { useDialogs } from '@/components/ui/dialogs';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, ListRow, Select, StatusPill, Switch, Textarea } from '@/components/ui';
import s from '../../farm/animals/animals.module.css';

type Opt = { id: string; name: string };
const usd = (n: number) => `$${n.toFixed(2)}`;
const what = (o: StandingOrderRow) => `${o.qty ? `${o.qty} ${o.unit} ` : ''}${o.item || saleKindLabel(o)}`;

/** Deliveries due today or missed: Delivered records the sale, Skip moves on. */
export function DeliveriesDue({ orders, today }: { orders: StandingOrderRow[]; today: string }) {
  const router = useRouter();
  const m = useMutation();
  if (!orders.length) return null;
  async function settle(o: StandingOrderRow, action: 'delivered' | 'skipped') {
    if (await m.run({ url: `/api/standing-orders/${o.id}/deliver`, body: { forDate: o.nextDate, action }, label: action === 'delivered' ? `Delivered to ${o.buyer}` : 'Skipped' })) router.refresh();
  }
  return (
    <Card title={`Deliveries due (${orders.length})`} flush>
      {orders.map((o) => (
        <div key={o.id} className={s.event}>
          <span className={s.eventMain}>
            <strong>{o.buyer} · {what(o)}</strong>
            <small>{usd(o.price)} · {o.nextDate < today ? `was due ${relativeLabel(o.nextDate)}` : 'today'}{o.paidOnDelivery ? ' · they pay on delivery' : ' · goes on their tab'}</small>
          </span>
          <Button size="sm" icon={<Check />} disabled={m.busy} onClick={() => settle(o, 'delivered')}>Delivered</Button>
          <IconButton label={`Skip this delivery to ${o.buyer}`} onClick={() => settle(o, 'skipped')}><SkipForward /></IconButton>
        </div>
      ))}
      {m.error && <Banner tone="danger">{m.error}</Banner>}
    </Card>
  );
}

export function StandingOrdersCard({ orders, today, groups, places }: { orders: StandingOrderRow[]; today: string; groups: Opt[]; places: Opt[] }) {
  const [editing, setEditing] = useState<StandingOrderRow | 'new' | null>(null);
  return (
    <Card title="Standing orders" action={<Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setEditing('new')}>Add</Button>} flush>
      {orders.length === 0 ? (
        <EmptyState icon={<Repeat />} title="No regular buyers yet">For someone who takes the same thing on a schedule, like 2 dozen eggs every Friday.</EmptyState>
      ) : orders.map((o) => (
        <ListRow
          key={o.id}
          lead={<Repeat />}
          title={`${o.buyer} · ${what(o)}`}
          meta={`${usd(o.price)} · ${EVERY_ORDER_LABEL[o.every].toLowerCase()} · next ${fmtDate(o.nextDate)}`}
          trail={<>{!o.active && <StatusPill tone="neutral">Paused</StatusPill>}<IconButton label={`Edit order for ${o.buyer}`} onClick={() => setEditing(o)}><Pencil /></IconButton></>}
        />
      ))}
      <Dialog sheet open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New standing order' : 'Standing order'}>
        {editing && <OrderForm order={editing === 'new' ? null : editing} today={today} groups={groups} places={places} onDone={() => setEditing(null)} />}
      </Dialog>
    </Card>
  );
}

const BUILT_IN = ['eggs', 'milk', 'produce', 'animal', 'hay', 'other'] as const;

function OrderForm({ order, today, groups, places, onDone }: { order: StandingOrderRow | null; today: string; groups: Opt[]; places: Opt[]; onDone: () => void }) {
  const router = useRouter();
  const m = useMutation();
  const { confirm: askConfirm } = useDialogs();
  const [kind, setKind] = useState<SaleKind>(order?.kind ?? 'eggs');
  const [f, setF] = useState({
    buyer: order?.buyer ?? '', category: order?.category ?? '', item: order?.item ?? '', qty: order?.qty != null ? String(order.qty) : '', unit: order?.unit ?? SALE_UNITS.eggs[0],
    price: order ? String(order.price) : '', every: (order?.every ?? 'week') as OrderEvery, startDate: order?.startDate ?? today, from: order?.groupId ?? order?.landUnitId ?? '', notes: order?.notes ?? '',
  });
  const [paidOnDelivery, setPaidOnDelivery] = useState(order?.paidOnDelivery ?? false);
  const [active, setActive] = useState(order?.active ?? true);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const fromAnimals = kind === 'eggs' || kind === 'milk' || kind === 'animal';
  const sources = fromAnimals ? groups : kind === 'produce' || kind === 'hay' ? places : [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      buyer: f.buyer, kind, category: kind === 'other' ? f.category : '', item: f.item, qty: f.qty ? Number(f.qty) : null, unit: f.unit, price: Number(f.price),
      every: f.every, startDate: f.startDate, groupId: fromAnimals && f.from ? f.from : null, landUnitId: !fromAnimals && f.from ? f.from : null,
      paidOnDelivery, active, notes: f.notes,
    };
    if (await m.run({ url: order ? `/api/standing-orders/${order.id}` : '/api/standing-orders', method: order ? 'PATCH' : 'POST', body, label: 'Standing order' })) { onDone(); router.refresh(); }
  }
  async function remove() {
    if (!order || !(await askConfirm(`Delete the standing order for ${order.buyer}? Sales already recorded stay.`))) return;
    if (await m.run({ url: `/api/standing-orders/${order.id}`, method: 'DELETE', label: 'Deleted' })) { onDone(); router.refresh(); }
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="Buyer" htmlFor="so-buyer"><Input id="so-buyer" value={f.buyer} onChange={set('buyer')} required maxLength={80} placeholder="The Millers" /></Field>
      <div className={s.two}>
        <Field label="What" htmlFor="so-kind">
          <Select id="so-kind" value={kind} onChange={(e) => { const k = e.target.value as SaleKind; setKind(k); setF({ ...f, unit: SALE_UNITS[k][0], from: '' }); }}>
            {BUILT_IN.map((k) => <option key={k} value={k}>{SALE_KIND_LABEL[k]}</option>)}
          </Select>
        </Field>
        {kind === 'other' && <Field label="Category" htmlFor="so-cat"><Input id="so-cat" value={f.category} onChange={set('category')} maxLength={40} placeholder="Firewood" /></Field>}
        <Field label="Description (optional)" htmlFor="so-item"><Input id="so-item" value={f.item} onChange={set('item')} maxLength={80} /></Field>
        <Field label="How much" htmlFor="so-qty"><Input id="so-qty" type="number" inputMode="decimal" min="0" step="any" value={f.qty} onChange={set('qty')} /></Field>
        <Field label="Unit" htmlFor="so-unit">
          <Select id="so-unit" value={f.unit} onChange={set('unit')}>{SALE_UNITS[kind].map((u) => <option key={u} value={u}>{u}</option>)}</Select>
        </Field>
        <Field label="Price each time ($)" htmlFor="so-price"><Input id="so-price" type="number" inputMode="decimal" min="0.01" step="0.01" value={f.price} onChange={set('price')} required /></Field>
        <Field label="How often" htmlFor="so-every">
          <Select id="so-every" value={f.every} onChange={(e) => setF({ ...f, every: e.target.value as OrderEvery })}>
            {(Object.keys(EVERY_ORDER_LABEL) as OrderEvery[]).map((k) => <option key={k} value={k}>{EVERY_ORDER_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="First delivery" htmlFor="so-start" hint="Weekly orders repeat on this weekday."><Input id="so-start" type="date" value={f.startDate} onChange={set('startDate')} required /></Field>
        {sources.length > 0 && (
          <Field label="From" htmlFor="so-from">
            <Select id="so-from" value={f.from} onChange={set('from')}>
              <option value="">Not set</option>
              {sources.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <Switch label="They pay on delivery" hint="Off: each delivery goes on their tab until marked paid." checked={paidOnDelivery} onChange={setPaidOnDelivery} />
      {order && <Switch label="Active" hint="Turn off to pause deliveries." checked={active} onChange={setActive} />}
      <Field label="Notes" htmlFor="so-notes"><Textarea id="so-notes" rows={2} value={f.notes} onChange={set('notes')} placeholder="Leave in the cooler by the gate" /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      <Button type="submit" block loading={m.busy}>Save</Button>
      {order && <Button variant="ghost" icon={<Trash2 />} onClick={remove} disabled={m.busy}>Delete</Button>}
    </form>
  );
}
