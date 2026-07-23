'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { RentChargeRow, RentAssignmentRow, RentSummary } from '@/lib/data/rent';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import { fmtDate } from '@/lib/domain/dates';

export function RentView({
  charges,
  summary,
  people,
  assignments,
  currentUser,
}: {
  charges: RentChargeRow[];
  summary: RentSummary | null;
  people: PersonRow[];
  assignments: Record<string, RentAssignmentRow | null>;
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const isManager = currentUser.role === 'manager' || currentUser.role === 'admin';
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, url: string, body?: unknown) {
    setBusy(key);
    setError(null);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return;
    }
    router.refresh();
  }

  function onMarkPaid(c: RentChargeRow) {
    const note = window.prompt('Mark paid — how? (cash, check, app… optional)', c.note || '');
    if (note === null) return;
    act('mark-' + c.id, `/api/rent/${c.id}/mark`, { note });
  }

  return (
    <>
      {isManager && summary && (
        <>
          <AssignForm people={people} assignments={assignments} onError={setError} />
          {summary.count > 0 && (
            <div className="stat-row">
              <div className="stat-tile">
                <span className="stat-val">${summary.collected.toFixed(0)}</span>
                <span className="stat-lbl">collected</span>
              </div>
              <div className="stat-tile">
                <span className="stat-val">${summary.due.toFixed(0)}</span>
                <span className="stat-lbl">due</span>
              </div>
              <div className={`stat-tile ${summary.unpaid ? 'warn' : ''}`}>
                <span className="stat-val">{summary.unpaid}</span>
                <span className="stat-lbl">unpaid</span>
              </div>
              <div className={`stat-tile ${summary.marked ? 'today' : ''}`}>
                <span className="stat-val">{summary.marked}</span>
                <span className="stat-lbl">to verify</span>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      {!charges.length ? (
        <div className="empty">{isManager ? 'No rent assigned yet.' : 'No rent is assigned to you.'}</div>
      ) : (
        charges.map((c) => (
          <div className="card" key={c.id}>
            <div className="item">
              <div className="item-main">
                <p className="item-title">
                  {nameById.get(c.userId) ?? 'Someone'} · ${c.amount}
                </p>
                <div className="item-badges">
                  {c.status === 'verified' ? (
                    <span className="badge upcoming">Verified {c.verifiedAt ? fmtDate(c.verifiedAt) : ''}</span>
                  ) : c.status === 'marked' ? (
                    <span className="badge today">Marked paid {c.markedAt ? fmtDate(c.markedAt) : ''} — awaiting verification</span>
                  ) : (
                    <span className="badge overdue">Unpaid · due {fmtDate(c.dueDate)}</span>
                  )}
                </div>
                {c.note && <p className="item-sub" style={{ marginTop: 6 }}>“{c.note}”</p>}
              </div>
            </div>
            <div className="row-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              {c.status !== 'verified' && (c.userId === currentUser.id || isManager) && (
                <button className="btn small" disabled={busy === 'mark-' + c.id} onClick={() => onMarkPaid(c)}>
                  Mark paid
                </button>
              )}
              {isManager && c.status !== 'verified' && (
                <button className="btn small primary" disabled={busy === 'verify-' + c.id} onClick={() => act('verify-' + c.id, `/api/rent/${c.id}/verify`)}>
                  ✓ Verify received
                </button>
              )}
              {isManager && c.status !== 'unpaid' && (
                <button className="btn small ghost danger" disabled={busy === 'reopen-' + c.id} onClick={() => act('reopen-' + c.id, `/api/rent/${c.id}/reopen`)}>
                  Reopen
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function AssignForm({
  people,
  assignments,
  onError,
}: {
  people: PersonRow[];
  assignments: Record<string, RentAssignmentRow | null>;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(people[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [loading, setLoading] = useState(false);

  function pick(id: string) {
    setUserId(id);
    const a = assignments[id];
    setAmount(a ? String(a.amount) : '');
    setDueDay(a ? String(a.dueDay) : '1');
  }

  if (!open) {
    return (
      <button className="btn block" style={{ marginBottom: 12 }} onClick={() => { setOpen(true); pick(userId); }}>
        + Assign / edit rent
      </button>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    const res = await fetch('/api/rent/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, amount: Number(amount), dueDay: Number(dueDay) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || 'Something went wrong.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function stop() {
    if (!confirm(`Stop charging ${people.find((p) => p.id === userId)?.name ?? 'this person'} rent?`)) return;
    setLoading(true);
    const res = await fetch('/api/rent/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setLoading(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="card">
      <form onSubmit={submit}>
        <div className="field">
          <label>Person</label>
          <select value={userId} onChange={(e) => pick(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Monthly amount ($)</label>
          <input type="number" min={1} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="field">
          <label>Due day of month (1–28)</label>
          <input type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn ghost danger" disabled={loading} onClick={stop}>
            Stop rent
          </button>
          <button type="submit" disabled={loading} className="btn primary">
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
