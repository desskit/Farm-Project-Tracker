import { HandCoins } from 'lucide-react';
import type { SessionUser } from '@/lib/auth/session';
import { handlesLoan, listLoans } from '@/lib/data/loans';
import { addDays, fmtDate, todayISO } from '@/lib/domain/dates';
import { Card, ListRow, StatusPill } from '@/components/ui';

/**
 * On Today: for a borrower, a payment that's late or due within the week;
 * for someone who sold something personally, payments waiting for them to
 * confirm. (The farm's own loans have their tile for money managers.)
 */
export async function MyLoans({ user }: { user: SessionUser }) {
  const today = todayISO();
  const soon = addDays(today, 7);
  const all = await listLoans(user, today);
  const due = all.filter((l) => l.borrowerId === user.id && l.status === 'active' && l.state.next && l.state.next.date <= soon);
  const toConfirm = all.filter((l) => l.personal && handlesLoan(user, l)).flatMap((l) => l.pending.map((p) => ({ p, l })));
  if (!due.length && !toConfirm.length) return null;
  return (
    <Card title="Your loans" flush>
      {toConfirm.map(({ p, l }) => (
        <ListRow key={p.id} href={`/more/loans/${l.id}`} lead={<HandCoins />} wrap title={`${l.borrowerName} paid $${p.amount.toFixed(2)} for ${l.item}`} meta={`On ${fmtDate(p.date)} · confirm it if you got it`} trail={<StatusPill tone="today">Confirm</StatusPill>} />
      ))}
      {due.map((l) => {
        const late = l.state.overdue > 0;
        const waiting = l.pending.length > 0;
        return (
          <ListRow
            key={l.id}
            href={`/more/loans/${l.id}`}
            lead={<HandCoins />}
            wrap
            title={`$${(late ? l.state.overdue : l.state.next!.amount).toFixed(2)} for ${l.item}`}
            meta={`${late ? `Was due ${fmtDate(l.state.next!.date)}` : `Due ${fmtDate(l.state.next!.date)}`} · $${l.state.balance.toFixed(2)} left`}
            trail={waiting ? <StatusPill tone="info">Waiting</StatusPill> : late ? <StatusPill tone="overdue">Late</StatusPill> : l.state.next!.date === today ? <StatusPill tone="today">Today</StatusPill> : undefined}
          />
        );
      })}
    </Card>
  );
}
