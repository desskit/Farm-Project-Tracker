import type { LoanView } from '@/lib/data/loans';
import { fmtDate } from '@/lib/domain/dates';
import { StatusPill } from '@/components/ui';

export const usd = (n: number) => `$${n.toFixed(2)}`;

/** One-line status for a loan in a list. */
export function loanPill(l: LoanView) {
  if (l.status === 'paid') return <StatusPill tone="done">Paid off</StatusPill>;
  if (l.pending.length) return <StatusPill tone="info">To confirm</StatusPill>;
  if (l.state.overdue > 0) return <StatusPill tone="overdue">Late</StatusPill>;
  return <StatusPill tone="upcoming">{usd(l.state.balance)} left</StatusPill>;
}

export function loanMeta(l: LoanView, showBorrower: boolean): string {
  const who = showBorrower ? `${l.borrowerName} · ` : '';
  if (l.status === 'paid') return `${who}${usd(l.principal)}, paid off ${l.paidOffOn ? fmtDate(l.paidOffOn) : ''}`;
  const next = l.state.next;
  return `${who}${usd(l.state.paid)} of ${usd(l.principal)} paid${next ? ` · next ${usd(next.amount)} ${fmtDate(next.date)}` : ''}`;
}
