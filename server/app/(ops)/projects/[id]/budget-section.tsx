'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { fmtDate } from '@/lib/domain/dates';
import { uploadPhoto } from '@/lib/client/photo';
import type { ExpenseRow, BudgetSummary } from '@/lib/data/project-expenses';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { Banner, Button, Card, Field, IconButton, Input, Stack } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from './budget.module.css';

const money = (n: number) => `$${n.toFixed(2)}`;

/** What a project has cost so far, against its budget if one is set (shown with finance.view). */
export function BudgetSection({ projectId, expenses, summary, currentUser }: { projectId: string; expenses: ExpenseRow[]; summary: BudgetSummary; currentUser: SessionUser }) {
  const { confirm: askConfirm } = useDialogs();
  const router = useRouter();
  const isManager = can(currentUser, 'finance.manage');
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
      const res = await fetch(`/api/projects/${projectId}/expenses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label.trim(), amount: Number(amount), photoId }) });
      if (!res.ok) return setError((await res.json().catch(() => ({}))).error || 'Could not save the expense.');
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
    if (!(await askConfirm('Delete this expense?'))) return;
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error || 'Could not delete the expense.');
  }

  // The bar fills to the budget; going over pins it full and turns it red.
  const barPct = summary.pct == null ? 0 : Math.min(summary.pct, 100);

  return (
    <Card title={`Budget${expenses.length ? ` (${expenses.length})` : ''}`}>
      <Stack>
        {summary.budget == null ? (
          <p className={s.muted}>
            {summary.spent > 0 ? <><strong className={s.big}>{money(summary.spent)}</strong> spent so far.{isManager ? ' Set a budget when you edit the project to track against it.' : ''}</> : 'Nothing spent yet.'}
          </p>
        ) : (
          <div>
            <p className={s.total}><strong className={s.big}>{money(summary.spent)}</strong> of {money(summary.budget)}</p>
            <span className={s.bar}><span className={`${s.fill} ${summary.over ? s.over : ''}`} style={{ width: `${barPct}%` }} /></span>
            <p className={summary.over ? s.overText : s.muted}>
              {summary.over ? `${money(Math.abs(summary.remaining ?? 0))} over budget` : `${money(summary.remaining ?? 0)} left · ${summary.pct}% used`}
            </p>
          </div>
        )}

        {expenses.length > 0 && (
          <div className={s.list}>
            {expenses.map((x) => (
              <div className={s.row} key={x.id}>
                <span className={s.main}>
                  {x.photoId ? (
                    <a href={`/api/attachments/${x.photoId}`} target="_blank" rel="noopener" className={s.receipt}><Receipt aria-hidden /> {x.label}</a>
                  ) : (
                    x.label
                  )}
                  <span className={s.meta}>{x.userName} · {fmtDate(x.date)}</span>
                </span>
                <strong>{money(x.amount)}</strong>
                {(x.userId === currentUser.id || isManager) && <IconButton label="Delete expense" onClick={() => onDelete(x.id)}><Trash2 /></IconButton>}
              </div>
            ))}
          </div>
        )}

        {!adding ? (
          <div><Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setAdding(true)}>Log an expense</Button></div>
        ) : (
          <form onSubmit={onSubmit} className={s.form}>
            <Stack>
              <Field label="What was it for?" htmlFor="ex-label"><Input id="ex-label" value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="e.g. Lumber, concrete, permit" /></Field>
              <Field label="Amount ($)" htmlFor="ex-amount"><Input id="ex-amount" type="number" step="0.01" min="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
              <label className={s.file}>
                <Receipt aria-hidden />
                {file ? file.name : 'Add a receipt (optional)'}
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <div className={s.actions}>
                <Button type="submit" loading={busy}>Log expense</Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </Stack>
          </form>
        )}
        {error && <Banner tone="danger">{error}</Banner>}
      </Stack>
    </Card>
  );
}
