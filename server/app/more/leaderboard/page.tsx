import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { leaderboard } from '@/lib/data/leaderboard';
import { monthLabel, currentMonthKey } from '@/lib/domain/dates';

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

export default async function LeaderboardPage({ searchParams }: { searchParams: { win?: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const win = searchParams.win === 'all' ? 'all' : 'month';
  const rows = await leaderboard(win);
  const top = rows[0];
  const anyPoints = rows.some((r) => r.points > 0);

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Leaderboard</h1>
      </div>
      <div className="segmented" style={{ marginBottom: 12 }}>
        <Link href="/more/leaderboard?win=month" className={win === 'month' ? 'active' : ''}>
          {monthLabel(currentMonthKey())}
        </Link>
        <Link href="/more/leaderboard?win=all" className={win === 'all' ? 'active' : ''}>
          All time
        </Link>
      </div>

      {!anyPoints ? (
        <div className="empty">No completed work yet{win === 'month' ? ' this month' : ''}. Get out there! 🌱</div>
      ) : (
        <>
          {top && top.points > 0 && (
            <div className="champ">
              <div className="champ-emoji">🥇</div>
              <div>
                <div className="champ-name">
                  {top.name}
                  {top.userId === user.id ? ' (you)' : ''}
                </div>
                <div className="champ-sub">
                  {top.points} pts · {top.total} job{top.total === 1 ? '' : 's'} done
                  {top.streak >= 2 ? ` · 🔥 ${top.streak}-day streak` : ''}
                </div>
              </div>
            </div>
          )}

          {rows.map((r) => {
            const parts: string[] = [];
            if (r.chores) parts.push(`${r.chores} chore${r.chores === 1 ? '' : 's'}`);
            if (r.tasks) parts.push(`${r.tasks} task${r.tasks === 1 ? '' : 's'}`);
            if (r.services) parts.push(`${r.services} service${r.services === 1 ? '' : 's'}`);
            const breakdown = parts.length ? parts.join(' · ') : 'no completions yet';
            const isMe = r.userId === user.id;
            return (
              <div className={`card lb-row${r.rank === 1 ? ' lb-first' : ''}${isMe ? ' lb-me' : ''}`} key={r.userId}>
                <div className="lb-rank">{medal(r.rank)}</div>
                <div className="item-main">
                  <p className="item-title">
                    {r.name}
                    {isMe ? ' ' : ''}
                    {isMe && <span className="chip">you</span>}
                  </p>
                  <p className="item-sub">{breakdown}</p>
                  {(r.streak >= 2 || r.verified > 0) && (
                    <div className="item-badges">
                      {r.streak >= 2 && <span className="badge upcoming">🔥 {r.streak}-day streak</span>}
                      {r.verified > 0 && <span className="badge neutral">📷 {r.verified} verified</span>}
                    </div>
                  )}
                </div>
                <div className="lb-pts">
                  {r.points}
                  <span>pts</span>
                </div>
              </div>
            );
          })}
          <p className="subtle" style={{ marginTop: 10 }}>
            Points: chore +2 · task +5 · maintenance +4, plus a bonus for photo-verified work. 📷
          </p>
        </>
      )}
    </main>
  );
}
