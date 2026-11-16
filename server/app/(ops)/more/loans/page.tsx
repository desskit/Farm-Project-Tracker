import { notFound } from 'next/navigation';
import { HandCoins } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { handlesLoan, listLoans } from '@/lib/data/loans';
import { can } from '@/lib/domain/permissions';
import { fmtDate } from '@/lib/domain/dates';
import { Card, EmptyState, ListRow } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles, type Tile } from '@/components/patterns/stat-tiles';
import { PaymentActions } from './[id]/loan-client';
import { loanMeta, loanPill, usd } from './loan-ui';
import s from '../../farm/animals/animals.module.css';

export const metadata = { title: 'Loans · Farm Project Tracker' };

/** Sales paid back over time: everyone's for people who see the farm's money, otherwise your own. */
export default async function LoansPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const all = await listLoans(user);
  const seesAll = can(user, 'finance.view');
  const manage = can(user, 'finance.manage');
  const active = all.filter((l) => l.status === 'active');
  const done = all.filter((l) => l.status === 'paid');
  // Payments waiting on you: farm loans if you handle the farm's money, and your own personal sales.
  const toConfirm = active.filter((l) => handlesLoan(user, l)).flatMap((l) => l.pending.map((p) => ({ p, l })));
  const handlesAny = manage || all.some((l) => l.personal && l.sellerId === user.id);

  const tiles: Tile[] = [
    { label: 'You owe', value: usd(active.filter((l) => l.borrowerId === user.id).reduce((a, l) => a + l.state.balance, 0)) },
    { label: seesAll ? 'Owed to the farm and you' : 'Owed to you', value: usd(active.filter((l) => l.borrowerId !== user.id).reduce((a, l) => a + l.state.balance, 0)) },
    { label: 'Late', value: usd(active.reduce((a, l) => a + l.state.overdue, 0)), tone: active.some((l) => l.state.overdue > 0) ? 'bad' : undefined },
  ];
  if (handlesAny) tiles.push({ label: 'To confirm', value: toConfirm.length, tone: toConfirm.length ? 'warn' : undefined });

  return (
    <Screen title="Loans" subtitle="Things sold to people on the farm, paid back over time" back="/more">
      {all.length > 0 && <StatTiles tiles={tiles} />}

      {toConfirm.length > 0 && (
        <Card title="Payments to confirm" flush>
          {toConfirm.map(({ p, l }) => (
            <div key={p.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{usd(p.amount)} · {l.borrowerName}</strong>
                <small>{l.item} · paid {fmtDate(p.date)}{p.note ? ` · ${p.note}` : ''}</small>
              </span>
              <PaymentActions paymentId={p.id} canConfirm />
            </div>
          ))}
        </Card>
      )}

      <Card title={active.length ? 'Being paid back' : undefined} flush>
        {active.length === 0 ? (
          <EmptyState icon={<HandCoins />} title="No loans running">
            Record a sale and turn on “Pay over time” to sell to someone on the farm on a payment plan.
          </EmptyState>
        ) : (
          active.map((l) => <ListRow key={l.id} href={`/more/loans/${l.id}`} lead={<HandCoins />} title={l.item} meta={loanMeta(l, user.id)} trail={loanPill(l)} />)
        )}
      </Card>

      {done.length > 0 && (
        <Card title="Paid off" flush>
          {done.map((l) => <ListRow key={l.id} href={`/more/loans/${l.id}`} lead={<HandCoins />} title={l.item} meta={loanMeta(l, user.id)} trail={loanPill(l)} />)}
        </Card>
      )}
    </Screen>
  );
}
