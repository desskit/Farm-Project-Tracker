import { ListChecks, Repeat, Timer, Wrench } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { FilterChips } from '@/components/patterns/filter-chips';
import s from '@/components/patterns/patterns.module.css';
import t from './time.module.css';
import { getSessionUser } from '@/lib/auth/session';
import { timeReport } from '@/lib/data/time-report';
import { fmtDur, todayISO, addDays } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';

type Period = 'week' | 'month' | 'all';
const PERIODS: { key: Period; label: string; days: number | null }[] = [
  { key: 'week', label: '7 days', days: 6 },
  { key: 'month', label: '30 days', days: 29 },
  { key: 'all', label: 'All time', days: null },
];

const KIND_ICON: Record<string, React.ReactNode> = { chore: <Repeat />, task: <ListChecks />, maintenance: <Wrench /> };

export default async function TimeReportPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const period = (PERIODS.find((p) => p.key === searchParams.period)?.key ?? 'week') as Period;
  const def = PERIODS.find((p) => p.key === period)!;
  const today = todayISO();
  const from = def.days == null ? null : addDays(today, -def.days);
  // Other people's hours are a manager's business; everyone else sees their own.
  const isManager = can(user, 'team.view');
  const report = await timeReport(from, today, isManager ? undefined : user.id);

  return (
    <Screen title={isManager ? 'Time report' : 'My hours'} back="/more">
      <FilterChips label="Period" items={PERIODS.map((p) => ({ href: `/more/time?period=${p.key}`, label: p.label, on: period === p.key }))} />
      <Card>
        <span className={s.big}>{fmtDur(report.totalSeconds)}</span>
        <p className={t.muted}>total logged · {def.label.toLowerCase()}</p>
      </Card>
      {report.totalSeconds === 0 ? (
        <Card><EmptyState icon={<Timer />} title="No time logged">Start a timer on a chore, task or upkeep item.</EmptyState></Card>
      ) : (
        <>
          {isManager && (
            <Card title="By person" flush>
              {report.byPerson.map((p) => (
                <div className={s.kv} key={p.userId}><span className={s.kvLabel}>{p.name}</span><strong>{fmtDur(p.seconds)}</strong></div>
              ))}
            </Card>
          )}
          <Card title="By item" flush>
            {report.byItem.map((it) => (
              <div className={s.kv} key={`${it.kind}-${it.refId}`}>
                <span className={s.kvLabel}>{KIND_ICON[it.kind]}{it.label}</span>
                <strong>{fmtDur(it.seconds)}</strong>
              </div>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
