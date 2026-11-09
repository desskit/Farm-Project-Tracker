import { describe, expect, it } from 'vitest';
import { expectedHarvest, phiUntil, plantingProgress, successionDates } from './garden';
import { paddockStatus } from './grazing';

describe('garden', () => {
  it('works out harvest dates and successions', () => {
    expect(expectedHarvest('2026-04-01', 60)).toBe('2026-05-31');
    expect(expectedHarvest('2026-04-01', null)).toBeNull();
    expect(successionDates('2026-04-01', 14, 3)).toEqual(['2026-04-01', '2026-04-15', '2026-04-29']);
    expect(phiUntil('2026-06-01', 7)).toBe('2026-06-08');
    expect(plantingProgress('2026-04-01', '2026-05-01', '2026-04-16')).toEqual({ pct: 50, ready: false, daysLeft: 15 });
    expect(plantingProgress('2026-04-01', '2026-05-01', '2026-05-03').ready).toBe(true);
  });
});

describe('grazing', () => {
  it('rests a paddock until it has had its days', () => {
    expect(paddockStatus({ occupied: true, lastLeftOn: null, restDays: 30 }, '2026-05-01').state).toBe('occupied');
    expect(paddockStatus({ occupied: false, lastLeftOn: null, restDays: 30 }, '2026-05-01').state).toBe('unused');
    expect(paddockStatus({ occupied: false, lastLeftOn: '2026-04-21', restDays: 30 }, '2026-05-01')).toEqual({ state: 'resting', rested: 10, readyOn: '2026-05-21' });
    expect(paddockStatus({ occupied: false, lastLeftOn: '2026-03-01', restDays: 30 }, '2026-05-01').state).toBe('ready');
  });
});
