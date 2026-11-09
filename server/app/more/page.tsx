import {
  Activity, Bell, CalendarDays, CloudSun, Database, KeyRound, LockKeyhole, MessageSquareWarning, Package, Search,
  Timer, Tractor, Trophy, Users, UserCog, Wallet, Receipt, ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import { lowStockItems } from '@/lib/data/inventory';
import { LogoutButton } from '@/app/_components/logout-button';
import { can, ROLE_LABEL } from '@/lib/domain/permissions';
import { Card, ListRow, PageHeader, StatusPill } from '@/components/ui';
import s from './more.module.css';

type Row = { href: string; icon: ReactNode; label: string; sub: string; trail?: ReactNode };

export default async function MorePage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const onFarm = can(user, 'farm.view');
  const seesTeam = can(user, 'team.view');
  const seesMoney = can(user, 'finance.view');
  const low = can(user, 'supplies.use') ? (await lowStockItems()).length : 0;

  const farm: Row[] = [];
  if (onFarm) {
    if (can(user, 'supplies.use'))
      farm.push({ href: '/more/supplies', icon: <Package />, label: 'Supplies', sub: 'Feed, fuel & parts', trail: low ? <StatusPill tone="today">{low} low</StatusPill> : undefined });
    farm.push({ href: '/more/assets', icon: <Tractor />, label: 'Assets', sub: 'Equipment & documents' });
    farm.push({ href: '/more/calendar', icon: <CalendarDays />, label: 'Calendar', sub: 'What’s due, by day' });
    farm.push({ href: '/more/time', icon: <Timer />, label: seesTeam ? 'Time report' : 'My hours', sub: seesTeam ? 'Hours logged' : 'Time you logged' });
    if (seesTeam) farm.push({ href: '/more/team', icon: <Users />, label: 'Team', sub: 'Who’s on what' });
    farm.push({ href: '/more/leaderboard', icon: <Trophy />, label: 'Leaderboard', sub: 'Points & streaks' });
    farm.push({ href: '/more/weather', icon: <CloudSun />, label: 'Weather', sub: 'Forecast & fire danger' });
    farm.push({ href: '/more/activity', icon: <Activity />, label: 'Activity', sub: 'Recent history' });
    farm.push({ href: '/more/search', icon: <Search />, label: 'Search', sub: 'Find anything' });
  }

  const money: Row[] = [];
  money.push({ href: '/more/rent', icon: <Wallet />, label: 'Rent', sub: seesMoney ? 'Collect & confirm' : 'Your charges & documents' });
  if (can(user, 'requests.create') || can(user, 'requests.manage'))
    money.push({ href: '/requests', icon: <MessageSquareWarning />, label: 'Requests', sub: can(user, 'requests.manage') ? 'Things to fix' : 'Report a problem' });
  if (seesMoney) money.push({ href: '/more/spend', icon: <Receipt />, label: 'Spending', sub: 'Farm costs' });

  const admin: Row[] = [];
  if (can(user, 'people.manage')) {
    admin.push({ href: '/people', icon: <UserCog />, label: 'People', sub: 'Invite & manage access' });
    admin.push({ href: '/more/access', icon: <ShieldCheck />, label: 'Who sees what', sub: 'Permissions by role' });
  }
  if (can(user, 'system.admin')) admin.push({ href: '/more/data', icon: <Database />, label: 'Server & data', sub: 'Updates, backups, export' });

  const me: Row[] = [
    ...(can(user, 'vault.use') ? [{ href: '/vault', icon: <LockKeyhole />, label: 'Passwords & codes', sub: can(user, 'vault.create') ? 'Shared logins, Wi-Fi, gate codes' : 'Codes shared with you' }] : []),
    { href: '/more/account', icon: <KeyRound />, label: 'Account', sub: 'Password & sign-in' },
    { href: '/more/notifications', icon: <Bell />, label: 'Notifications', sub: 'Digests & push' },
  ];

  const section = (title: string, rows: Row[]) =>
    rows.length > 0 && (
      <Card title={title} flush>
        {rows.map((r) => (
          <ListRow key={r.href} href={r.href} lead={r.icon} title={r.label} meta={r.sub} trail={r.trail} />
        ))}
      </Card>
    );

  return (
    <main className={s.wrap}>
      <PageHeader title={onFarm && seesTeam ? 'More' : 'Me'} />
      <Card>
        <div className={s.who}>
          <span className={s.avatar} aria-hidden>{(user.name || '?').charAt(0)}</span>
          <div className={s.whoMain}>
            <strong>{user.name}</strong>
            <span className={s.role}>{ROLE_LABEL[user.role]} · {user.email}</span>
          </div>
          <LogoutButton className="btn small ghost" />
        </div>
      </Card>
      {section('Farm', farm)}
      {section(onFarm ? 'Money & requests' : 'Your home', money)}
      {section('Running the farm', admin)}
      {section('You', me)}
    </main>
  );
}
