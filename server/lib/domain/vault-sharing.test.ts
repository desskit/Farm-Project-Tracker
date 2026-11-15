import { describe, expect, it } from 'vitest';
import { accessFor, accessUntil, dedupeShares, type Share, type Viewer } from './vault-sharing';

const T = '2026-11-15';
const sam: Viewer = { id: 'sam', role: 'worker', onFarm: true, groups: new Set(['g-shop']) };
const rae: Viewer = { id: 'rae', role: 'renter', onFarm: false, groups: new Set() };
const share = (type: Share['type'], target = '', canEdit = false, expiresOn: string | null = null): Share => ({ type, target, canEdit, expiresOn });

describe('vault sharing', () => {
  it('nobody but the owner sees an entry shared with nobody', () => {
    expect(accessFor('max', [], sam, T)).toBeNull();
    expect(accessFor('sam', [], sam, T)).toBe('owner');
  });

  it('matches people, groups, roles, the farm and everyone', () => {
    expect(accessFor('max', [share('user', 'sam')], sam, T)).toBe('view');
    expect(accessFor('max', [share('user', 'kim')], sam, T)).toBeNull();
    expect(accessFor('max', [share('group', 'g-shop')], sam, T)).toBe('view');
    expect(accessFor('max', [share('role', 'worker')], sam, T)).toBe('view');
    expect(accessFor('max', [share('role', 'family')], sam, T)).toBeNull();
    expect(accessFor('max', [share('farm')], rae, T)).toBeNull();
    expect(accessFor('max', [share('everyone')], rae, T)).toBe('view');
  });

  it('gives the strongest access any live line grants', () => {
    expect(accessFor('max', [share('farm'), share('user', 'sam', true)], sam, T)).toBe('edit');
    // Edit can't ride on a whole-farm or everyone line.
    expect(accessFor('max', [share('everyone', '', true)], rae, T)).toBe('view');
  });

  it('stops after the last day', () => {
    const until = share('user', 'sam', true, '2026-11-15');
    expect(accessFor('max', [until], sam, T)).toBe('edit');
    expect(accessFor('max', [until], sam, '2026-11-16')).toBeNull();
    expect(accessUntil([until], sam, T)).toBe('2026-11-15');
    expect(accessUntil([until, share('farm')], sam, T)).toBeNull(); // the farm line has no end
  });

  it('keeps one line per target', () => {
    const out = dedupeShares([share('user', 'sam'), share('user', 'sam', true), share('farm', 'junk'), share('everyone', '', true)]);
    expect(out).toEqual([share('user', 'sam', true), share('farm'), share('everyone')]);
  });
});
