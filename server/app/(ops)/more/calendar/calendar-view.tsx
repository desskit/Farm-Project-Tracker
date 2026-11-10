'use client';
import { useState } from 'react';
import Link from 'next/link';
import { fmtDate } from '@/lib/domain/dates';
import type { CalendarItem, CalendarKind } from '@/lib/data/calendar';
import s from './calendar.module.css';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const KIND_LABEL: Record<CalendarKind, string> = { chore: 'Chore', maintenance: 'Upkeep', task: 'Task', rent: 'Rent', animals: 'Animals', land: 'Land', papers: 'Papers' };

/**
 * Month grid with dots for each day's items. Tapping a day lists that day's
 * work below. Month navigation is handled by the server page via links; this
 * component owns only the in-month day selection.
 */
export function CalendarView({
  monthKey,
  itemsByDate,
  today,
}: {
  monthKey: string;
  itemsByDate: Record<string, CalendarItem[]>;
  today: string;
}) {
  const [y, m] = monthKey.split('-').map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();

  const todayInMonth = today.startsWith(monthKey) ? today : null;
  const [selected, setSelected] = useState<string | null>(todayInMonth);

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${monthKey}-${String(d).padStart(2, '0')}`);

  const selectedItems = selected ? itemsByDate[selected] ?? [] : [];

  return (
    <>
      <div className={`cal-grid ${s.dowRow}`}>
        {DOW.map((d, i) => (
          <div className="cal-dow" key={i}>
            {d}
          </div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((date, i) => {
          if (!date) return <div className="cal-cell empty" key={`e${i}`} />;
          const items = itemsByDate[date] ?? [];
          const kinds = Array.from(new Set(items.map((it) => it.kind)));
          const classes = ['cal-cell'];
          if (date === today) classes.push('today');
          if (date === selected) classes.push('sel');
          if (items.length) classes.push('has');
          return (
            <button type="button" className={classes.join(' ')} key={date} onClick={() => setSelected(date)}>
              <span className="cal-num">{Number(date.slice(-2))}</span>
              {kinds.length > 0 && (
                <span className="cal-dots">
                  {kinds.slice(0, 4).map((k) => (
                    <span className={`cal-dot ${k}`} key={k} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className={s.day}>
          <h3 className={s.dayTitle}>{fmtDate(selected)} <span className={s.count}>{selectedItems.length}</span></h3>
          {selectedItems.length === 0 ? (
            <p className={s.muted}>Nothing scheduled.</p>
          ) : (
            selectedItems.map((it) => (
              <Link href={it.href} key={`${it.kind}-${it.id}`} className={s.item}>
                <span className={`cal-dot ${it.kind} ${s.dot}`} />
                <span className={s.itemTitle}>{it.title}</span>
                <span className={s.muted}>{KIND_LABEL[it.kind]}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </>
  );
}
