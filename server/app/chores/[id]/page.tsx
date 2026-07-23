import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { choreById, choreCompletionsFor, choreStreak } from '@/lib/data/chores';
import { activeTimerFor, totalSeconds } from '@/lib/data/timers';
import { listUsers } from '@/lib/data/users';
import { describeSchedule } from '@/lib/domain/recurrence';
import { bucketForDate } from '@/lib/domain/dashboard';
import { relativeLabel } from '@/lib/domain/dates';
import { ChoreDetail } from './chore-detail';

export default async function ChoreDetailPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const chore = await choreById(params.id);
  if (!chore) notFound();

  const [completions, streak, people, timer, timerTotal] = await Promise.all([
    choreCompletionsFor(params.id),
    choreStreak(params.id),
    listUsers(),
    activeTimerFor(user.id, 'chore', params.id),
    totalSeconds('chore', params.id),
  ]);

  return (
    <main className="view">
      <ChoreDetail
        chore={chore}
        completions={completions}
        streak={streak}
        people={people}
        currentUser={user}
        scheduleLabel={describeSchedule(chore.schedule)}
        bucket={bucketForDate(chore.nextDue)}
        dueLabel={relativeLabel(chore.nextDue)}
        timerRunning={!!timer}
        timerStartedAt={timer?.start ?? null}
        timerTotalSec={timerTotal}
      />
    </main>
  );
}
