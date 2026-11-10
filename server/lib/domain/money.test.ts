import { describe, expect, it } from 'vitest';
import { depositBalance, suggestedBuy, unitCost, weightedUnitCost } from './money';

describe('money maths', () => {
  it('averages cost per unit when buying more', () => {
    expect(weightedUnitCost(10, 2, 10, 40)).toBe(3); // 10 @ $2 + 10 @ $4
    expect(weightedUnitCost(0, 2, 5, 15)).toBe(3);
    expect(weightedUnitCost(4, null, 5, 15)).toBe(3);
    expect(weightedUnitCost(4, 2, 0, 15)).toBe(2);
  });
  it('suggests how much to buy', () => {
    expect(suggestedBuy(3, 5, null)).toBe(7); // back to twice the reorder point
    expect(suggestedBuy(12, 5, 4)).toBe(108); // 30 days at 4 a day, less what's there
    expect(suggestedBuy(50, 5, 0.1)).toBe(0);
  });
  it('keeps the deposit balance and unit costs', () => {
    expect(depositBalance([{ kind: 'received', amount: 800 }, { kind: 'deduction', amount: 120.5 }, { kind: 'refund', amount: 679.5 }])).toBe(0);
    expect(unitCost(42, 20)).toBe(2.1);
    expect(unitCost(42, 0)).toBeNull();
  });
});
