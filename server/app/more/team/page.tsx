import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { teamOverview } from '@/lib/data/team';

export default async function TeamPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isManager = user.role === 'manager' || user.role === 'admin';

  if (!isManager) {
    return (
      <main className="view">
        <div className="sub-head">
          <Link href="/more" className="btn small ghost back-btn">
            ‹ More
          </Link>
          <h1>Team</h1>
        </div>
        <div className="empty">Only managers and admins can see the team overview.</div>
      </main>
    );
  }

  const { tiles, people } = await teamOverview();

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Team</h1>
      </div>

      <div className="tiles">
        <div className={`tile ${tiles.overdue ? 'bad' : 'good'}`}>
          <div className="t-num">{tiles.overdue}</div>
          <div className="t-lbl">Overdue</div>
        </div>
        <div className={`tile ${tiles.today ? 'warn' : 'good'}`}>
          <div className="t-num">{tiles.today}</div>
          <div className="t-lbl">Due today</div>
        </div>
        <div className="tile">
          <div className="t-num">{tiles.upcoming}</div>
          <div className="t-lbl">Next 7 days</div>
        </div>
      </div>

      <div className="section-title">People</div>
      {people.map((w) => {
        const chips: React.ReactNode[] = [];
        if (w.choresOverdue || w.tasksOverdue) chips.push(<span className="badge overdue" key="o">{w.choresOverdue + w.tasksOverdue} overdue</span>);
        if (w.choresToday) chips.push(<span className="badge today" key="t">{w.choresToday} due today</span>);
        if (w.tasksOpen) chips.push(<span className="badge neutral" key="k">{w.tasksOpen} open task{w.tasksOpen === 1 ? '' : 's'}</span>);
        return (
          <div className="card" key={w.userId}>
            <div className="item">
              <span className="who-avatar sm">{(w.name || '?').charAt(0)}</span>
              <div className="item-main">
                <p className="item-title">{w.name}</p>
                <p className="item-sub">{w.role}</p>
                <div className="item-badges">{chips.length ? chips : <span className="badge upcoming">All clear</span>}</div>
              </div>
            </div>
          </div>
        );
      })}
    </main>
  );
}
