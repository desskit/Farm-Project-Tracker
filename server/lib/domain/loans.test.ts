import { describe, expect, it } from 'vitest';
import { addMonthsClamped, instalmentCount, loanReminderStage, loanSchedule, loanState } from './loans';

describe('loan schedule', () => {
  it('splits the price into equal instalments with the remainder last', () => {
    const s = loanSchedule(250, 100, 'week', '2026-11-16');
    expect(s.map((i) => [i.date, i.amount])).toEqual([['2026-11-16', 100], ['2026-11-23', 100], ['2026-11-30', 50]]);
    expect(instalmentCount(250, 100)).toBe(3);
    expect(instalmentCount(300, 100)).toBe(3);
  });

  it('keeps the day of the month without spilling over', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28');
    expect(loanSchedule(90, 30, 'month', '2026-12-31').map((i) => i.date)).toEqual(['2026-12-31', '2027-01-31', '2027-02-28']);
  });
});

describe('loan state', () => {
  const s = loanSchedule(300, 100, 'month', '2026-10-01');
  it('applies payments to the oldest instalment first', () => {
    const st = loanState(s, 150, '2026-11-15');
    expect(st.balance).toBe(150);
    expect(st.overdue).toBe(50);
    expect(st.next).toEqual({ date: '2026-11-01', amount: 50 });
    expect(st.daysLate).toBe(14);
    expect(st.schedule.map((r) => r.state)).toEqual(['paid', 'late', 'upcoming']);
  });

  it('counts early or extra payments toward later instalments, and caps at the total', () => {
    expect(loanState(s, 220, '2026-09-01').schedule.map((r) => r.state)).toEqual(['paid', 'paid', 'part']);
    const done = loanState(s, 400, '2026-09-01');
    expect(done).toMatchObject({ balance: 0, paid: 300, next: null, overdue: 0 });
  });

  it('reminds three days before, on the day and three days late', () => {
    expect(loanReminderStage({ date: '2026-11-14' }, '2026-11-11')).toBe('soon');
    expect(loanReminderStage({ date: '2026-11-11' }, '2026-11-11')).toBe('due');
    expect(loanReminderStage({ date: '2026-11-08' }, '2026-11-11')).toBe('late');
    expect(loanReminderStage({ date: '2026-11-12' }, '2026-11-11')).toBeNull();
    expect(loanReminderStage(null, '2026-11-11')).toBeNull();
  });
});
