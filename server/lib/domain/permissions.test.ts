import { describe, expect, it } from 'vitest';
import { CAPS, ROLES, can, resolveCaps, toggleable } from './permissions';

describe('permission matrix', () => {
  it('gives admin everything and renters nothing on the farm', () => {
    expect(resolveCaps('admin')).toEqual([...CAPS]);
    expect(can({ role: 'renter' }, 'farm.view')).toBe(false);
    expect(can({ role: 'renter' }, 'requests.create')).toBe(true);
  });

  it('keeps what existing roles could do before permissions existed', () => {
    for (const c of ['work.manage', 'supplies.manage', 'finance.view', 'finance.manage', 'team.view', 'ai.use'] as const) {
      expect(can({ role: 'manager' }, c), c).toBe(true);
      expect(can({ role: 'worker' }, c), c).toBe(false);
    }
    expect(can({ role: 'manager' }, 'people.manage')).toBe(false);
    expect(can({ role: 'manager' }, 'system.admin')).toBe(false);
    expect(can({ role: 'worker' }, 'work.do')).toBe(true);
  });

  it('applies only the switches a role allows', () => {
    expect(toggleable('worker')).toContain('work.manage');
    expect(toggleable('admin')).toEqual([]);
    // Crew can be given work.manage, but never finance or admin.
    const caps = resolveCaps('worker', [
      { cap: 'work.manage', allow: true },
      { cap: 'finance.manage', allow: true },
      { cap: 'system.admin', allow: true },
    ]);
    expect(caps).toContain('work.manage');
    expect(caps).not.toContain('finance.manage');
    expect(caps).not.toContain('system.admin');
    // Family manage work by default; it can be switched off.
    expect(resolveCaps('family', [{ cap: 'work.manage', allow: false }])).not.toContain('work.manage');
  });

  it('uses resolved caps when present instead of role defaults', () => {
    expect(can({ role: 'worker', caps: ['work.manage'] }, 'work.manage')).toBe(true);
    expect(can({ role: 'admin', caps: [] }, 'system.admin')).toBe(false);
    expect(can(null, 'farm.view')).toBe(false);
  });

  it('has a row for every capability and role', () => {
    for (const r of ROLES) expect(() => resolveCaps(r)).not.toThrow();
  });
});

describe('docs/permissions.md', () => {
  it('matches the permission table (regenerate with: npx tsx scripts/permissions-doc.ts)', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const { permissionsMarkdown } = await import('./permissions-doc');
    expect(readFileSync(path.resolve(__dirname, '../../../docs/permissions.md'), 'utf8')).toBe(permissionsMarkdown());
  });
});
