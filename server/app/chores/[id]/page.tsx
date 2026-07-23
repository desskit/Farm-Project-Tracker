import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import { choreById, choreCompletionsFor, choreStreak } from '@/lib/data/chores';
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

  const [completions, streak, people] = await Promise.all([
    choreCompletionsFor(params.id),
    choreStreak(params.id),
    listUsers(),
  ]);

  return (
    <main style={mainStyle}>
      <ChoreDetail
        chore={chore}
        completions={completions}
        streak={streak}
        people={people}
        currentUser={user}
        scheduleLabel={describeSchedule(chore.schedule)}
        bucket={bucketForDate(chore.nextDue)}
        dueLabel={relativeLabel(chore.nextDue)}
      />
    </main>
  );
}

const mainStyle: CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '24px 20px 48px' };
