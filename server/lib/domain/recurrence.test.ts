import { describe, it, expect } from 'vitest';
import { nextOccurrenceAfter, describeSchedule, isActiveSeason } from './recurrence';
import { weekday } from './dates';
import type { Schedule } from '@/db/schema';

describe('nextOccurrenceAfter', () => {
  it('daily rolls forward one day', () => {
    expect(nextOccurrenceAfter({ type: 'daily' }, '2026-07-20')).toBe('2026-07-21');
  });

  it('everyNDays honors n', () => {
    expect(nextOccurrenceAfter({ type: 'everyNDays', n: 3 }, '2026-07-20')).toBe('2026-07-23');
    // n defaults to at least 1
    expect(nextOccurrenceAfter({ type: 'everyNDays', n: 0 }, '2026-07-20')).toBe('2026-07-21');
  });

  it('weekly lands on the next listed weekday', () => {
    // 2026-07-20 is a Monday (1). Next Mon/Thu after Monday is Thursday (2026-07-23).
    expect(weekday('2026-07-20')).toBe(1);
    const sched: Schedule = { type: 'weekly', weekdays: [1, 4] };
    expect(nextOccurrenceAfter(sched, '2026-07-20')).toBe('2026-07-23');
    // From Thursday, next is the following Monday.
    expect(nextOccurrenceAfter(sched, '2026-07-23')).toBe('2026-07-27');
  });

  it('monthly lands on the configured day of the next month', () => {
    expect(nextOccurrenceAfter({ type: 'monthly', day: 1 }, '2026-07-15')).toBe('2026-08-01');
    expect(nextOccurrenceAfter({ type: 'monthly', day: 20 }, '2026-07-15')).toBe('2026-07-20');
  });

  it('clamps to the active season window', () => {
    const sched: Schedule = { type: 'weekly', weekdays: [6], season: { start: '05-01', end: '09-30' } };
    // A December occurrence jumps to next season start (May 1).
    const out = nextOccurrenceAfter(sched, '2026-12-05');
    expect(out >= '2027-05-01').toBe(true);
  });
});

describe('isActiveSeason', () => {
  it('handles normal and year-wrapping windows', () => {
    expect(isActiveSeason({ start: '05-01', end: '09-30' }, '2026-07-04')).toBe(true);
    expect(isActiveSeason({ start: '05-01', end: '09-30' }, '2026-01-04')).toBe(false);
    // wraps the new year (Nov–Feb)
    expect(isActiveSeason({ start: '11-01', end: '02-28' }, '2026-01-15')).toBe(true);
    expect(isActiveSeason({ start: '11-01', end: '02-28' }, '2026-06-15')).toBe(false);
  });
});

describe('describeSchedule', () => {
  it('renders human labels', () => {
    expect(describeSchedule({ type: 'daily' })).toBe('Every day');
    expect(describeSchedule({ type: 'everyNDays', n: 2 })).toBe('Every 2 days');
    expect(describeSchedule({ type: 'weekly', weekdays: [1, 4] })).toBe('Weekly · Mon, Thu');
    expect(describeSchedule({ type: 'monthly', day: 3 })).toBe('Monthly · day 3');
    expect(describeSchedule({ type: 'daily', season: { start: '05-01', end: '09-30' } })).toBe('Every day (seasonal)');
  });
});
