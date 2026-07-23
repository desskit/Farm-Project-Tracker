import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { lowStockItems } from '@/lib/data/inventory';

type Tile = { href: string; icon: string; label: string; sub: string; badge?: number; warn?: boolean };

export default async function MorePage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isManager = user.role === 'manager' || user.role === 'admin';
  const isAdmin = user.role === 'admin';
  const low = (await lowStockItems()).length;

  const farm: Tile[] = [
    { href: '/more/supplies', icon: '📦', label: 'Supplies', sub: 'Feed, fuel & parts', badge: low || undefined, warn: low > 0 },
    { href: '/more/leaderboard', icon: '🏆', label: 'Leaderboard', sub: 'Points & streaks' },
    { href: '/more/rent', icon: '💵', label: 'Rent', sub: isManager ? 'Collect & verify' : 'Your charges' },
  ];
  if (isManager) farm.push({ href: '/more/team', icon: '👥', label: 'Team', sub: 'Farm-wide status' });

  const settings: Tile[] = [
    { href: '/more/calendar', icon: '📅', label: 'Calendar', sub: 'What’s due, by day' },
    { href: '/people', icon: '🧑‍🌾', label: 'People', sub: isAdmin ? 'Manage the crew' : 'The crew' },
    { href: '/more/activity', icon: '🕙', label: 'Activity', sub: 'Recent history' },
    { href: '/more/notifications', icon: '🔔', label: 'Notifications', sub: 'Digests & push' },
    { href: '/more/weather', icon: '🌤️', label: 'Weather', sub: 'Forecast & fire' },
    { href: '/more/data', icon: '💾', label: 'Data', sub: 'Backup & export' },
  ];

  return (
    <main className="view">
      <div className="view-head">
        <div>
          <h1>More</h1>
          <p className="subtle">Everything beyond today&apos;s work</p>
        </div>
      </div>

      <div className="card who-card">
        <span className="who-avatar">{(user.name || '?').charAt(0)}</span>
        <div className="who-main">
          <p className="who-name">{user.name}</p>
          <p className="who-role">{user.role}</p>
        </div>
        <a href="/api/auth/logout" className="btn small ghost">
          Log out
        </a>
      </div>

      <div className="section-title">Farm</div>
      <div className="tile-grid">
        {farm.map((t) => (
          <TileLink key={t.href} tile={t} />
        ))}
      </div>

      <div className="section-title">People &amp; settings</div>
      <div className="tile-grid">
        {settings.map((t) => (
          <TileLink key={t.href} tile={t} />
        ))}
      </div>
    </main>
  );
}

function TileLink({ tile }: { tile: Tile }) {
  return (
    <Link href={tile.href} className={`more-tile${tile.warn ? ' warn' : ''}`}>
      {tile.badge ? <span className="more-tile-badge">{tile.badge}</span> : null}
      <span className="more-tile-ico">{tile.icon}</span>
      <span className="more-tile-lbl">{tile.label}</span>
      <span className="more-tile-sub">{tile.sub}</span>
    </Link>
  );
}
