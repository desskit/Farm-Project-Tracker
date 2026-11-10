import { describe, expect, it } from 'vitest';
import { hatchSchedule, nextHatchStep } from './livestock';
import { familyOf, rotationWarning } from './garden';
import { cropCalendar, findCrop, sowNow } from './crops';

describe('hatch schedule', () => {
  it('sets candling, lockdown and hatch day from the species', () => {
    expect(hatchSchedule('chicken', '2026-03-01').map((s) => s.date)).toEqual(['2026-03-08', '2026-03-19', '2026-03-22']);
    expect(hatchSchedule('duck', '2026-03-01')[2].date).toBe('2026-03-29');
    expect(nextHatchStep('chicken', '2026-03-01', '2026-03-10')?.key).toBe('lockdown');
    expect(nextHatchStep('chicken', '2026-03-01', '2026-04-01')).toBeNull();
  });
});

describe('crop rotation', () => {
  it('knows families from loose names', () => {
    expect(familyOf('Cherry tomatoes')).toBe('nightshade');
    expect(familyOf('Bush beans')).toBe('legume');
    expect(familyOf('Sweet potatoes')).toBeNull();
    expect(familyOf('Kale')).toBe('brassica');
    expect(familyOf('Zinnias')).toBeNull();
  });
  it('warns when a family returns within three years', () => {
    const history = [{ crop: 'Potatoes', sownOn: '2025-04-10' }, { crop: 'Lettuce', sownOn: '2026-03-01' }];
    expect(rotationWarning(history, 'Tomatoes', '2026-05-01')).toContain('Potatoes (nightshades) grew here in 2025');
    expect(rotationWarning(history, 'Tomatoes', '2029-05-01')).toBeNull();
    expect(rotationWarning(history, 'Carrots', '2026-05-01')).toBeNull();
  });
});

describe('planting calendar', () => {
  const frost = { lastSpring: '05-01', firstFall: '10-01' };
  it('places windows around the frost dates', () => {
    const t = cropCalendar(findCrop('Tomatoes')!, frost, 2026);
    expect(t.indoors).toEqual({ from: '2026-03-06', to: '2026-03-20' });
    expect(t.outdoors).toEqual({ from: '2026-05-08', to: '2026-06-05' });
    expect(t.fallBy).toBeNull();
    const l = cropCalendar(findCrop('lettuce')!, frost, 2026);
    expect(l.fallBy).toBe('2026-08-03'); // 45 days + 2 weeks before Oct 1
  });
  it('says what to sow today', () => {
    expect(sowNow(frost, '2026-03-10').filter((x) => x.crop.name === 'Tomatoes')[0].how).toBe('indoors');
    expect(sowNow(frost, '2026-07-20').some((x) => x.crop.name === 'Lettuce' && x.how === 'fall')).toBe(true);
    expect(sowNow(frost, '2026-12-25')).toEqual([]);
    expect(findCrop('Bush beans')).toBeNull();
    expect(findCrop('beans')?.name).toBe('Beans (bush)');
  });
});
