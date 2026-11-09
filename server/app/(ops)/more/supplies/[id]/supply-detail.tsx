'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { submitQueued } from '@/lib/client/outbox';
import type { InventoryRow, InventoryLogRow } from '@/lib/data/inventory';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import { fmtDate } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { Banner, Button, Card, Field, IconButton, Input, NumberStepper, PageHeader, Stack, StatusPill, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from './supply.module.css';

export function SupplyDetail({ item, log, people, currentUser }: { item: InventoryRow; log: InventoryLogRow[]; people: PersonRow[]; currentUser: SessionUser }) {
  const { confirm: askConfirm } = useDialogs();
  const router = useRouter();
  const manages = can(currentUser, 'supplies.manage');
  const seesMoney = can(currentUser, 'finance.view');
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<string | null>(null);
  const [busy, setBusy] = useState<'use' | 'restock' | null>(null);
  const [editing, setEditing] = useState(false);
  const low = item.qty <= item.reorderAt;

  async function adjust(kind: 'use' | 'restock') {
    if (!(amount > 0)) return setError('Enter an amount above zero.');
    const delta = kind === 'use' ? -amount : amount;
    setBusy(kind);
    setError(null);
    setQueued(null);
    // Stock is drawn at the barn; the server keys this write so a replay can't count twice.
    const r = await submitQueued({
      url: `/api/inventory/${item.id}/adjust`,
      body: { delta, reason },
      label: `${kind === 'use' ? 'Used' : 'Restocked'} ${amount} ${item.unit} of ${item.name}`,
    });
    setBusy(null);
    if (!r.ok && !r.queued) return setError(r.error);
    setReason('');
    setAmount(1);
    if (r.ok) router.refresh();
    else setQueued('Saved on this device — it will sync when you’re back online.');
  }

  return (
    <Stack gap={16}>
      <PageHeader
        back={<Link href="/more/supplies" aria-label="Back to supplies" className={s.back}><ChevronLeft /></Link>}
        title={item.name}
        subtitle={[item.category, item.notes].filter(Boolean).join(' · ')}
        actions={
          manages ? (
            <>
              <IconButton label="Edit supply" onClick={() => setEditing((v) => !v)}><Pencil /></IconButton>
              <IconButton
                label="Delete supply"
                onClick={async () => {
                  if (!(await askConfirm('Delete this inventory item and its history?'))) return;
                  const res = await fetch(`/api/inventory/${item.id}`, { method: 'DELETE' });
                  if (res.ok) router.push('/more/supplies');
                  else setError((await res.json().catch(() => ({}))).error || 'Could not delete.');
                }}
              >
                <Trash2 />
              </IconButton>
            </>
          ) : undefined
        }
      />

      <Card>
        <div className={s.onHand}>
          <span className={s.qty}>{item.qty}</span>
          <span className={s.unit}>{item.unit} on hand</span>
          {low && <StatusPill tone="overdue">Low — reorder</StatusPill>}
        </div>
        <p className={s.muted}>
          Reorder at {item.reorderAt} {item.unit}
          {seesMoney && item.unitCost != null && ` · $${item.unitCost.toFixed(2)}/${item.unit} · $${(item.qty * item.unitCost).toFixed(2)} on hand`}
        </p>
        {editing && manages && <EditSupplyForm item={item} onDone={() => setEditing(false)} />}
      </Card>

      <Card title="Log a change">
        <Stack>
          <NumberStepper label="Amount" value={amount} onChange={setAmount} min={0} unit={item.unit} />
          <Field label="Note (optional)" htmlFor="sup-note">
            <Input id="sup-note" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. fed the flock, bought 5 bags" />
          </Field>
          {error && <Banner tone="danger">{error}</Banner>}
          {queued && <Banner tone="ok">{queued}</Banner>}
          <div className={s.actions}>
            <Button icon={<Minus />} loading={busy === 'use'} disabled={busy !== null} onClick={() => adjust('use')}>Used {amount}</Button>
            <Button variant="secondary" icon={<Plus />} loading={busy === 'restock'} disabled={busy !== null} onClick={() => adjust('restock')}>Restocked {amount}</Button>
          </div>
        </Stack>
      </Card>

      <Card title="History" flush>
        {!log.length ? (
          <p className={s.empty}>No changes yet.</p>
        ) : (
          log.slice(0, 15).map((l) => (
            <div className={s.hist} key={l.id}>
              <span className={l.delta > 0 ? s.plus : s.minus}>{l.delta > 0 ? '+' : ''}{l.delta} {item.unit}</span>
              <span className={s.histMain}>
                {nameById.get(l.userId ?? '') ?? 'Unknown'}
                {l.reason && <span className={s.muted}> · {l.reason}</span>}
              </span>
              <span className={s.muted}>{fmtDate(l.date)}</span>
            </div>
          ))
        )}
      </Card>
    </Stack>
  );
}

/** Rename a supply and tune its unit / reorder point / cost without recreating it. */
function EditSupplyForm({ item, onDone }: { item: InventoryRow; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: item.name, category: item.category, unit: item.unit, reorderAt: String(item.reorderAt),
    unitCost: item.unitCost == null ? '' : String(item.unitCost), notes: item.notes,
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, reorderAt: Number(f.reorderAt) || 0, unitCost: f.unitCost.trim() === '' ? null : Number(f.unitCost) }),
    });
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error || 'Could not save changes.');
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className={s.editForm}>
      <Stack>
        <Field label="Name" htmlFor="es-name"><Input id="es-name" value={f.name} onChange={(e) => set({ name: e.target.value })} required /></Field>
        <div className={s.two}>
          <Field label="Category" htmlFor="es-cat"><Input id="es-cat" value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Feed" /></Field>
          <Field label="Unit" htmlFor="es-unit"><Input id="es-unit" value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="bags, gallons" /></Field>
          <Field label="Reorder at" htmlFor="es-re"><Input id="es-re" type="number" step="any" min={0} inputMode="decimal" value={f.reorderAt} onChange={(e) => set({ reorderAt: e.target.value })} /></Field>
          <Field label="Cost per unit" htmlFor="es-cost" hint="For on-hand value and spending.">
            <Input id="es-cost" type="number" step="0.01" min={0} inputMode="decimal" value={f.unitCost} onChange={(e) => set({ unitCost: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="es-notes"><Textarea id="es-notes" value={f.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} /></Field>
        {err && <Banner tone="danger">{err}</Banner>}
        <div className={s.actions}>
          <Button type="submit" loading={busy}>Save changes</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </Stack>
    </form>
  );
}
