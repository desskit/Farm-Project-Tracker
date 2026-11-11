import { Activity, BarChart3, Bell, BookOpen, Building2, CalendarDays, CircleDollarSign, CloudSun, Database, FileSpreadsheet, KeyRound, LockKeyhole, Megaphone, MessageSquareWarning, Package, Phone, Receipt, Scale, Search, ShieldCheck, Timer, Tractor, Trophy, UserCog, Users, Wallet, Webhook, HandCoins } from 'lucide-react';
import type { ReactNode } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import { lowStockItems } from '@/lib/data/inventory';
import { LogoutButton } from '@/app/_components/logout-button';
import { can, ROLE_LABEL } from '@/lib/domain/permissions';
import { datasetsFor } from '@/lib/data/csv';
import { hasLoans } from '@/lib/data/loans';
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
    farm.push({ href: '/more/guides', icon: <BookOpen />, label: 'How-to guides', sub: 'Step-by-step instructions' });
    farm.push({ href: '/more/contacts', icon: <Phone />, label: 'Contacts', sub: 'Vet, farrier, suppliers, emergency' });
    if (can(user, 'work.manage') || can(user, 'rentals.manage')) farm.push({ href: '/more/notices', icon: <Megaphone />, label: 'Notices', sub: 'Post an announcement' });
    farm.push({ href: '/more/search', icon: <Search />, label: 'Search', sub: 'Find anything' });
    farm.push({ href: '/more/review', icon: <BarChart3 />, label: 'Year in review', sub: 'Eggs, harvest, chores and hours' });
    farm.push({ href: '/more/export', icon: <FileSpreadsheet />, label: 'Export & print', sub: 'Spreadsheets, chore sheet, record books' });
  }

  const money: Row[] = [];
  money.push({ href: '/more/rent', icon: <Wallet />, label: 'Rent', sub: seesMoney ? 'Collect & confirm' : 'Your charges & documents' });
  if (can(user, 'rentals.manage')) money.push({ href: '/more/rentals', icon: <Building2 />, label: 'Rentals', sub: 'Units, leases, utilities, inspections' });
  if (can(user, 'requests.create') || can(user, 'requests.manage'))
    money.push({ href: '/requests', icon: <MessageSquareWarning />, label: 'Requests', sub: can(user, 'requests.manage') ? 'Things to fix' : 'Report a problem' });
  if (can(user, 'sales.log') || seesMoney) money.push({ href: '/more/sales', icon: <CircleDollarSign />, label: 'Sales', sub: seesMoney ? 'What the farm sold, and who owes' : 'Record what you sell' });
  if (onFarm && (await hasLoans(user))) money.push({ href: '/more/loans', icon: <HandCoins />, label: 'Loans', sub: seesMoney ? 'Sales paid back over time' : 'What you owe, and payments' });
  if (seesMoney) money.push({ href: '/more/spend', icon: <Receipt />, label: 'Spending', sub: 'Farm costs' });
  if (seesMoney) money.push({ href: '/more/profit', icon: <Scale />, label: 'Profit', sub: 'Money in and costs, by herd, garden and rentals' });

  const admin: Row[] = [];
  if (can(user, 'people.manage')) {
    admin.push({ href: '/people', icon: <UserCog />, label: 'People', sub: 'Invite & manage access' });
    admin.push({ href: '/more/access', icon: <ShieldCheck />, label: 'Who sees what', sub: 'Permissions by role' });
  }
  if (can(user, 'system.admin')) admin.push({ href: '/more/data', icon: <Database />, label: 'Server & data', sub: 'Updates, backups, export' });
  if (can(user, 'system.admin')) admin.push({ href: '/more/webhooks', icon: <Webhook />, label: 'Webhooks', sub: 'Tell other systems when things happen' });

  const me: Row[] = [
    ...(can(user, 'vault.use') ? [{ href: '/vault', icon: <LockKeyhole />, label: 'Passwords & codes', sub: can(user, 'vault.create') ? 'Shared logins, Wi-Fi, gate codes' : 'Codes shared with you' }] : []),
    { href: '/more/account', icon: <KeyRound />, label: 'Account', sub: 'Password, appearance, calendar' },
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
