import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Scale } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { profitReport } from '@/lib/data/profit';
import { can } from '@/lib/domain/permissions';
import { addDays, todayISO } from '@/lib/domain/dates';
import { ButtonLink, Card, EmptyState, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles } from '@/components/patterns/stat-tiles';
import { FilterChips } from '@/components/patterns/filter-chips';
import p from '@/components/patterns/patterns.module.css';
import s from '../../farm/animals/animals.module.css';

export const metadata = { title: 'Profit · Farm Project Tracker' };

type Period = 'month' | 'ytd' | 'year' | 'last';
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ProfitPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'finance.view')) notFound();
  const today = todayISO();
  const y = Number(today.slice(0, 4));
  const periods: { key: Period; label: string; from: string; to: string }[] = [
    { key: 'month', label: 'This month', from: `${today.slice(0, 7)}-01`, to: today },
    { key: 'ytd', label: 'This year', from: `${y}-01-01`, to: today },
    { key: 'year', label: 'Last 12 months', from: addDays(today, -364), to: today },
    { key: 'last', label: String(y - 1), from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];
  const cur = periods.find((x) => x.key === searchParams.period) ?? periods[1];
  const r = await profitReport(cur.from, cur.to);

  return (
    <Screen title="Profit" subtitle="What each part of the farm brought in and cost" back="/more" actions={<ButtonLink href="/more/spend" size="sm" variant="ghost">Spending</ButtonLink>}>
      <FilterChips label="Period" items={periods.map((x) => ({ href: `/more/profit?period=${x.key}`, label: x.label, on: x.key === cur.key }))} />
      <StatTiles
        tiles={[
          { label: 'Money in', value: money(r.income) },
          { label: 'Costs', value: money(r.costs) },
          { label: 'Net', value: money(r.net), tone: r.net < 0 ? 'bad' : r.net > 0 ? 'good' : undefined },
        ]}
      />
      {r.rows.length === 0 ? (
        <Card><EmptyState icon={<Scale />} title="Nothing in this period">Record sales, and log costs and supplies used, to see each enterprise here.</EmptyState></Card>
      ) : (
        r.rows.map((e) => (
          <Card
            key={e.key}
            title={e.href ? <Link href={e.href} className={p.link}>{e.name}</Link> : e.name}
            action={<StatusPill tone={e.net < 0 ? 'overdue' : 'done'}>{money(e.net)}</StatusPill>}
            flush
          >
            <div className={p.kv}><span className={p.kvLabel}>Money in</span><strong>{money(e.income)}</strong></div>
            {e.lines.map((l) => (
              <div className={p.kv} key={l.label}><span className={p.kvLabel}>{l.label}</span><span>{money(-l.amount)}</span></div>
            ))}
            {e.unit && <div className={p.kv}><span className={p.kvLabel}>Cost of production</span><span>{e.unit}</span></div>}
          </Card>
        ))
      )}
      <p className={s.muted}>
        Costs here are what was <strong>used</strong>: supplies count when they come off the shelf, at their cost per unit, against the herd or
        bed they were used on. For what was <strong>paid</strong> in a tax year, download the tax pack from Export.
      </p>
    </Screen>
  );
}
