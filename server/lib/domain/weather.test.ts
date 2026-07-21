import { describe, it, expect } from 'vitest';
import { fireDanger } from './weather';

describe('fireDanger (Fosberg FFWI)', () => {
  it('rates hot/dry/windy as extreme and mild/humid/calm as low', () => {
    const extreme = fireDanger(101, 7, 26);
    expect(extreme?.key).toBe('extreme');
    const low = fireDanger(70, 70, 5);
    expect(low?.key).toBe('low');
  });

  it('produces a rising index across worsening conditions', () => {
    const mild = fireDanger(74, 55, 6)!;
    const hot = fireDanger(95, 15, 15)!;
    expect(hot.index).toBeGreaterThan(mild.index);
    expect(hot.rank).toBeGreaterThanOrEqual(mild.rank);
  });

  it('returns null when inputs are missing', () => {
    expect(fireDanger(90, null, 10)).toBeNull();
    expect(fireDanger(null, 20, 10)).toBeNull();
    expect(fireDanger(90, 20, null)).toBeNull();
  });

  it('clamps to the 0..100 range', () => {
    const f = fireDanger(115, 2, 60)!;
    expect(f.index).toBeLessThanOrEqual(100);
    expect(f.index).toBeGreaterThanOrEqual(0);
  });
});
