import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { listSales, salesTotals } from '@/lib/data/sales';
import { loanBorrowers, loanSummaryForSales } from '@/lib/data/loans';
import { listGroups } from '@/lib/data/livestock';
import { listUnits } from '@/lib/data/land';
import { can } from '@/lib/domain/permissions';
import { addDays, todayISO } from '@/lib/domain/dates';
import { Screen } from '@/components/patterns/screen';
import { StatTiles, type Tile } from '@/components/patterns/stat-tiles';
import { FilterChips } from '@/components/patterns/filter-chips';
import { SalesView } from './sales-view';

export const metadata = { title: 'Sales · Farm Project Tracker' };

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function SalesPage({ searchParams }: { searchParams: { show?: string } }) {
  const user = await getSessionUser();
  if (!user || !(can(user, 'sales.log') || can(user, 'finance.view'))) notFound();
  const today = todayISO();
  const owedOnly = searchParams.show === 'owed';
  const seesAll = can(user, 'finance.view');
  const [rows, year, groups, units] = await Promise.all([
    listSales(user, owedOnly ? { owedOnly: true } : { from: addDays(today, -90), to: today }),
    listSales(user, { from: `${today.slice(0, 4)}-01-01`, to: today }),
    can(user, 'animals.view') ? listGroups() : Promise.resolve([]),
    can(user, 'land.view') ? listUnits() : Promise.resolve([]),
  ]);
  const [loanBySale, borrowers] = await Promise.all([
    loanSummaryForSales(rows.map((r) => r.id), today),
    can(user, 'finance.manage') ? loanBorrowers() : Promise.resolve([]),
  ]);
  const month = salesTotals(year.filter((r) => r.date.slice(0, 7) === today.slice(0, 7)));
  const ytd = salesTotals(year);
  const tiles: Tile[] = [
    { label: seesAll ? 'This month' : 'Your sales this month', value: money(month.total) },
    { label: 'This year', value: money(ytd.total) },
    { label: 'Still owed', value: money(ytd.owed), tone: ytd.owed > 0 ? 'warn' : undefined, href: '/more/sales?show=owed' },
  ];

  return (
    <Screen title="Sales" subtitle={seesAll ? 'What the farm has sold' : 'Sales you’ve recorded'} back="/more">
      <StatTiles tiles={tiles} />
      <FilterChips label="Show" items={[{ href: '/more/sales', label: 'Last 90 days', on: !owedOnly }, { href: '/more/sales?show=owed', label: 'Who owes', on: owedOnly }]} />
      <SalesView
        sales={rows}
        canLog={can(user, 'sales.log')}
        canManage={can(user, 'finance.manage')}
        loans={Object.fromEntries(loanBySale)}
        borrowers={borrowers}
        me={user.id}
        seesAll={seesAll}
        today={today}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        places={units.filter((u) => !u.parentId).map((u) => ({ id: u.id, name: u.name }))}
      />
    </Screen>
  );
}
