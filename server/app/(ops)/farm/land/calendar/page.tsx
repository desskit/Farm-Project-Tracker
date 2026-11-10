import { notFound } from 'next/navigation';
import { Sprout } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getFrostDates } from '@/lib/data/land';
import { can } from '@/lib/domain/permissions';
import { plantingCalendar, sowNow } from '@/lib/domain/crops';
import { diffDays, fmtDate, todayISO } from '@/lib/domain/dates';
import { Banner, Card, EmptyState, ListRow, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { FrostForm } from './frost-form';
import s from '../../animals/animals.module.css';

export const metadata = { title: 'Planting calendar · Farm Project Tracker' };

const HOW = { indoors: 'Start indoors', outdoors: 'Sow or plant out', fall: 'Sow for autumn' } as const;
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** When to sow what, worked out from the farm's frost dates. */
export default async function PlantingCalendarPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'land.view')) notFound();
  const frost = await getFrostDates();
  const manage = can(user, 'land.manage');
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const now = frost ? sowNow(frost, today) : [];
  const cal = frost ? plantingCalendar(frost, year) : [];
  // Position of a date along the year, 0–365.
  const x = (d: string) => Math.max(0, Math.min(365, diffDays(d, `${year}-01-01`)));

  return (
    <Screen title="Planting calendar" subtitle={frost ? `Last frost ${fmtDate(`${year}-${frost.lastSpring}`)} · first frost ${fmtDate(`${year}-${frost.firstFall}`)}` : 'When to sow what'} back="/farm/land">
      {!frost && !manage && <EmptyState icon={<Sprout />} title="No frost dates yet">A manager can set the farm’s frost dates to build the calendar.</EmptyState>}
      {!frost && manage && <Banner tone="info" title="Set your frost dates">The calendar counts weeks from your average last spring frost and back from the first autumn frost.</Banner>}

      {frost && (
        <Card title="Sow now" flush>
          {now.length === 0 ? (
            <EmptyState icon={<Sprout />} title="Nothing to sow this week">The next windows are in the chart below.</EmptyState>
          ) : (
            now.map((n) => (
              <ListRow key={n.crop.name} lead={<Sprout />} title={n.crop.name} meta={`${HOW[n.how]} until ${fmtDate(n.until)} · about ${n.crop.dtm} days to harvest`} trail={<StatusPill tone={n.how === 'indoors' ? 'info' : n.how === 'fall' ? 'upcoming' : 'done'}>{n.how === 'indoors' ? 'Indoors' : n.how === 'fall' ? 'Autumn' : 'Outdoors'}</StatusPill>} />
            ))
          )}
        </Card>
      )}

      {frost && (
        <Card title={`${year} at a glance`} flush>
          <div className={s.legend}><span><i className={s.in} />Start indoors</span><span><i />Sow / plant out</span><span><i className={s.fall} />Autumn sowing</span><span>┊ frosts · red line is today</span></div>
          <div className={s.calRow}><span /><div className={s.calMonths}>{MONTHS.map((mo, i) => <span key={i}>{mo}</span>)}</div></div>
          {cal.map((c) => (
            <div key={c.crop.name} className={s.calRow}>
              <span>{c.crop.name}</span>
              <svg className={s.calBar} viewBox="0 0 365 18" preserveAspectRatio="none" role="img" aria-label={`${c.crop.name}: ${c.indoors ? `start indoors ${fmtDate(c.indoors.from)} to ${fmtDate(c.indoors.to)}; ` : ''}outdoors ${fmtDate(c.outdoors.from)} to ${fmtDate(c.outdoors.to)}${c.fallBy ? `; autumn sowing until ${fmtDate(c.fallBy)}` : ''}`}>
                {c.indoors && <rect className={s.in} x={x(c.indoors.from)} y={3} width={Math.max(2, x(c.indoors.to) - x(c.indoors.from))} height={12} rx={2} />}
                <rect className={s.outd} x={x(c.outdoors.from)} y={3} width={Math.max(2, x(c.outdoors.to) - x(c.outdoors.from))} height={12} rx={2} />
                {c.fallBy && <rect className={s.fall} x={x(c.outdoors.to)} y={3} width={Math.max(2, x(c.fallBy) - x(c.outdoors.to))} height={12} rx={2} />}
                <line className={s.frost} x1={x(`${year}-${frost.lastSpring}`)} x2={x(`${year}-${frost.lastSpring}`)} y1={0} y2={18} />
                <line className={s.frost} x1={x(`${year}-${frost.firstFall}`)} x2={x(`${year}-${frost.firstFall}`)} y1={0} y2={18} />
                <line className={s.now} x1={x(today)} x2={x(today)} y1={0} y2={18} />
              </svg>
            </div>
          ))}
        </Card>
      )}

      {frost && <p className={s.muted}>These are common rules of thumb, not promises: watch the forecast and your own ground. Planting a crop from this list fills in its days to maturity.</p>}

      {manage && (
        <Card title="Frost dates">
          <FrostForm year={year} lastSpring={frost?.lastSpring ?? null} firstFall={frost?.firstFall ?? null} />
        </Card>
      )}
    </Screen>
  );
}
