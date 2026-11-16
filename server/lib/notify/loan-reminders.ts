/**
 * Loan reminders, once a day: to the borrower three days before an
 * instalment and on the day; three days late, to the borrower and to whoever
 * handles the loan (the seller of a personal sale, else the farm's money
 * managers). Each one is sent once.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { loans } from '@/db/schema';
import { addDays, fmtDate, todayISO } from '@/lib/domain/dates';
import { loanReminderStage } from '@/lib/domain/loans';
import { getSetting, setSetting } from '@/lib/data/settings';
import { pushToPeople } from './events';

const KEY = 'loan-reminders-sent';

export async function runLoanReminders(today = todayISO()): Promise<{ sent: number }> {
  const active = await db.select({ id: loans.id }).from(loans).where(eq(loans.status, 'active')).limit(1);
  if (!active.length) return { sent: 0 };
  const { activeLoansForReminders, loanHandlers } = await import('@/lib/data/loans');
  const all = (await activeLoansForReminders(today)).filter((l) => l.borrowerId);
  const sent = (await getSetting<Record<string, string>>(KEY)) ?? {};
  const keep: Record<string, string> = {};
  for (const [k, d] of Object.entries(sent)) if (d >= addDays(today, -60)) keep[k] = d;

  let count = 0;
  for (const l of all) {
    const next = l.state.next;
    const stage = loanReminderStage(next, today);
    if (!next || !stage) continue;
    // A payment already marked and waiting to be confirmed covers it: no nagging.
    const waiting = l.pending.reduce((a, p) => a + p.amount, 0);
    if (waiting >= next.amount) continue;
    const key = `${l.id}|${next.date}|${stage}`;
    if (keep[key]) continue;
    keep[key] = today;
    const amount = `$${next.amount.toFixed(2)}`;
    const url = `/more/loans/${l.id}`;
    if (stage === 'soon') await pushToPeople([l.borrowerId!], { title: 'Loan payment coming up', body: `${amount} for ${l.item} is due ${fmtDate(next.date)}.`, url });
    else if (stage === 'due') await pushToPeople([l.borrowerId!], { title: 'Loan payment due today', body: `${amount} for ${l.item}. Tap "I paid" once it's done.`, url });
    else {
      await pushToPeople([l.borrowerId!], { title: 'Loan payment late', body: `${amount} for ${l.item} was due ${fmtDate(next.date)}.`, url });
      // Late notice to whoever handles it: the seller of a personal sale, else the farm's money managers.
      await pushToPeople((await loanHandlers(l)).filter((id) => id !== l.borrowerId), { title: 'Loan payment late', body: `${l.borrowerName}: ${amount} for ${l.item} was due ${fmtDate(next.date)}.`, url });
    }
    count++;
  }
  await setSetting(KEY, keep);
  return { sent: count };
}
