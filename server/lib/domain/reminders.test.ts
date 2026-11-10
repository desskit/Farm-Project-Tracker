import { describe, expect, it } from 'vitest';
import { alertsFor } from './weather-alerts';
import { runwayDays, runwayLabel } from './supplies';
import { foldLine, icalText, toICal } from './ical';
import { nextPaddock, overstayDays } from './grazing';
import { renewalStage } from './rentals';

const day = (o: Partial<{ date: string; dow: string; hi: number; lo: number; rainIn: number; rh: number; wind: number }>) =>
  ({ date: '2026-11-10', dow: 'Tue', hi: 60, lo: 45, rainIn: 0, rh: 60, wind: 5, ...o });

describe('weather alerts', () => {
  it('flags frost from tomorrow on, heat, heavy rain and dangerous fire weather', () => {
    const a = alertsFor([
      day({ date: '2026-11-10', lo: 30 }), // today's low already happened: no frost alert
      day({ date: '2026-11-11', dow: 'Wed', lo: 31 }),
      day({ date: '2026-11-12', dow: 'Thu', hi: 99, rainIn: 1.4, rh: 8, wind: 30 }),
      day({ date: '2026-11-13', dow: 'Fri', lo: 10 }), // beyond the horizon
    ]);
    expect(a.map((x) => `${x.kind}|${x.date}`)).toEqual(['frost|2026-11-11', 'heat|2026-11-12', 'rain|2026-11-12', 'fire|2026-11-12']);
    expect(a[0].detail).toBe('Low of 31°F tonight into tomorrow.');
    expect(alertsFor([day({}), day({ date: '2026-11-11', lo: 35 })])).toEqual([]);
    expect(alertsFor([day({}), day({ date: '2026-11-11', lo: 35 })], { frostF: 36, heatF: 95, rainIn: 1 })).toHaveLength(1);
  });
});

describe('feed runway', () => {
  it('estimates days left from recent use', () => {
    const uses = Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(10 - 0 - i > 0 ? 10 - i : 1).padStart(2, '0')}`, amount: 2 }));
    expect(runwayDays(20, [{ date: '2026-11-10', amount: 2 }, { date: '2026-11-04', amount: 12 }], '2026-11-10')).toBe(10); // 14 over 7 days = 2/day
    expect(runwayDays(20, [], '2026-11-10')).toBeNull();
    expect(runwayDays(0, uses, '2026-11-10')).toBe(0);
    expect(runwayDays(20, [{ date: '2026-09-01', amount: 50 }], '2026-11-10')).toBeNull(); // outside the window
    expect(runwayLabel(9)).toBe('about 9 days left');
    expect(runwayLabel(400)).toBeNull();
  });
});

describe('calendar feed', () => {
  it('writes all-day events with escaped text and stable ids', () => {
    const ics = toICal([{ id: 'chore-c1', date: '2026-11-30', title: 'Feed; water, check', url: 'https://farm.test/chores/c1', category: 'Chore' }], { name: 'Farm', host: 'farm.test', now: new Date('2026-11-10T12:00:00Z') });
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('UID:chore-c1-2026-11-30@farm.test');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261130');
    expect(ics).toContain('DTEND;VALUE=DATE:20261201');
    expect(ics).toContain('SUMMARY:Feed\; water\\, check');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(icalText('a\nb')).toBe('a\\nb');
    const folded = foldLine('X'.repeat(200));
    expect(folded.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe('X'.repeat(200));
  });
});

describe('grazing advice', () => {
  it('suggests the longest-rested ready paddock in the same pasture, and counts overstays', () => {
    const opts = [
      { id: 'a', name: 'A', parentId: 'p1', state: 'resting' as const, rested: 10 },
      { id: 'b', name: 'B', parentId: 'p1', state: 'ready' as const, rested: 40 },
      { id: 'c', name: 'C', parentId: 'p1', state: 'ready' as const, rested: 55 },
      { id: 'd', name: 'D', parentId: 'p2', state: 'ready' as const, rested: 90 },
      { id: 'e', name: 'E', parentId: 'p1', state: 'occupied' as const, rested: null },
    ];
    expect(nextPaddock(opts, { id: 'e', parentId: 'p1' })?.id).toBe('c');
    expect(nextPaddock(opts.filter((o) => o.parentId === 'p1' && o.state !== 'ready'), { id: 'e', parentId: 'p1' })).toBeNull();
    expect(overstayDays(9, 5)).toBe(4);
    expect(overstayDays(3, 5)).toBe(0);
    expect(overstayDays(9, null)).toBe(0);
  });
});

describe('renewals', () => {
  it('stages a month out, a week out and after expiry', () => {
    expect(renewalStage('2027-03-01', '2026-11-10')).toBeNull();
    expect(renewalStage('2026-12-05', '2026-11-10')).toBe('month');
    expect(renewalStage('2026-11-15', '2026-11-10')).toBe('week');
    expect(renewalStage('2026-11-09', '2026-11-10')).toBe('expired');
    expect(renewalStage(null, '2026-11-10')).toBeNull();
  });
});
