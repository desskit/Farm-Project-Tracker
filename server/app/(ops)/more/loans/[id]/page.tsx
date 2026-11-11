import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { loanForViewer } from '@/lib/data/loans';
import { DataError } from '@/lib/data/errors';
import { can } from '@/lib/domain/permissions';
import { EVERY_LABEL } from '@/lib/domain/loans';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { Banner, Card, ListRow, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles, type Tile } from '@/components/patterns/stat-tiles';
import { usd } from '../loan-ui';
import { CancelLoan, PayForm, PaymentActions } from './loan-client';
import s from '../../../farm/animals/animals.module.css';

export const metadata = { title: 'Loan · Farm Project Tracker' };

const STATE: Record<string, { tone: 'done' | 'overdue' | 'today' | 'info' | 'neutral'; label: string }> = {
  paid: { tone: 'done', label: 'Paid' }, part: { tone: 'info', label: 'Part paid' }, late: { tone: 'overdue', label: 'Late' },
  due: { tone: 'today', label: 'Today' }, upcoming: { tone: 'neutral', label: 'Coming' },
};

export default async function LoanPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const today = todayISO();
  const l = await loanForViewer(user, params.id, today).catch((e) => {
    if (e instanceof DataError && e.status === 404) notFound();
    throw e;
  });
  const mine = l.borrowerId === user.id;
  const manage = can(user, 'finance.manage');
  const waiting = l.pending.reduce((a, p) => a + p.amount, 0);
  const room = Math.round((l.state.balance - waiting) * 100) / 100;
  const st = l.state;

  const tiles: Tile[] = [
    { label: 'Left to pay', value: usd(st.balance) },
    { label: 'Paid', value: `${usd(st.paid)} of ${usd(l.principal)}` },
  ];
  if (st.next) tiles.push({ label: st.overdue > 0 ? 'Was due' : 'Next payment', value: `${usd(st.overdue > 0 ? st.overdue : st.next.amount)} · ${fmtDate(st.next.date)}`, tone: st.overdue > 0 ? 'bad' : undefined });

  return (
    <Screen title={l.item} subtitle={`${mine ? 'Your loan' : l.borrowerName} · bought ${l.saleDate ? fmtDate(l.saleDate) : ''} · ${usd(l.instalment)} ${EVERY_LABEL[l.every]}`} back="/more/loans">
      {l.status === 'paid' && <Banner tone="ok" title="Paid off">{l.paidOffOn ? `Finished ${fmtDate(l.paidOffOn)}.` : 'All paid.'}</Banner>}
      {l.status === 'active' && st.overdue > 0 && (
        <Banner tone="danger" title="Behind">{usd(st.overdue)} was due by {fmtDate(st.next!.date)} ({st.daysLate} day{st.daysLate === 1 ? '' : 's'} ago).</Banner>
      )}
      <StatTiles tiles={tiles} />

      {l.status === 'active' && (mine || manage) && room > 0 && (
        <Card title={mine ? 'Made a payment?' : 'Took a payment?'}>
          <PayForm loanId={l.id} suggested={Math.min(room, st.overdue > 0 ? st.overdue : st.next?.amount ?? room)} max={room} today={today} manager={manage && !mine} />
        </Card>
      )}

      {l.pending.length > 0 && (
        <Card title="Waiting to be confirmed" flush>
          {l.pending.map((p) => (
            <div key={p.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{usd(p.amount)}</strong>
                <small>Paid {fmtDate(p.date)}{p.markedByName ? ` · marked by ${p.markedByName}` : ''}{p.note ? ` · ${p.note}` : ''}</small>
              </span>
              <PaymentActions
                paymentId={p.id}
                canConfirm={manage}
                canRemove={manage || p.markedBy === user.id}
                removeLabel={manage && p.markedBy !== user.id ? 'Turn down this payment' : 'Withdraw this payment'}
              />
            </div>
          ))}
        </Card>
      )}

      <Card title="Payment plan" flush>
        {st.schedule.map((i) => (
          <ListRow key={i.n} title={`${usd(i.amount)} · ${fmtDate(i.date)}`} meta={`Payment ${i.n} of ${st.schedule.length}`} trail={<StatusPill tone={STATE[i.state].tone}>{STATE[i.state].label}</StatusPill>} />
        ))}
      </Card>

      {l.payments.length > 0 && (
        <Card title="Payments received" flush>
          {l.payments.map((p) => (
            <div key={p.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{usd(p.amount)}</strong>
                <small>{fmtDate(p.date)}{p.note ? ` · ${p.note}` : ''}</small>
              </span>
              <StatusPill tone="done">Confirmed</StatusPill>
              {manage && <PaymentActions paymentId={p.id} canRemove removeLabel="Remove this payment (entered by mistake)" />}
            </div>
          ))}
        </Card>
      )}

      {manage && l.payments.length === 0 && l.status === 'active' && <CancelLoan loanId={l.id} />}
    </Screen>
  );
}
