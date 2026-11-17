import { describe, expect, it } from 'vitest';
import { firstDeliveryFrom, nextDelivery } from './standing';

describe('standing orders', () => {
  it('come round weekly, fortnightly or on the same day each month', () => {
    expect(nextDelivery('2026-11-06', 'week', '2026-11-06')).toBe('2026-11-13');
    expect(nextDelivery('2026-11-06', '2weeks', '2026-11-06')).toBe('2026-11-20');
    expect(nextDelivery('2026-01-31', 'month', '2026-01-31')).toBe('2026-02-28');
    expect(nextDelivery('2026-01-31', 'month', '2026-02-28')).toBe('2026-03-31'); // back to the 31st
    expect(nextDelivery('2026-11-30', 'month', '2026-12-30')).toBe('2027-01-30');
  });
  it('find the first delivery on or after a date', () => {
    expect(firstDeliveryFrom('2026-11-06', 'week', '2026-11-17')).toBe('2026-11-20');
    expect(firstDeliveryFrom('2026-11-20', 'week', '2026-11-17')).toBe('2026-11-20');
  });
});
