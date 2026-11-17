import { describe, expect, it } from 'vitest';
import { isActive, primaryNav, quickActions, simpleNav } from './nav';
import { parseContrastPref, parseLayoutPref } from './brand';

const keys = (role: Parameters<typeof primaryNav>[0]['role']) => primaryNav({ role }).map((i) => i.key);

describe('navigation', () => {
  it('gives each kind of person the right tabs', () => {
    expect(keys('manager')).toEqual(['today', 'work', 'log', 'farm', 'more']);
    expect(keys('worker')).toEqual(['today', 'work', 'log', 'farm', 'more']);
    expect(keys('guest')).toEqual(['today', 'work', 'log', 'more']);
    expect(keys('renter')).toEqual(['home', 'requests', 'rent', 'more']);
  });
  it('labels More as "Me" for people without the team view', () => {
    expect(primaryNav({ role: 'worker' }).at(-1)?.label).toBe('Me');
    expect(primaryNav({ role: 'manager' }).at(-1)?.label).toBe('More');
  });
  it('only offers creating work to people who manage it', () => {
    expect(quickActions({ role: 'worker' }).map((a) => a.key)).toEqual(['supplies', 'animals', 'land', 'upkeep']);
    expect(quickActions({ role: 'manager' }).map((a) => a.key)).toContain('chore');
  });
  it('matches the active tab by path', () => {
    const [today, work] = primaryNav({ role: 'manager' });
    expect(isActive(today, '/')).toBe(true);
    expect(isActive(today, '/chores')).toBe(false);
    expect(isActive(work, '/projects/p1')).toBe(true);
  });
});

describe('simple layout', () => {
  const simple = (role: Parameters<typeof simpleNav>[0]['role']) => simpleNav({ role }).map((i) => i.key);
  it('keeps to a few big tabs, by what each person can do', () => {
    expect(simple('manager')).toEqual(['home', 'rent', 'codes', 'more']);
    expect(simple('worker')).toEqual(['home', 'codes', 'more']);
    expect(simple('renter')).toEqual(['home', 'requests', 'rent', 'more']); // renters keep their portal
  });
  it('reads the per-phone preferences safely', () => {
    expect(parseLayoutPref('simple')).toBe('simple');
    expect(parseLayoutPref('weird')).toBe('full');
    expect(parseContrastPref('high')).toBe('high');
    expect(parseContrastPref('normal')).toBe('normal');
    expect(parseContrastPref(undefined)).toBe('system');
  });
});
