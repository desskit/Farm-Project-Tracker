import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { lowStockItems } from '@/lib/data/inventory';
import { LogoutButton } from '@/app/_components/logout-button';
import { can, ROLE_LABEL } from '@/lib/domain/permissions';

type Tile = { href: string; icon: string; label: string; sub: string; badge?: number; warn?: boolean };

export default async function MorePage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const seesTeam = can(user, 'team.view');
  const seesMoney = can(user, 'finance.view');
  const managesPeople = can(user, 'people.manage');
  const onFarm = can(user, 'farm.view');
  const low = can(user, 'supplies.use') ? (await lowStockItems()).length : 0;

  const farm: Tile[] = !onFarm ? [] : [
    { href: '/more/assets', icon: '🚜', label: 'Assets', sub: 'Equipment & documents' },
    { href: '/more/supplies', icon: '📦', label: 'Supplies', sub: 'Feed, fuel & parts', badge: low || undefined, warn: low > 0 },
    { href: '/more/leaderboard', icon: '🏆', label: 'Leaderboard', sub: 'Points & streaks' },
    { href: '/more/time', icon: '⏱', label: seesTeam ? 'Time report' : 'My hours', sub: seesTeam ? 'Hours logged' : 'Time you logged' },
    { href: '/more/rent', icon: '💵', label: 'Rent', sub: seesMoney ? 'Collect & verify' : 'Your charges' },
  ];
  if (can(user, 'requests.create') || can(user, 'requests.manage')) {
    farm.push({ href: '/requests', icon: '🛠️', label: 'Requests', sub: can(user, 'requests.manage') ? 'Things to fix' : 'Report a problem' });
  }
  if (seesMoney) farm.push({ href: '/more/spend', icon: '💸', label: 'Spending', sub: 'Farm costs' });
  if (seesTeam) farm.push({ href: '/more/team', icon: '👥', label: 'Team', sub: 'Farm-wide status' });

  const settings: Tile[] = [
    ...(onFarm
      ? [
          { href: '/more/search', icon: '🔍', label: 'Search', sub: 'Find anything' },
          { href: '/more/calendar', icon: '📅', label: 'Calendar', sub: 'What’s due, by day' },
        ]
      : []),
    { href: '/more/account', icon: '🔑', label: 'Account', sub: 'Password & sign-in' },
    ...(managesPeople ? [{ href: '/people', icon: '🧑‍🌾', label: 'People', sub: 'Invite & manage access' }] : []),
    ...(onFarm ? [{ href: '/more/activity', icon: '🕙', label: 'Activity', sub: 'Recent history' }] : []),
    { href: '/more/notifications', icon: '🔔', label: 'Notifications', sub: 'Digests & push' },
    ...(onFarm ? [{ href: '/more/weather', icon: '🌤️', label: 'Weather', sub: 'Forecast & fire' }] : []),
    ...(can(user, 'system.admin') ? [{ href: '/more/data', icon: '💾', label: 'Data', sub: 'Updates, backup & export' }] : []),
  ];

  return (
    <main className="view">
      <div className="view-head">
        <div>
          <h1>More</h1>
          <p className="subtle">{onFarm ? 'Everything beyond today\u2019s work' : 'Your account and settings'}</p>
        </div>
      </div>

      <div className="card who-card">
        <span className="who-avatar">{(user.name || '?').charAt(0)}</span>
        <div className="who-main">
          <p className="who-name">{user.name}</p>
          <p className="who-role">{ROLE_LABEL[user.role]}</p>
        </div>
        <LogoutButton className="btn small ghost" />
      </div>

      {farm.length > 0 && (
        <>
          <div className="section-title">Farm</div>
          <div className="tile-grid">
            {farm.map((t) => (
              <TileLink key={t.href} tile={t} />
            ))}
          </div>
        </>
      )}

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
