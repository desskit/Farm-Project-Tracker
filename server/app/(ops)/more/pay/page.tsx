import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { canApproveHours, listPaySettings, listWorkLogs, payAnchor, payPeriodView } from '@/lib/data/pay';
import { loanBorrowers } from '@/lib/data/loans';
import { can } from '@/lib/domain/permissions';
import { recentPeriods } from '@/lib/domain/pay';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { Screen } from '@/components/patterns/screen';
import { FilterChips } from '@/components/patterns/filter-chips';
import { HoursToApprove, PayPeople, PayPeriodCard, PaySchedule } from './pay-view';
import s from '../../farm/animals/animals.module.css';

export const metadata = { title: 'Pay · Farm Project Tracker' };

/** Crew pay: rates and rent rules, hours to approve, and each two-week pay period. */
export default async function PayPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'finance.manage')) notFound();
  const today = todayISO();
  const anchor = await payAnchor();
  const periods = recentPeriods(anchor, today, 4);
  const chosen = periods.find((p) => p.start === searchParams.period) ?? periods[0];
  const [view, settings, people, pending] = await Promise.all([
    payPeriodView(user, chosen.start),
    listPaySettings(user),
    loanBorrowers(),
    canApproveHours(user) ? listWorkLogs(user, { status: 'pending' }) : Promise.resolve([]),
  ]);

  return (
    <Screen title="Pay" subtitle="Hours, pay, and pay put toward rent" back="/more">
      <HoursToApprove logs={pending.filter((l) => l.userId !== user.id).map((l) => ({ id: l.id, name: l.name, date: l.date, hours: l.hours, note: l.note }))} />
      <FilterChips
        label="Pay period"
        items={periods.map((p, i) => ({ href: `/more/pay?period=${p.start}`, label: i === 0 ? `This period (${fmtDate(p.start)})` : `${fmtDate(p.start)} – ${fmtDate(p.end)}`, on: p.start === chosen.start }))}
      />
      <PayPeriodCard view={view} today={today} />
      <PayPeople
        settings={settings.map((x) => ({ userId: x.userId, name: x.name, hourlyRate: x.hourlyRate, rentRule: x.rentRule, rentFixed: x.rentFixed, active: x.active }))}
        people={people.filter((p) => !settings.some((x) => x.userId === p.id))}
      />
      <PaySchedule anchor={anchor} />
      <p className={s.muted}>This keeps a record of hours and pay. It doesn’t file payroll taxes or withholdings.</p>
    </Screen>
  );
}
