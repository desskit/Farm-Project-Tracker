import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { choreForViewer, choreCompletionsFor, choreStreak, choreSuppliesFor } from '@/lib/data/chores';
import { listInventory } from '@/lib/data/inventory';
import { listNotes } from '@/lib/data/notes';
import { guidesFor, listGuides } from '@/lib/data/guides';
import { GuidesCard } from '@/app/_components/guides-card';
import { NotesSection } from '@/app/_components/notes-section';
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

  const [completions, streak, people, timer, timerTotal, supplies, inv, notes, guides, allGuides] = await Promise.all([
    choreCompletionsFor(params.id),
    choreStreak(params.id),
    listUsers(),
    activeTimerFor(user.id, 'chore', params.id),
    totalSeconds('chore', params.id),
    choreSuppliesFor(params.id),
    can(user, 'work.manage') ? listInventory() : Promise.resolve([]),
    listNotes('chore', params.id),
    guidesFor('chore', params.id),
    can(user, 'work.manage') ? listGuides() : Promise.resolve([]),
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
      <GuidesCard parentType="chore" parentId={chore.id} linked={guides} all={allGuides.map((g) => ({ id: g.id, title: g.title, summary: g.summary }))} canManage={can(user, 'work.manage')} />
      <NotesSection parentType="chore" parentId={chore.id} notes={notes} currentUser={user} mentionNames={people.filter((p) => p.active).map((p) => p.name)} />
    </main>
  );
}
