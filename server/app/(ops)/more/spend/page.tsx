import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { FilterChips } from '@/components/patterns/filter-chips';
import s from '@/components/patterns/patterns.module.css';
import t from '../time/time.module.css';
import { getSessionUser } from '@/lib/auth/session';
import { spendReport } from '@/lib/data/spend';
import { todayISO, addDays, monthLabel } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';

type Period = 'month' | 'year' | 'all';
const PERIODS: { key: Period; label: string; days: number | null }[] = [
  { key: 'month', label: '30 days', days: 29 },
  { key: 'year', label: '1 year', days: 364 },
  { key: 'all', label: 'All time', days: null },
];

const money = (n: number) => `$${n.toFixed(2)}`;

export default async function SpendPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  // Spending is farm finance — managers and admins only.
  if (!can(user, 'finance.view')) notFound();

  const period = (PERIODS.find((p) => p.key === searchParams.period)?.key ?? 'year') as Period;
  const def = PERIODS.find((p) => p.key === period)!;
  const today = todayISO();
  const from = def.days == null ? null : addDays(today, -def.days);
  const report = await spendReport(from, today);

  const list = (rows: { key: string; label: React.ReactNode; total: number }[]) =>
    rows.map((r) => (
      <div className={s.kv} key={r.key}><span className={s.kvLabel}>{r.label}</span><strong>{money(r.total)}</strong></div>
    ));
  return (
    <Screen title="Spending" subtitle="Services, project expenses and supplies used" back="/more">
      <FilterChips label="Period" items={PERIODS.map((p) => ({ href: `/more/spend?period=${p.key}`, label: p.label, on: period === p.key }))} />
      <Card>
        <span className={s.big}>{money(report.total)}</span>
        <p className={t.muted}>total spend · {def.label.toLowerCase()}</p>
      </Card>
      {report.total === 0 ? (
        <Card><EmptyState icon={<Receipt />} title="Nothing spent in this period">Spend comes from logged services, project expenses, and priced supplies as they’re used.</EmptyState></Card>
      ) : (
        <>
          {report.byCategory.length > 1 && <Card title="By category" flush>{list(report.byCategory.map((c) => ({ key: c.category, label: c.label, total: c.total })))}</Card>}
          {report.byProject.length > 0 && (
            <Card title="By project" flush>
              {list(report.byProject.map((p) => ({ key: p.projectId, label: <Link href={`/projects/${p.projectId}`} className={t.link}>{p.name}</Link>, total: p.total })))}
            </Card>
          )}
          {report.byAsset.length > 0 && <Card title="By equipment" flush>{list(report.byAsset.map((a) => ({ key: a.assetId, label: a.name, total: a.total })))}</Card>}
          <Card title="By month" flush>{list(report.byMonth.map((m) => ({ key: m.month, label: monthLabel(m.month), total: m.total })))}</Card>
        </>
      )}
    </Screen>
  );
}
