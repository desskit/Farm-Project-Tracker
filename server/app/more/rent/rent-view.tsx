'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Check, RotateCcw, Wallet } from 'lucide-react';
import type { RentChargeRow, RentAssignmentRow, RentSummary } from '@/lib/data/rent';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import { fmtDate } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { CHARGE_KIND_LABEL } from '@/lib/domain/rentals';
import { Banner, Button, Card, EmptyState, Field, Input, Select, Stack, StatusPill } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from './rent.module.css';

const money = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;

export function RentView({
  charges, summary, people, assignments, currentUser,
}: {
  charges: RentChargeRow[];
  summary: RentSummary | null;
  people: PersonRow[];
  assignments: Record<string, RentAssignmentRow | null>;
  currentUser: SessionUser;
}) {
  const { prompt: askPrompt } = useDialogs();
  const router = useRouter();
  const seesAll = can(currentUser, 'finance.view');
  // Without finance.view the list only holds this person's own charges (theirs or their lease's).
  const isMine = (c: RentChargeRow) => !seesAll || c.userId === currentUser.id;
  const managesRent = can(currentUser, 'finance.manage');
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, url: string, body?: unknown) {
    setBusy(key);
    setError(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || 'Something went wrong.');
    router.refresh();
  }

  async function onMarkPaid(c: RentChargeRow) {
    const note = await askPrompt('How did you pay? (cash, check, app… optional)', c.note || '');
    if (note !== null) await act('mark-' + c.id, `/api/rent/${c.id}/mark`, { note });
  }

  return (
    <Stack gap={16}>
      {seesAll && summary && summary.count > 0 && (
        <div className={s.tiles}>
          <div className={s.tile}><span className={s.val}>{money(summary.collected)}</span><span className={s.lbl}>collected</span></div>
          <div className={s.tile}><span className={s.val}>{money(summary.due)}</span><span className={s.lbl}>due</span></div>
          <div className={`${s.tile} ${summary.unpaid ? s.warn : ''}`}><span className={s.val}>{summary.unpaid}</span><span className={s.lbl}>unpaid</span></div>
          <div className={`${s.tile} ${summary.marked ? s.todo : ''}`}><span className={s.val}>{summary.marked}</span><span className={s.lbl}>to confirm</span></div>
        </div>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <Card title={seesAll ? 'This month' : 'Your rent'} flush>
        {!charges.length ? (
          <EmptyState icon={<Wallet />} title={seesAll ? 'No rent charges this month' : 'No rent this month'}>
            {seesAll ? (managesRent ? 'Set up rent for someone below.' : undefined) : 'If you think this is wrong, ask the farm.'}
          </EmptyState>
        ) : (
          charges.map((c) => (
            <div className={s.charge} key={c.id}>
              <div className={s.chargeMain}>
                <div className={s.chargeTitle}>
                  {seesAll && <span>{nameById.get(c.userId) ?? 'Someone'}</span>}
                  <strong className={s.amount}>{money(c.amount)}</strong>
                </div>
                <div className={s.chips}>
                  {c.kind !== 'rent' && <StatusPill tone="neutral">{c.label || CHARGE_KIND_LABEL[c.kind]}</StatusPill>}
                  {c.status === 'verified' ? (
                    <StatusPill tone="done">Paid{c.verifiedAt ? ` · confirmed ${fmtDate(c.verifiedAt)}` : ''}</StatusPill>
                  ) : c.status === 'marked' ? (
                    <StatusPill tone="info">Marked paid{c.markedAt ? ` ${fmtDate(c.markedAt)}` : ''} · waiting to be confirmed</StatusPill>
                  ) : (
                    <StatusPill tone="overdue">Unpaid · due {fmtDate(c.dueDate)}</StatusPill>
                  )}
                  {c.status === 'unpaid' && c.reminderSentOn && (
                    <span className={s.muted}><BellRing aria-hidden /> reminded {fmtDate(c.reminderSentOn)}</span>
                  )}
                </div>
                {c.note && <p className={s.note}>“{c.note}”</p>}
              </div>
              <div className={s.actions}>
                {c.status !== 'verified' && (isMine(c) || managesRent) && c.status !== 'marked' && (
                  <Button size="sm" variant={isMine(c) ? 'primary' : 'secondary'} loading={busy === 'mark-' + c.id} onClick={() => onMarkPaid(c)}>
                    {isMine(c) ? 'I’ve paid' : 'Mark paid'}
                  </Button>
                )}
                {managesRent && c.status !== 'verified' && (
                  <Button size="sm" icon={<Check />} loading={busy === 'verify-' + c.id} onClick={() => act('verify-' + c.id, `/api/rent/${c.id}/verify`)}>
                    Confirm received
                  </Button>
                )}
                {managesRent && c.status !== 'unpaid' && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw />} loading={busy === 'reopen-' + c.id} onClick={() => act('reopen-' + c.id, `/api/rent/${c.id}/reopen`)}>
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      {managesRent && <AssignForm people={people} assignments={assignments} onError={setError} />}
    </Stack>
  );
}

function AssignForm({ people, assignments, onError }: { people: PersonRow[]; assignments: Record<string, RentAssignmentRow | null>; onError: (m: string | null) => void }) {
  const { confirm: askConfirm } = useDialogs();
  const router = useRouter();
  // The dropdown only offers active people, so every default and fallback has
  // to come from this list too — otherwise the <select> can show one name
  // while state holds another, and rent gets saved against the wrong person.
  const activePeople = people.filter((p) => p.active);
  const [userId, setUserId] = useState(activePeople[0]?.id ?? '');
  const firstA = assignments[activePeople[0]?.id ?? ''];
  const [amount, setAmount] = useState(firstA ? String(firstA.amount) : '');
  const [dueDay, setDueDay] = useState(firstA ? String(firstA.dueDay) : '1');
  const [busy, setBusy] = useState(false);
  // What the <select> is actually showing (falls back if someone was deactivated meanwhile).
  const selectedId = activePeople.some((p) => p.id === userId) ? userId : (activePeople[0]?.id ?? '');
  const current = assignments[selectedId];

  function pick(id: string) {
    setUserId(id);
    const a = assignments[id];
    setAmount(a ? String(a.amount) : '');
    setDueDay(a ? String(a.dueDay) : '1');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const res = await fetch('/api/rent/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedId, amount: Number(amount), dueDay: Number(dueDay) }),
    });
    setBusy(false);
    if (!res.ok) return onError((await res.json().catch(() => ({}))).error || 'Something went wrong.');
    router.refresh();
  }

  async function stop() {
    if (!(await askConfirm(`Stop charging ${people.find((p) => p.id === selectedId)?.name ?? 'this person'} rent?`))) return;
    setBusy(true);
    const res = await fetch('/api/rent/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: selectedId }) });
    setBusy(false);
    if (res.ok) router.refresh();
    else onError((await res.json().catch(() => ({}))).error || 'Could not stop rent.');
  }

  return (
    <Card title="Set up or change rent">
      <form onSubmit={submit}>
        <Stack>
          <Field label="Person" htmlFor="rent-person" hint={current ? `Currently ${money(current.amount)} due on day ${current.dueDay}.` : 'No rent set up for them yet.'}>
            <Select id="rent-person" value={selectedId} onChange={(e) => pick(e.target.value)}>
              {activePeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <div className={s.two}>
            <Field label="Monthly amount ($)" htmlFor="rent-amount">
              <Input id="rent-amount" type="number" min={1} step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
            <Field label="Due day (1–28)" htmlFor="rent-day">
              <Input id="rent-day" type="number" min={1} max={28} inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </Field>
          </div>
          <div className={s.row}>
            <Button type="submit" loading={busy}>Save</Button>
            {current && <Button variant="ghost" disabled={busy} onClick={stop}>Stop rent</Button>}
          </div>
        </Stack>
      </form>
    </Card>
  );
}
