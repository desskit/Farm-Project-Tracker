import { describe, expect, it } from 'vitest';
import { allocateCredit, chargeBalance, hoursFrom, payPeriodFor, recentPeriods, splitPay } from './pay';

describe('pay periods', () => {
  it('are two weeks from the anchor, across month and year ends, in either direction', () => {
    expect(payPeriodFor('2026-01-05', '2026-01-05')).toEqual({ start: '2026-01-05', end: '2026-01-18' });
    expect(payPeriodFor('2026-01-05', '2026-01-19')).toEqual({ start: '2026-01-19', end: '2026-02-01' });
    expect(payPeriodFor('2026-01-05', '2026-12-31')).toEqual({ start: '2026-12-21', end: '2027-01-03' });
    expect(payPeriodFor('2026-01-05', '2026-01-04')).toEqual({ start: '2025-12-22', end: '2026-01-04' });
    expect(recentPeriods('2026-01-05', '2026-01-20', 2).map((p) => p.start)).toEqual(['2026-01-19', '2026-01-05']);
  });
});

describe('splitting pay', () => {
  it('follows the person’s rule and never puts more toward rent than is owed', () => {
    expect(splitPay(400, 'none', null, 800)).toEqual({ toRent: 0, paidOut: 400 });
    expect(splitPay(400, 'all', null, 800)).toEqual({ toRent: 400, paidOut: 0 });
    expect(splitPay(400, 'all', null, 150)).toEqual({ toRent: 150, paidOut: 250 });
    expect(splitPay(400, 'fixed', 300, 800)).toEqual({ toRent: 300, paidOut: 100 });
    expect(splitPay(200, 'fixed', 300, 800)).toEqual({ toRent: 200, paidOut: 0 });
    expect(splitPay(400, 'fixed', 300, 0)).toEqual({ toRent: 0, paidOut: 400 });
  });
});

describe('work credits on rent', () => {
  it('pay the oldest charge first, rent before other charges the same day', () => {
    const open = [
      { id: 'water', balance: 40, dueDate: '2026-11-05', kind: 'utility' },
      { id: 'nov', balance: 800, dueDate: '2026-11-05', kind: 'rent' },
      { id: 'oct', balance: 100, dueDate: '2026-10-05', kind: 'rent' },
    ];
    expect(allocateCredit(950, open)).toEqual([
      { chargeId: 'oct', amount: 100, settles: true },
      { chargeId: 'nov', amount: 800, settles: true },
      { chargeId: 'water', amount: 40, settles: true },
    ]);
    expect(allocateCredit(300, open)).toEqual([
      { chargeId: 'oct', amount: 100, settles: true },
      { chargeId: 'nov', amount: 200, settles: false },
    ]);
    expect(chargeBalance(800, 200)).toBe(600);
    expect(chargeBalance(800, 900)).toBe(0);
    expect(hoursFrom(3 * 3600 + 20 * 60)).toBe(3.25);
  });
});
