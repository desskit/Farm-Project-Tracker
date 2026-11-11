/**
 * Loan reminders, once a day: to the borrower three days before an
 * instalment and on the day; three days late, to the borrower and to the
 * people who handle the farm's money. Each one is sent once.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { loans } from '@/db/schema';
import { addDays, fmtDate, todayISO } from '@/lib/domain/dates';
import { loanReminderStage } from '@/lib/domain/loans';
import { getSetting, setSetting } from '@/lib/data/settings';
import { recipientsWith } from '@/lib/data/recipients';
import type { SessionUser } from '@/lib/auth/session';
import { pushToPeople } from './events';

const KEY = 'loan-reminders-sent';
// Reads every loan regardless of who is asking.
const SYSTEM: SessionUser = { id: 'system', name: 'Farm', email: '', role: 'admin' };

export async function runLoanReminders(today = todayISO()): Promise<{ sent: number }> {
  const active = await db.select({ id: loans.id }).from(loans).where(eq(loans.status, 'active')).limit(1);
  if (!active.length) return { sent: 0 };
  const { listLoans } = await import('@/lib/data/loans');
  const all = (await listLoans(SYSTEM, today)).filter((l) => l.status === 'active' && l.borrowerId);
  const sent = (await getSetting<Record<string, string>>(KEY)) ?? {};
  const keep: Record<string, string> = {};
  for (const [k, d] of Object.entries(sent)) if (d >= addDays(today, -60)) keep[k] = d;
  const managers = (await recipientsWith('finance.manage')).map((m) => m.id);

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
      await pushToPeople(managers.filter((id) => id !== l.borrowerId), { title: 'Loan payment late', body: `${l.borrowerName}: ${amount} for ${l.item} was due ${fmtDate(next.date)}.`, url });
    }
    count++;
  }
  await setSetting(KEY, keep);
  return { sent: count };
}
