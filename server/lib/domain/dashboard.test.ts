import { describe, it, expect } from 'vitest';
import { bucketForDate } from './dashboard';
import { addDays, todayISO } from './dates';

describe('bucketForDate', () => {
  it('classifies overdue / today / upcoming / later correctly', () => {
    const today = todayISO();
    expect(bucketForDate(addDays(today, -1))).toBe('overdue');
    expect(bucketForDate(today)).toBe('today');
    expect(bucketForDate(addDays(today, 3))).toBe('upcoming');
    expect(bucketForDate(addDays(today, 7))).toBe('upcoming');
    expect(bucketForDate(addDays(today, 8))).toBe('later');
  });
});
