import { describe, expect, it } from 'vitest';
import { compareInspections, lateFeeDue, leaseCoversMonth, leaseStage } from './rentals';
import { shouldSendStage } from '@/lib/notify/staged-reminders';

describe('rentals', () => {
  it('knows which months a lease covers', () => {
    expect(leaseCoversMonth({ startDate: '2026-03-15', endDate: null }, '2026-03')).toBe(true);
    expect(leaseCoversMonth({ startDate: '2026-03-15', endDate: null }, '2026-02')).toBe(false);
    expect(leaseCoversMonth({ startDate: '2026-01-01', endDate: '2026-06-30' }, '2026-07')).toBe(false);
    expect(leaseCoversMonth({ startDate: '2026-01-01', endDate: '2026-06-01' }, '2026-06')).toBe(true);
  });
  it('stages lease-end reminders', () => {
    expect(leaseStage(null, 60, '2026-01-01')).toBeNull();
    expect(leaseStage('2026-06-30', 60, '2026-04-01')).toBeNull();
    expect(leaseStage('2026-06-30', 60, '2026-05-15')).toBe('renewal');
    expect(leaseStage('2026-06-30', 60, '2026-06-20')).toBe('ending');
    expect(leaseStage('2026-06-30', 60, '2026-07-01')).toBe('ended');
  });
  it('charges a late fee only after the grace days', () => {
    expect(lateFeeDue('2026-11-01', '2026-11-06', 5)).toBe(false);
    expect(lateFeeDue('2026-11-01', '2026-11-07', 5)).toBe(true);
  });
  it('flags what got worse between move-in and move-out', () => {
    const c = compareInspections(
      [{ area: 'Kitchen', condition: 'good', notes: '' }, { area: 'Floors', condition: 'fair', notes: '' }],
      [{ area: 'Kitchen', condition: 'poor', notes: 'burn on counter' }, { area: 'Floors', condition: 'fair', notes: '' }, { area: 'Yard', condition: 'good', notes: '' }],
    );
    expect(c.filter((x) => x.worse).map((x) => x.area)).toEqual(['Kitchen']);
    expect(c.find((x) => x.area === 'Yard')?.before).toBeNull();
  });
  it('sends each stage once and repeats only the repeating one', () => {
    expect(shouldSendStage('renewal', null, null, '2026-01-01')).toBe(true);
    expect(shouldSendStage('renewal', 'renewal', '2025-12-01', '2026-01-01')).toBe(false);
    expect(shouldSendStage('overdue', 'overdue', '2026-01-01', '2026-01-08', { stage: 'overdue', everyDays: 7 })).toBe(true);
  });
});
