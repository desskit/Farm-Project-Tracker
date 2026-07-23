'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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
  const low = item.qty <= item.reorderAt;

  async function adjust(amount: number, note: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/inventory/${item.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: amount, reason: note }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return;
    }
    setDelta('');
    setReason('');
    router.refresh();
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
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button className="btn small ghost danger" disabled={busy} onClick={onDelete}>
              Delete item
            </button>
          </div>
        )}
      </div>

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
