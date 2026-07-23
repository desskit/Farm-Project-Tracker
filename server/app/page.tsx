import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { getDashboard, type DashboardItem } from '@/lib/data/dashboard';
import { CompleteChoreButton } from './_components/complete-chore-button';
import { WeatherWidget } from './_components/weather-widget';

export default async function HomePage({ searchParams }: { searchParams: { scope?: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="auth-wrap">
        <p className="auth-brand">🌾 Farm Project Tracker</p>
        <p className="subtle">Server phase — foundation is up.</p>
        <p style={{ marginTop: 24 }}>
          <Link href="/login" className="btn primary block">
            Log in
          </Link>
        </p>
      </main>
    );
  }

  const scope = searchParams.scope === 'all' ? 'all' : 'mine';
  const buckets = await getDashboard(user, scope);
  const total = buckets.overdue.length + buckets.today.length + buckets.upcoming.length;

  return (
    <main className="view">
      <div className="view-head">
        <div>
          <h1>Today</h1>
          <p className="subtle">
            {user.name} · {user.role}
          </p>
        </div>
        <div className="segmented">
          <Link href="/?scope=mine" className={scope === 'mine' ? 'active' : ''}>
            Mine
          </Link>
          <Link href="/?scope=all" className={scope === 'all' ? 'active' : ''}>
            All
          </Link>
        </div>
      </div>

      <WeatherWidget />

      {total === 0 ? (
        <div className="empty">Nothing due in the next 7 days{scope === 'mine' ? ' for you' : ''}. 🎉</div>
      ) : (
        <>
          <BucketSection title="Overdue" items={buckets.overdue} />
          <BucketSection title="Due today" items={buckets.today} />
          <BucketSection title="Coming up" items={buckets.upcoming} />
        </>
      )}
    </main>
  );
}

function BucketSection({ title, items }: { title: string; items: DashboardItem[] }) {
  if (!items.length) return null;
  const rail = title === 'Overdue' ? 'overdue' : title === 'Due today' ? 'today' : 'upcoming';
  return (
    <>
      <div className="section-title">
        {title}
        <span className="count-pill">{items.length}</span>
      </div>
      {items.map((it) => (
        <div className="card" key={it.kind + it.id}>
          <div className="item">
            <span className={`left-rail ${rail}`} />
            <div className="item-main">
              <Link href={it.href} className="tap-link">
                <p className="item-title">{it.title}</p>
              </Link>
              <p className="item-sub">{it.subtitle}</p>
            </div>
            {it.kind === 'chore' ? (
              <CompleteChoreButton choreId={it.id} gated={it.gated} />
            ) : (
              <Link href={it.href} className="btn small">
                {it.actionLabel}
              </Link>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
