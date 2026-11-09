import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ButtonLink, Card } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { getSessionUser } from '@/lib/auth/session';
import { calendarItems, type CalendarItem } from '@/lib/data/calendar';
import { currentMonthKey, shiftMonthKey, monthLabel, todayISO } from '@/lib/domain/dates';
import { CalendarView } from './calendar-view';

function isMonthKey(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}$/.test(s);
}

function lastDayOfMonth(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  const day = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this one
  return `${mk}-${String(day).padStart(2, '0')}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: { m?: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const mk = isMonthKey(searchParams.m) ? searchParams.m : currentMonthKey();
  const from = `${mk}-01`;
  const to = lastDayOfMonth(mk);
  const items = await calendarItems(user, from, to);

  const byDate: Record<string, CalendarItem[]> = {};
  for (const it of items) (byDate[it.date] ??= []).push(it);

  return (
    <Screen title="Calendar" subtitle="What's due, day by day" back="/more">
      <Card>
        <div className="cal-nav">
          <ButtonLink href={`/more/calendar?m=${shiftMonthKey(mk, -1)}`} size="sm" variant="ghost" aria-label="Previous month"><ChevronLeft /></ButtonLink>
          <strong>{monthLabel(mk)}</strong>
          <ButtonLink href={`/more/calendar?m=${shiftMonthKey(mk, 1)}`} size="sm" variant="ghost" aria-label="Next month"><ChevronRight /></ButtonLink>
        </div>
        <CalendarView monthKey={mk} itemsByDate={byDate} today={todayISO()} />
      </Card>
    </Screen>
  );
}
