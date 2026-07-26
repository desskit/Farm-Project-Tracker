'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { submitQueued } from '@/lib/client/outbox';
import Link from 'next/link';
import type { InventoryRow, InventoryLogRow } from '@/lib/data/inventory';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import { fmtDate } from '@/lib/domain/dates';

export function SupplyDetail({
  item,
  log,
  people,
  currentUser,
}: {
  item: InventoryRow;
  log: InventoryLogRow[];
  people: PersonRow[];
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const isManager = currentUser.role === 'manager' || currentUser.role === 'admin';
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const low = item.qty <= item.reorderAt;

  async function adjust(amount: number, note: string) {
    setBusy(true);
    setError(null);
    // Stock is drawn at the barn. The server keys this write, so a replayed
    // queue entry can't take the amount off twice.
    const r = await submitQueued({
      url: `/api/inventory/${item.id}/adjust`,
      body: { delta: amount, reason: note },
      label: `${amount > 0 ? 'Restocked' : 'Used'} ${Math.abs(amount)} ${item.unit} of ${item.name}`,
    });
    setBusy(false);
    if (!r.ok && !r.queued) {
      setError(r.error);
      return;
    }
    setDelta('');
    setReason('');
    if (r.ok) router.refresh();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const d = Number(delta);
    if (!d) {
      setError('Enter a non-zero amount.');
      return;
    }
    await adjust(d, reason);
  }

  async function onDelete() {
    if (!confirm('Delete this inventory item and its history?')) return;
    setBusy(true);
    const res = await fetch(`/api/inventory/${item.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.push('/more/supplies');
  }

  return (
    <>
      <div className="sub-head">
        <Link href="/more/supplies" className="btn small ghost back-btn">
          ‹ Supplies
        </Link>
        <h1>{item.name}</h1>
      </div>

      <div className="card">
        <p className="subtle" style={{ margin: 0 }}>
          {item.category}
          {item.notes ? ` · ${item.notes}` : ''}
        </p>
        <p style={{ fontSize: 26, fontWeight: 800, margin: '4px 0' }}>
          {item.qty}{' '}
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>{item.unit}</span>{' '}
          {low && <span className="badge overdue">Low</span>}
        </p>
        {item.unitCost != null && (
          <p className="subtle" style={{ margin: '0 0 4px' }}>
            ${item.unitCost.toFixed(2)}/{item.unit} · ${(item.qty * item.unitCost).toFixed(2)} on hand
          </p>
        )}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Log usage or restock</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="btn" disabled={busy} onClick={() => setDelta(String((Number(delta) || 0) - 1))}>
                −1
              </button>
              <input type="number" step="any" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+/- amount" style={{ flex: 1 }} />
              <button type="button" className="btn" disabled={busy} onClick={() => setDelta(String((Number(delta) || 0) + 1))}>
                +1
              </button>
            </div>
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. fed the flock, bought 5 bags" />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={busy} className="btn primary block">
            Apply change
          </button>
        </form>

        {isManager && (
          <div className="row-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn small ghost" disabled={busy} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cancel edit' : 'Edit details'}
            </button>
            <button className="btn small ghost danger" disabled={busy} onClick={onDelete}>
              Delete item
            </button>
          </div>
        )}
      </div>

      {isManager && editing && (
        <>
          <div className="section-title">Edit item</div>
          <div className="card">
            <EditSupplyForm item={item} onDone={() => setEditing(false)} />
          </div>
        </>
      )}

      <div className="section-title">History</div>
      <div className="card">
        {!log.length ? (
          <p className="subtle" style={{ margin: 0 }}>
            No changes yet.
          </p>
        ) : (
          log.slice(0, 15).map((l) => (
            <div className="hist-row" key={l.id}>
              <span>
                {l.delta > 0 ? '+' : ''}
                {l.delta} {item.unit} · {nameById.get(l.userId ?? '') ?? 'Unknown'}
                {l.reason ? ` · ${l.reason}` : ''}
              </span>
              <span className="subtle">{fmtDate(l.date)}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/** Rename a supply and tune its unit / reorder threshold without recreating it. */
function EditSupplyForm({ item, onDone }: { item: InventoryRow; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [unit, setUnit] = useState(item.unit);
  const [reorderAt, setReorderAt] = useState(String(item.reorderAt));
  const [unitCost, setUnitCost] = useState(item.unitCost == null ? '' : String(item.unitCost));
  const [notes, setNotes] = useState(item.notes);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        unit,
        reorderAt: Number(reorderAt) || 0,
        unitCost: unitCost.trim() === '' ? null : Number(unitCost),
        notes,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || 'Could not save changes.');
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label>Category</label>
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Feed" />
      </div>
      <div className="field">
        <label>Unit</label>
        <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. bags, gallons" />
      </div>
      <div className="field">
        <label>Reorder when at or below</label>
        <input type="number" step="any" min={0} value={reorderAt} onChange={(e) => setReorderAt(e.target.value)} />
      </div>
      <div className="field">
        <label>Cost per unit (optional)</label>
        <input
          type="number"
          step="0.01"
          min={0}
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          placeholder="Leave blank if you don't track it"
        />
        <p className="subtle" style={{ margin: '6px 0 0' }}>
          Used for on-hand value, and to count what you use as spending.
        </p>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      {err && <p className="error-text">{err}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn primary">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
