import { Camera, Flame, Trophy } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { leaderboard } from '@/lib/data/leaderboard';
import { monthLabel, currentMonthKey } from '@/lib/domain/dates';
import { Card, EmptyState } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { FilterChips } from '@/components/patterns/filter-chips';
import s from './leaderboard.module.css';

const MEDAL = ['', '🥇', '🥈', '🥉'];

export default async function LeaderboardPage({ searchParams }: { searchParams: { win?: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const win = searchParams.win === 'all' ? 'all' : 'month';
  const rows = await leaderboard(win);
  const anyPoints = rows.some((r) => r.points > 0);

  return (
    <Screen title="Leaderboard" subtitle="Points for work done" back="/more">
      <FilterChips
        label="Period"
        items={[
          { href: '/more/leaderboard?win=month', label: monthLabel(currentMonthKey()), on: win === 'month' },
          { href: '/more/leaderboard?win=all', label: 'All time', on: win === 'all' },
        ]}
      />
      {!anyPoints ? (
        <Card><EmptyState icon={<Trophy />} title={`No completed work yet${win === 'month' ? ' this month' : ''}`}>Get out there!</EmptyState></Card>
      ) : (
        <Card flush>
          {rows.map((r) => {
            const parts: string[] = [];
            if (r.chores) parts.push(`${r.chores} chore${r.chores === 1 ? '' : 's'}`);
            if (r.tasks) parts.push(`${r.tasks} task${r.tasks === 1 ? '' : 's'}`);
            if (r.services) parts.push(`${r.services} service${r.services === 1 ? '' : 's'}`);
            const me = r.userId === user.id;
            return (
              <div className={`${s.row} ${r.rank === 1 ? s.first : ''} ${me ? s.me : ''}`} key={r.userId}>
                <span className={s.rank}>{MEDAL[r.rank] ?? r.rank}</span>
                <span className={s.main}>
                  <strong>{r.name}{me && <span className={s.you}>you</span>}</strong>
                  <span className={s.meta}>
                    {parts.join(' · ') || 'nothing yet'}
                    {r.streak >= 2 && <span className={s.flag}><Flame aria-hidden /> {r.streak}-day streak</span>}
                    {r.verified > 0 && <span className={s.flag}><Camera aria-hidden /> {r.verified} verified</span>}
                  </span>
                </span>
                <span className={s.pts}>{r.points}<small>pts</small></span>
              </div>
            );
          })}
        </Card>
      )}
      <p className={s.note}>Points: chore +2 · task +5 · upkeep +4, plus a bonus for photo-verified work.</p>
    </Screen>
  );
}
