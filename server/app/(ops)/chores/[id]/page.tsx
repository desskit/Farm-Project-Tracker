import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { choreForViewer, choreCompletionsFor, choreStreak, choreSuppliesFor } from '@/lib/data/chores';
import { listInventory } from '@/lib/data/inventory';
import { can } from '@/lib/domain/permissions';
import { activeTimerFor, totalSeconds } from '@/lib/data/timers';
import { listUsers } from '@/lib/data/users';
import { describeSchedule, isActiveSeason } from '@/lib/domain/recurrence';
import { bucketForDate } from '@/lib/domain/dashboard';
import { relativeLabel, todayISO } from '@/lib/domain/dates';
import { ChoreDetail } from './chore-detail';
import s from './chore-page.module.css';

export default async function ChoreDetailPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const chore = await choreForViewer(user, params.id);
  if (!chore) notFound();

  const [completions, streak, people, timer, timerTotal, supplies, inv] = await Promise.all([
    choreCompletionsFor(params.id),
    choreStreak(params.id),
    listUsers(),
    activeTimerFor(user.id, 'chore', params.id),
    totalSeconds('chore', params.id),
    choreSuppliesFor(params.id),
    can(user, 'work.manage') ? listInventory() : Promise.resolve([]),
  ]);

  return (
    <main className={s.wrap}>
      <ChoreDetail
        chore={chore}
        completions={completions}
        streak={streak}
        people={people}
        currentUser={user}
        scheduleLabel={describeSchedule(chore.schedule)}
        outOfSeason={!!chore.schedule.season && !isActiveSeason(chore.schedule.season, todayISO())}
        bucket={bucketForDate(chore.nextDue)}
        dueLabel={relativeLabel(chore.nextDue)}
        timerRunning={!!timer}
        timerStartedAt={timer?.start ?? null}
        timerTotalSec={timerTotal}
        supplies={supplies}
        supplyOptions={inv.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
      />
    </main>
  );
}
