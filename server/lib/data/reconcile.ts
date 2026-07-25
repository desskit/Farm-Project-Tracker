/**
 * Nightly due-date reconciliation for recurring chores.
 *
 * A chore's next_due only moves when someone completes it. For a chore set to
 * "skip to next occurrence if missed", that means an uncompleted one sits in
 * the past and grows more overdue every day — a daily chore missed last month
 * reads as 30 days late, which buries the genuinely urgent work.
 *
 * This rolls those forward to their next occurrence on or after today, which is
 * exactly what "skip to next" asks for. Chores set to "must catch up" are left
 * alone on purpose — staying overdue is the point. One-time chores never roll.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { chores } from '@/db/schema';
import { nextOccurrenceAfter } from '@/lib/domain/recurrence';
import { todayISO } from '@/lib/domain/dates';
import { publishChange } from '@/lib/realtime/bus';

export async function reconcileChoreDueDates(today = todayISO()): Promise<{ rolled: number }> {
  const rows = await db.select().from(chores).where(eq(chores.done, false));
  let rolled = 0;

  for (const c of rows) {
    if (c.schedule.type === 'once') continue; // one-time chores don't recur
    if (c.catchUp === 'mustCatchUp') continue; // meant to stay overdue
    if (c.nextDue >= today) continue; // not overdue

    // Walk occurrences forward until we land on or after today.
    let d = c.nextDue;
    let guard = 0;
    while (d < today && guard < 500) {
      const next = nextOccurrenceAfter(c.schedule, d);
      if (next <= d) break; // malformed schedule — leave it alone
      d = next;
      guard++;
    }

    if (d !== c.nextDue && d >= today) {
      await db.update(chores).set({ nextDue: d }).where(eq(chores.id, c.id));
      rolled++;
    }
  }

  if (rolled) publishChange('chore');
  return { rolled };
}
