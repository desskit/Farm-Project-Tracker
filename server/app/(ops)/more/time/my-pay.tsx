'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import type { MyPay } from '@/lib/data/pay';
import { fmtDate } from '@/lib/domain/dates';
import { useMutation } from '@/lib/client/mutate';
import { useDialogs } from '@/components/ui/dialogs';
import { Banner, Button, Card, Field, IconButton, Input, StatusPill } from '@/components/ui';
import s from '../../farm/animals/animals.module.css';

const usd = (n: number) => `$${n.toFixed(2)}`;
const LOG_TONE = { pending: 'upcoming', approved: 'done', rejected: 'neutral' } as const;
const LOG_LABEL = { pending: 'Waiting', approved: 'Approved', rejected: 'Not approved' } as const;

/** Your hours this pay period, hours you typed in, and your pay (with what went toward rent). */
export function MyHoursPay({ data, today }: { data: MyPay; today: string }) {
  const router = useRouter();
  const m = useMutation();
  const { confirm: askConfirm } = useDialogs();
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const { thisPeriod: h, period } = data;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await m.run({ url: '/api/work-logs', body: { date, hours: Number(hours), note }, label: `${hours} h logged` })) {
      setHours('');
      setNote('');
      router.refresh();
    }
  }
  async function remove(id: string) {
    if (!(await askConfirm('Remove these hours?'))) return;
    if (await m.run({ url: `/api/work-logs/${id}`, method: 'DELETE', label: 'Remove hours' })) router.refresh();
  }

  return (
    <>
      <Card title={`This pay period (${fmtDate(period.start)} – ${fmtDate(period.end)})`}>
        <p className={s.muted}>
          {h.timer} h from timers · {h.typed} h typed in and approved{h.pending ? ` · ${h.pending} h waiting for approval` : ''}
          {data.setting ? ` · about ${usd((h.timer + h.typed) * data.setting.hourlyRate)} so far at ${usd(data.setting.hourlyRate)}/h` : ''}
        </p>
        {data.rentLeft > 0 && data.setting && data.setting.rentRule !== 'none' && (
          <p className={s.muted}>Rent still to pay: {usd(data.rentLeft)}. {data.setting.rentRule === 'all' ? 'Your pay goes toward it first.' : `${usd(data.setting.rentFixed ?? 0)} of each pay goes toward it.`}</p>
        )}
        <form className={s.form} onSubmit={add}>
          <div className={s.two}>
            <Field label="Day" htmlFor="wl-date"><Input id="wl-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            <Field label="Hours" htmlFor="wl-hours"><Input id="wl-hours" type="number" inputMode="decimal" min="0.25" max="24" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} required /></Field>
          </div>
          <Field label="What you did (optional)" htmlFor="wl-note"><Input id="wl-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Fencing on the north pasture" /></Field>
          {m.error && <Banner tone="danger">{m.error}</Banner>}
          {m.queued && <Banner tone="ok">Saved — it’ll sync when you’re back online.</Banner>}
          <Button type="submit" icon={<Plus />} loading={m.busy} disabled={!hours}>Log hours</Button>
          <p className={s.muted}>Use this for work you didn’t time. A manager approves it before it counts.</p>
        </form>
      </Card>

      {data.logs.length > 0 && (
        <Card title="Hours you typed in" flush>
          {data.logs.map((l) => (
            <div key={l.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{l.hours} h · {fmtDate(l.date)}</strong>
                {l.note && <small>{l.note}</small>}
              </span>
              <StatusPill tone={LOG_TONE[l.status]}>{LOG_LABEL[l.status]}</StatusPill>
              {l.status === 'pending' && <IconButton label="Remove these hours" onClick={() => remove(l.id)}><Trash2 /></IconButton>}
            </div>
          ))}
        </Card>
      )}

      {data.lines.length > 0 && (
        <Card title="Your pay" flush>
          {data.lines.map((l) => (
            <div key={l.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{usd(l.gross)} · {fmtDate(l.periodStart)} – {fmtDate(l.periodEnd)}</strong>
                <small>
                  {l.timerHours + l.typedHours} h at {usd(l.rate)}
                  {l.toRent > 0 ? ` · ${usd(l.toRent)} toward rent` : ''} · {usd(l.paidOut)} to you
                </small>
              </span>
              {l.paidOut > 0 && <StatusPill tone={l.paidOn ? 'done' : 'upcoming'}>{l.paidOn ? `Paid ${fmtDate(l.paidOn)}` : 'Not paid yet'}</StatusPill>}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
