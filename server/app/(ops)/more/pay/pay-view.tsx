'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, Undo2, X } from 'lucide-react';
import type { PayPeriodView } from '@/lib/data/pay';
import type { RentRule } from '@/lib/domain/pay';
import { fmtDate } from '@/lib/domain/dates';
import { useMutation } from '@/lib/client/mutate';
import { useDialogs } from '@/components/ui/dialogs';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, ListRow, Select, StatusPill, Switch } from '@/components/ui';
import s from '../../farm/animals/animals.module.css';

const usd = (n: number) => `$${n.toFixed(2)}`;
const RULE_LABEL: Record<RentRule, string> = { none: 'All paid out', all: 'Toward rent first', fixed: 'Fixed amount toward rent' };

export function HoursToApprove({ logs }: { logs: { id: string; name: string; date: string; hours: number; note: string }[] }) {
  const router = useRouter();
  const m = useMutation();
  if (!logs.length) return null;
  async function decide(id: string, approve: boolean) {
    if (await m.run({ url: `/api/work-logs/${id}`, method: 'PATCH', body: { approve }, label: approve ? 'Approve hours' : 'Reject hours' })) router.refresh();
  }
  return (
    <Card title={`Hours to approve (${logs.length})`} flush>
      {logs.map((l) => (
        <div key={l.id} className={s.event}>
          <span className={s.eventMain}>
            <strong>{l.name} · {l.hours} h</strong>
            <small>{fmtDate(l.date)}{l.note ? ` · ${l.note}` : ''}</small>
          </span>
          <Button size="sm" icon={<Check />} disabled={m.busy} onClick={() => decide(l.id, true)}>Approve</Button>
          <IconButton label={`Reject ${l.hours} h from ${l.name}`} onClick={() => decide(l.id, false)}><X /></IconButton>
        </div>
      ))}
      {m.error && <Banner tone="danger">{m.error}</Banner>}
    </Card>
  );
}

export function PayPeriodCard({ view, today }: { view: PayPeriodView; today: string }) {
  const router = useRouter();
  const m = useMutation();
  const { confirm: askConfirm } = useDialogs();
  const [toRent, setToRent] = useState<Record<string, string>>(Object.fromEntries(view.lines.map((l) => [l.userId, l.toRent.toFixed(2)])));
  const [paying, setPaying] = useState<string | null>(null);
  const { period, run, lines } = view;
  const title = `${fmtDate(period.start)} – ${fmtDate(period.end)}`;
  const pending = lines.reduce((a, l) => a + l.pendingHours, 0);
  const total = lines.reduce((a, l) => a + l.gross, 0);

  async function approve() {
    const body = { periodStart: period.start, toRent: Object.fromEntries(lines.filter((l) => l.rentOwed > 0).map((l) => [l.userId, Number(toRent[l.userId]) || 0])) };
    if (!(await askConfirm(`Approve ${usd(total)} of pay for ${title}? The rent part is credited to people’s rent right away.`))) return;
    if (await m.run({ url: '/api/pay/runs', body, label: 'Approve pay' })) router.refresh();
  }
  async function reopen() {
    if (!run || !(await askConfirm('Reopen this period? Its pay and rent credits are removed, and rent they covered is open again.'))) return;
    if (await m.run({ url: `/api/pay/runs/${run.id}`, method: 'DELETE', label: 'Reopen pay' })) router.refresh();
  }

  if (!lines.length) {
    return (
      <Card title={title}>
        <EmptyState title={run ? 'Nothing was paid this period' : 'No one to pay yet'}>{run ? undefined : 'Add people and their hourly rate below.'}</EmptyState>
      </Card>
    );
  }
  return (
    <Card title={title} action={run ? <StatusPill tone="done">Approved</StatusPill> : period.end >= today ? <StatusPill tone="upcoming">In progress</StatusPill> : <StatusPill tone="today">Ready to approve</StatusPill>} flush>
      {!run && pending > 0 && <Banner tone="warn">{pending} typed-in hour{pending === 1 ? '' : 's'} still waiting for approval won’t be counted.</Banner>}
      {lines.map((l) => (
        <div key={l.userId} className={s.event}>
          <span className={s.eventMain}>
            <strong>{l.name} · {usd(l.gross)}</strong>
            <small>
              {l.timerHours + l.typedHours} h ({l.timerHours} from timers, {l.typedHours} typed in) × {usd(l.rate)}
              {run
                ? ` · ${usd(l.toRent)} toward rent · ${usd(l.paidOut)} to them${l.paidOn ? ` · paid ${fmtDate(l.paidOn)}${l.paidHow ? ` (${l.paidHow})` : ''}` : ''}`
                : l.rentOwed > 0 ? ` · owes ${usd(l.rentOwed)} rent · rule: ${RULE_LABEL[l.rule].toLowerCase()}` : ''}
            </small>
          </span>
          {!run && l.rentOwed > 0 && (
            <Field label="Toward rent" htmlFor={`tr-${l.userId}`}>
              <Input id={`tr-${l.userId}`} type="number" inputMode="decimal" min="0" max={Math.min(l.gross, l.rentOwed)} step="0.01" value={toRent[l.userId] ?? '0'} onChange={(e) => setToRent({ ...toRent, [l.userId]: e.target.value })} />
            </Field>
          )}
          {run && l.paidOut > 0 && !l.paidOn && <Button size="sm" variant="secondary" onClick={() => setPaying(l.id)}>Paid out</Button>}
        </div>
      ))}
      <div className={s.event}>
        <span className={s.eventMain}><strong>Total {usd(total)}</strong></span>
        {!run && <Button icon={<Check />} loading={m.busy} onClick={approve}>Approve pay</Button>}
        {run && !lines.some((l) => l.paidOn) && <Button variant="ghost" icon={<Undo2 />} disabled={m.busy} onClick={reopen}>Reopen</Button>}
      </div>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      <Dialog sheet open={!!paying} onClose={() => setPaying(null)} title="Paid out">
        {paying && <PaidOutForm lineId={paying} onDone={() => setPaying(null)} />}
      </Dialog>
    </Card>
  );
}

function PaidOutForm({ lineId, onDone }: { lineId: string; onDone: () => void }) {
  const router = useRouter();
  const m = useMutation();
  const [how, setHow] = useState('Cash');
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (await m.run({ url: `/api/pay/lines/${lineId}`, method: 'PATCH', body: { how }, label: 'Paid out' })) { onDone(); router.refresh(); }
  }
  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="How" htmlFor="po-how">
        <Select id="po-how" value={how} onChange={(e) => setHow(e.target.value)}>
          {['Cash', 'Check', 'Transfer', 'Other'].map((h) => <option key={h}>{h}</option>)}
        </Select>
      </Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      <Button type="submit" block loading={m.busy}>Mark paid today</Button>
    </form>
  );
}

type Setting = { userId: string; name: string; hourlyRate: number; rentRule: RentRule; rentFixed: number | null; active: boolean };

export function PayPeople({ settings, people }: { settings: Setting[]; people: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<Setting | null>(null);
  return (
    <Card title="People and rates" action={people.length ? <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setEditing({ userId: '', name: '', hourlyRate: 0, rentRule: 'none', rentFixed: null, active: true })}>Add</Button> : undefined} flush>
      {settings.length === 0 && <EmptyState title="Nobody is paid by the hour yet">Add the people you pay, with their hourly rate.</EmptyState>}
      {settings.map((x) => (
        <ListRow
          key={x.userId}
          title={`${x.name} · ${usd(x.hourlyRate)}/h`}
          meta={x.rentRule === 'fixed' ? `${usd(x.rentFixed ?? 0)} each period toward rent` : RULE_LABEL[x.rentRule]}
          trail={<>{!x.active && <StatusPill tone="neutral">Paused</StatusPill>}<IconButton label={`Edit ${x.name}`} onClick={() => setEditing(x)}><Pencil /></IconButton></>}
        />
      ))}
      <Dialog sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name || 'Add someone'}>
        {editing && <SettingForm setting={editing} people={people} onDone={() => setEditing(null)} />}
      </Dialog>
    </Card>
  );
}

function SettingForm({ setting, people, onDone }: { setting: Setting; people: { id: string; name: string }[]; onDone: () => void }) {
  const router = useRouter();
  const m = useMutation();
  const [userId, setUserId] = useState(setting.userId);
  const [rate, setRate] = useState(setting.hourlyRate ? String(setting.hourlyRate) : '');
  const [rule, setRule] = useState<RentRule>(setting.rentRule);
  const [fixed, setFixed] = useState(setting.rentFixed ? String(setting.rentFixed) : '');
  const [active, setActive] = useState(setting.active);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { hourlyRate: Number(rate), rentRule: rule, rentFixed: rule === 'fixed' ? Number(fixed) : null, active };
    if (await m.run({ url: `/api/pay/settings/${userId}`, method: 'PUT', body, label: 'Pay settings' })) { onDone(); router.refresh(); }
  }
  return (
    <form className={s.form} onSubmit={onSubmit}>
      {!setting.userId && (
        <Field label="Person" htmlFor="ps-who">
          <Select id="ps-who" value={userId} onChange={(e) => setUserId(e.target.value)} required>
            <option value="">Pick someone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Hourly rate ($)" htmlFor="ps-rate"><Input id="ps-rate" type="number" inputMode="decimal" min="0.01" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required /></Field>
      <Field label="Their pay and their rent" htmlFor="ps-rule" hint="Only applies if they rent from the farm. You can change the amount for any pay period before approving it.">
        <Select id="ps-rule" value={rule} onChange={(e) => setRule(e.target.value as RentRule)}>
          <option value="none">Pay it all out</option>
          <option value="all">Put it toward their rent until it’s covered, pay out the rest</option>
          <option value="fixed">A set amount each pay period toward rent</option>
        </Select>
      </Field>
      {rule === 'fixed' && <Field label="Toward rent each pay period ($)" htmlFor="ps-fixed"><Input id="ps-fixed" type="number" inputMode="decimal" min="0.01" step="0.01" value={fixed} onChange={(e) => setFixed(e.target.value)} required /></Field>}
      <Switch label="Being paid" hint="Turn off to leave them out of pay runs." checked={active} onChange={setActive} />
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      <Button type="submit" block loading={m.busy} disabled={!userId}>Save</Button>
    </form>
  );
}

export function PaySchedule({ anchor }: { anchor: string }) {
  const router = useRouter();
  const m = useMutation();
  const [date, setDate] = useState(anchor);
  return (
    <Card title="Pay schedule">
      <form className={s.form} onSubmit={async (e) => { e.preventDefault(); if (await m.run({ url: '/api/pay/anchor', body: { date }, label: 'Pay schedule' })) router.refresh(); }}>
        <Field label="Pay periods start on" htmlFor="pa-date" hint="Every two weeks from this day. Can’t change once pay has been approved.">
          <Input id="pa-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {m.error && <Banner tone="danger">{m.error}</Banner>}
        <div className={s.actions}><Button type="submit" size="sm" variant="secondary" loading={m.busy} disabled={date === anchor}>Save</Button></div>
      </form>
    </Card>
  );
}
