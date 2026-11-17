import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { canRecordFarmSales, listSales, salesTotals } from '@/lib/data/sales';
import { loanBorrowers, loanSummaryForSales } from '@/lib/data/loans';
import { listGroups } from '@/lib/data/livestock';
import { listUnits } from '@/lib/data/land';
import { can } from '@/lib/domain/permissions';
import { addDays, todayISO } from '@/lib/domain/dates';
import { Screen } from '@/components/patterns/screen';
import { StatTiles, type Tile } from '@/components/patterns/stat-tiles';
import { FilterChips } from '@/components/patterns/filter-chips';
import { SalesView } from './sales-view';
import { DeliveriesDue, StandingOrdersCard } from './standing-orders';
import { deliveriesDue, listStandingOrders } from '@/lib/data/standing-orders';
import { Card, ListRow } from '@/components/ui';

export const metadata = { title: 'Sales · Farm Project Tracker' };

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The farm's sales (for people who record or see them) and your own personal
 * sales (anyone on the farm). Totals are the farm's only.
 */
export default async function SalesPage({ searchParams }: { searchParams: { show?: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const today = todayISO();
  const owedOnly = searchParams.show === 'owed';
  const seesAll = can(user, 'finance.view');
  const farmSide = canRecordFarmSales(user) || seesAll;
  const [rows, year, groups, units, borrowers] = await Promise.all([
    listSales(user, owedOnly ? { owedOnly: true } : { from: addDays(today, -90), to: today }),
    listSales(user, { from: `${today.slice(0, 4)}-01-01`, to: today }),
    can(user, 'animals.view') ? listGroups() : Promise.resolve([]),
    can(user, 'land.view') ? listUnits() : Promise.resolve([]),
    loanBorrowers(),
  ]);
  const canFarm = canRecordFarmSales(user);
  const [loanBySale, orders, due] = await Promise.all([
    loanSummaryForSales(rows.map((r) => r.id), today),
    canFarm ? listStandingOrders(user) : Promise.resolve([]),
    deliveriesDue(user, today),
  ]);
  const farmRows = rows.filter((r) => !r.personal);
  const myRows = rows.filter((r) => r.personal);
  // "Who owes": what each buyer still owes the farm.
  const owedBy = [...farmRows.filter((r) => !r.paid).reduce((m, r) => {
    const k = r.buyer || 'No name given';
    const cur = m.get(k) ?? { buyer: k, total: 0, count: 0 };
    cur.total += r.amount;
    cur.count++;
    return m.set(k, cur);
  }, new Map<string, { buyer: string; total: number; count: number }>()).values()].sort((a, b) => b.total - a.total);
  const categories = [...new Set([...rows, ...year].map((r) => r.category).filter(Boolean))];

  const month = salesTotals(year.filter((r) => r.date.slice(0, 7) === today.slice(0, 7)));
  const ytd = salesTotals(year);
  const mineOwed = year.filter((r) => r.personal && !r.paid).reduce((a, r) => a + r.amount, 0);
  const tiles: Tile[] = farmSide
    ? [
      { label: seesAll ? 'Farm this month' : 'Your farm sales this month', value: money(month.total) },
      { label: 'Farm this year', value: money(ytd.total) },
      { label: 'Owed to the farm', value: money(ytd.owed), tone: ytd.owed > 0 ? 'warn' : undefined, href: '/more/sales?show=owed' },
    ]
    : [];
  if (mineOwed > 0) tiles.push({ label: 'Owed to you', value: money(mineOwed), tone: 'warn', href: '/more/sales?show=owed' });

  const common = {
    canLogFarm: canRecordFarmSales(user),
    canManage: can(user, 'finance.manage'),
    loans: Object.fromEntries(loanBySale),
    borrowers,
    me: user.id,
    seesAll,
    today,
    categories,
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    places: units.filter((u) => !u.parentId).map((u) => ({ id: u.id, name: u.name })),
  };

  return (
    <Screen title="Sales" subtitle={farmSide ? 'What the farm sold, and what you sold yourself' : 'Things you’ve sold to people'} back="/more">
      {tiles.length > 0 && <StatTiles tiles={tiles} />}
      <FilterChips label="Show" items={[{ href: '/more/sales', label: 'Last 90 days', on: !owedOnly }, { href: '/more/sales?show=owed', label: 'Who owes', on: owedOnly }]} />
      <DeliveriesDue orders={due} today={today} />
      {owedOnly && owedBy.length > 0 && (
        <Card title="Owed, by buyer" flush>
          {owedBy.map((b) => <ListRow key={b.buyer} title={b.buyer} meta={`${b.count} sale${b.count === 1 ? '' : 's'}`} trail={<strong>{money(b.total)}</strong>} />)}
        </Card>
      )}
      {farmSide && <SalesView {...common} sales={farmRows} title="The farm’s sales" />}
      {canFarm && <StandingOrdersCard orders={orders} today={today} groups={common.groups} places={common.places} />}
      {(!farmSide || myRows.length > 0) && <SalesView {...common} sales={myRows} title="Your personal sales" personalList />}
    </Screen>
  );
}
