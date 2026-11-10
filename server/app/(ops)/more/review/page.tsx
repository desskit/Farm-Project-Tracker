import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { yearReview } from '@/lib/data/review';
import { can } from '@/lib/domain/permissions';
import { todayISO } from '@/lib/domain/dates';
import { Card, EmptyState, ListRow } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles, type Tile } from '@/components/patterns/stat-tiles';
import { MonthBars } from '@/components/patterns/month-bars';
import { PrintButton } from '@/app/more/rent/print-button';
import s from '../../farm/animals/animals.module.css';

export const metadata = { title: 'Year in review · Farm Project Tracker' };

const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

export default async function ReviewPage({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const thisYear = Number(todayISO().slice(0, 4));
  const asked = Number(searchParams.year);
  const year = Number.isInteger(asked) && asked >= 2020 && asked <= thisYear ? asked : thisYear;
  const r = await yearReview(user, year);

  const tiles: Tile[] = [{ label: 'Chores done', value: r.chores.total }];
  for (const p of r.production ?? []) tiles.push({ label: p.kind === 'eggs' ? 'Eggs' : `${p.kind.charAt(0).toUpperCase()}${p.kind.slice(1)} (${p.unit})`, value: p.total.toLocaleString('en-US') });
  if (r.herd && (r.herd.births || r.herd.losses)) tiles.push({ label: 'Born / hatched', value: r.herd.births });
  if (r.money) tiles.push({ label: 'Net', value: usd(r.money.net), tone: r.money.net >= 0 ? 'good' : 'bad' });
  const empty = !r.chores.total && !(r.production?.length) && !(r.harvest?.length) && !r.hours.length;

  return (
    <Screen
      title={`${year} in review`}
      subtitle={year === thisYear ? 'The year so far' : 'The whole year'}
      back="/more"
      actions={<PrintButton label="Print" />}
    >
      <div className={`${s.actions} no-print`}>
        {year > 2020 && <Link href={`/more/review?year=${year - 1}`} className={s.fileBtn}>← {year - 1}</Link>}
        {year < thisYear && <Link href={`/more/review?year=${year + 1}`} className={s.fileBtn}>{year + 1} →</Link>}
      </div>
      <StatTiles tiles={tiles} />
      {empty && <Card><EmptyState title="Nothing logged this year yet">As chores, eggs, harvests and hours are logged, the year fills in here.</EmptyState></Card>}

      {(r.production ?? []).map((p) => (
        <Card key={p.kind} title={p.kind === 'eggs' ? 'Eggs by month' : `${p.kind.charAt(0).toUpperCase()}${p.kind.slice(1)} by month`}>
          <MonthBars values={p.months} unit={p.unit} caption={`${p.total.toLocaleString('en-US')} ${p.unit} in all`} />
        </Card>
      ))}

      {r.herd && (r.herd.births > 0 || r.herd.losses > 0 || r.herd.sold > 0 || r.herd.processed > 0) && (
        <Card title="The herd" flush>
          <ListRow title="Born or hatched" trail={<strong>{r.herd.births}</strong>} />
          <ListRow title="Lost" trail={<strong>{r.herd.losses}</strong>} />
          <ListRow title="Sold" trail={<strong>{r.herd.sold}</strong>} />
          <ListRow title="Processed" trail={<strong>{r.herd.processed}</strong>} />
        </Card>
      )}

      {r.harvest && r.harvest.length > 0 && (
        <Card title="Harvest by crop" flush>
          {r.harvest.map((h) => <ListRow key={`${h.crop}-${h.unit}`} title={h.crop} trail={<strong>{h.amount.toLocaleString('en-US')} {h.unit}</strong>} />)}
        </Card>
      )}

      {r.chores.total > 0 && (
        <Card title="Chores done by month">
          <MonthBars values={r.chores.months} unit="chores" caption={`${r.chores.total.toLocaleString('en-US')} done`} />
        </Card>
      )}

      {r.hours.length > 0 && (
        <Card title={can(user, 'team.view') ? 'Hours logged' : 'Your hours'} flush>
          {r.hours.map((h) => <ListRow key={h.name} title={h.name} trail={<strong>{h.hours} h</strong>} />)}
        </Card>
      )}

      {r.money && (
        <Card title="Money">
          <StatTiles tiles={[{ label: 'Money in', value: usd(r.money.income) }, { label: 'Costs', value: usd(r.money.costs) }, { label: 'Net', value: usd(r.money.net), tone: r.money.net >= 0 ? 'good' : 'bad' }]} />
          <MonthBars values={r.money.spendMonths} unit="dollars" caption="Spending by month (what was used)" />
          <p className={`${s.muted} no-print`}>The detail is under <Link href="/more/profit">Profit</Link> and <Link href="/more/spend">Spending</Link>.</p>
        </Card>
      )}
    </Screen>
  );
}
