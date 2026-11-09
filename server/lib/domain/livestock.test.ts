import { describe, expect, it } from 'vitest';
import { expectedDue, weekTrend, withdrawalUntil } from './livestock';

describe('livestock math', () => {
  it('works out due dates from breeding', () => {
    expect(expectedDue('goat', '2026-01-01')).toBe('2026-05-31');
    expect(expectedDue('chicken', '2026-03-01')).toBe('2026-03-22');
    expect(expectedDue('other', '2026-03-01')).toBeNull();
  });
  it('works out withdrawal end dates', () => {
    expect(withdrawalUntil('2026-11-01', 7)).toBe('2026-11-08');
    expect(withdrawalUntil('2026-11-01', 0)).toBeNull();
    expect(withdrawalUntil('2026-11-01', null)).toBeNull();
  });
  it('compares this week with last week', () => {
    const t = weekTrend([{ date: '2026-11-10', amount: 70 }, { date: '2026-11-02', amount: 50 }, { date: '2026-10-20', amount: 999 }], '2026-11-10');
    expect(t).toEqual({ thisWeek: 70, lastWeek: 50, pct: 40 });
  });
});
