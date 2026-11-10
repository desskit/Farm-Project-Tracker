import { notFound } from 'next/navigation';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getSessionUser } from '@/lib/auth/session';
import { listChores } from '@/lib/data/chores';
import { can } from '@/lib/domain/permissions';
import { addDays, fmtDate, parseISO, todayISO } from '@/lib/domain/dates';
import { describeSchedule } from '@/lib/domain/recurrence';
import { dueDatesBetween } from '@/lib/domain/review';
import { Screen } from '@/components/patterns/screen';
import { PrintButton } from '@/app/more/rent/print-button';
import p from '../print.module.css';

export const metadata = { title: 'Weekly chore sheet · Farm Project Tracker' };
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The week ahead on one sheet of paper, for the barn wall: a box on each day a chore is due. */
export default async function ChoreSheet() {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const chores = (await listChores(user))
    .map((c) => ({ c, due: new Set(dueDatesBetween(c.schedule, c.nextDue < today ? today : c.nextDue, today, days[6])) }))
    .filter((x) => x.due.size > 0)
    .sort((a, b) => a.c.name.localeCompare(b.c.name));
  const ids = [...new Set(chores.flatMap((x) => x.c.assigneeIds))];
  const names = new Map((ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : []).map((u) => [u.id, u.name.split(' ')[0]]));

  return (
    <Screen title="Weekly chore sheet" subtitle={`${fmtDate(days[0])} to ${fmtDate(days[6])}`} back="/more/export" actions={<PrintButton label="Print" />}>
      {chores.length === 0 ? <p className={p.note}>No chores are due in the next seven days.</p> : (
        <div className={p.scroll}>
          <table className={p.table}>
            <thead>
              <tr>
                <th>Chore</th><th>Who</th>
                {days.map((d) => <th key={d} className={p.day}>{DAY[parseISO(d).getDay()]}<br />{Number(d.slice(8))}</th>)}
              </tr>
            </thead>
            <tbody>
              {chores.map(({ c, due }) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong><br /><span className={p.note}>{describeSchedule(c.schedule)}</span></td>
                  <td>{c.assigneeIds.map((id) => names.get(id)).filter(Boolean).join(', ') || (c.open ? 'Anyone' : '')}</td>
                  {days.map((d) => <td key={d} className={`${p.day} ${due.has(d) ? '' : p.off}`}>{due.has(d) && <span className={p.box} />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={p.note}>Tick the box on paper, then mark it done in the app so the record is kept.</p>
    </Screen>
  );
}
