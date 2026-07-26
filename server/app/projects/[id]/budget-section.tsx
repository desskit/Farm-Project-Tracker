'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate } from '@/lib/domain/dates';
import { uploadPhoto } from '@/lib/client/photo';
import type { ExpenseRow, BudgetSummary } from '@/lib/data/project-expenses';
import type { SessionUser } from '@/lib/auth/session';

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * What a project has cost so far, against its budget if one is set. Anyone can
 * log an expense — whoever went to the lumber yard is whoever went.
 */
export function BudgetSection({
  projectId,
  expenses,
  summary,
  currentUser,
}: {
  projectId: string;
  expenses: ExpenseRow[];
  summary: BudgetSummary;
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const isManager = currentUser.role === 'manager' || currentUser.role === 'admin';
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const photoId = file ? await uploadPhoto(file) : null;
      const res = await fetch(`/api/projects/${projectId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), amount: Number(amount), photoId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not save the expense.');
        return;
      }
      setLabel('');
      setAmount('');
      setFile(null);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this expense?')) return;
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not delete the expense.');
    }
  }

  // Bar fills to the budget; going over pins it full and turns it red.
  const barPct = summary.pct == null ? 0 : Math.min(summary.pct, 100);

  return (
    <>
      <div className="section-title">
        Budget
        {expenses.length > 0 && <span className="count-pill">{expenses.length}</span>}
      </div>

      <div className="card">
        {summary.budget == null ? (
          <p className="subtle" style={{ margin: 0 }}>
            {summary.spent > 0 ? (
              <>
                <strong style={{ color: 'var(--text)', fontSize: 20 }}>{money(summary.spent)}</strong> spent so far.
                {isManager ? ' Set a budget when you edit the project to track against it.' : ''}
              </>
            ) : (
              'Nothing spent yet.'
            )}
          </p>
        ) : (
          <>
            <p style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>
              {money(summary.spent)}{' '}
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>of {money(summary.budget)}</span>
            </p>
            <div className="progress">
              <span className={summary.over ? 'over' : ''} style={{ width: `${barPct}%` }} />
            </div>
            <p className="subtle" style={{ margin: '6px 0 0' }}>
              {summary.over ? (
                <span className="over-text">{money(Math.abs(summary.remaining ?? 0))} over budget</span>
              ) : (
                `${money(summary.remaining ?? 0)} left · ${summary.pct}% used`
              )}
            </p>
          </>
        )}

        {!adding ? (
          <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
            + Log an expense
          </button>
        ) : (
          <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
            <div className="field">
              <label>What was it for?</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                placeholder="e.g. Lumber, concrete, permit"
              />
            </div>
            <div className="field">
              <label>Amount</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="0.00"
              />
            </div>
            <div className="field">
              <label>Receipt (optional)</label>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className="btn primary">
                {busy ? 'Saving…' : 'Log expense'}
              </button>
            </div>
          </form>
        )}

        {error && <p className="error-text">{error}</p>}

        {expenses.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {expenses.map((x) => (
              <div className="hist-row" key={x.id}>
                <span>
                  {x.photoId ? (
                    <a href={`/api/attachments/${x.photoId}`} target="_blank" rel="noopener" className="chip-link">
                      🧾 {x.label}
                    </a>
                  ) : (
                    x.label
                  )}{' '}
                  <span className="subtle">
                    · {x.userName} · {fmtDate(x.date)}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{money(x.amount)}</strong>
                  {(x.userId === currentUser.id || isManager) && (
                    <button className="icon-btn" title="Delete expense" onClick={() => onDelete(x.id)}>
                      🗑
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
