import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { timeReport } from '@/lib/data/time-report';
import { fmtDur, todayISO, addDays } from '@/lib/domain/dates';

type Period = 'week' | 'month' | 'all';
const PERIODS: { key: Period; label: string; days: number | null }[] = [
  { key: 'week', label: '7 days', days: 6 },
  { key: 'month', label: '30 days', days: 29 },
  { key: 'all', label: 'All time', days: null },
];

const KIND_ICON: Record<string, string> = { chore: '🔁', task: '☑️', maintenance: '🔧' };

export default async function TimeReportPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const period = (PERIODS.find((p) => p.key === searchParams.period)?.key ?? 'week') as Period;
  const def = PERIODS.find((p) => p.key === period)!;
  const today = todayISO();
  const from = def.days == null ? null : addDays(today, -def.days);
  const report = await timeReport(from, today);

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Time report</h1>
      </div>

      <div className="segmented">
        {PERIODS.map((p) => (
          <Link key={p.key} href={`/more/time?period=${p.key}`} className={period === p.key ? 'active' : ''}>
            {p.label}
          </Link>
        ))}
      </div>

      <div className="card champ" style={{ marginTop: 12 }}>
        <span className="champ-emoji">⏱</span>
        <div>
          <p className="champ-name">{fmtDur(report.totalSeconds)}</p>
          <p className="subtle" style={{ margin: 0 }}>
            total logged · {def.label.toLowerCase()}
          </p>
        </div>
      </div>

      {report.totalSeconds === 0 ? (
        <div className="empty">No time logged in this period. Start a timer on a chore, task, or upkeep item.</div>
      ) : (
        <>
          <div className="section-title">By person</div>
          <div className="card">
            {report.byPerson.map((p) => (
              <div className="hist-row" key={p.userId}>
                <span>{p.name}</span>
                <strong>{fmtDur(p.seconds)}</strong>
              </div>
            ))}
          </div>

          <div className="section-title">By item</div>
          <div className="card">
            {report.byItem.map((it) => (
              <div className="hist-row" key={`${it.kind}-${it.refId}`}>
                <span>
                  {KIND_ICON[it.kind] ?? '•'} {it.label}
                </span>
                <strong>{fmtDur(it.seconds)}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
