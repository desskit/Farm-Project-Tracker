import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { spendReport } from '@/lib/data/spend';
import { todayISO, addDays, monthLabel } from '@/lib/domain/dates';

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

  const period = (PERIODS.find((p) => p.key === searchParams.period)?.key ?? 'year') as Period;
  const def = PERIODS.find((p) => p.key === period)!;
  const today = todayISO();
  const from = def.days == null ? null : addDays(today, -def.days);
  const report = await spendReport(from, today);

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Spending</h1>
      </div>

      <div className="segmented">
        {PERIODS.map((p) => (
          <Link key={p.key} href={`/more/spend?period=${p.key}`} className={period === p.key ? 'active' : ''}>
            {p.label}
          </Link>
        ))}
      </div>

      <div className="card champ" style={{ marginTop: 12 }}>
        <span className="champ-emoji">💸</span>
        <div>
          <p className="champ-name">{money(report.total)}</p>
          <p className="subtle" style={{ margin: 0 }}>
            upkeep spend · {def.label.toLowerCase()}
          </p>
        </div>
      </div>

      {report.total === 0 ? (
        <div className="empty">No upkeep costs logged in this period. Costs are recorded when you log a service.</div>
      ) : (
        <>
          <div className="section-title">By asset</div>
          <div className="card">
            {report.byAsset.map((a) => (
              <div className="hist-row" key={a.assetId}>
                <span>{a.name}</span>
                <strong>{money(a.total)}</strong>
              </div>
            ))}
          </div>

          <div className="section-title">By month</div>
          <div className="card">
            {report.byMonth.map((m) => (
              <div className="hist-row" key={m.month}>
                <span>{monthLabel(m.month)}</span>
                <strong>{money(m.total)}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
