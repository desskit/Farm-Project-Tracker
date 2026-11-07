/**
 * Brand plumbing: every brand defines every color token in both modes, and
 * only an admin can switch the farm's brand.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useTestDb, makeUser } from './db';
import { BRANDS } from '@/lib/domain/brand';
import { currentBrand, setBrand } from '@/lib/data/brand';

await useTestDb();

const css = readFileSync(path.resolve(__dirname, '../app/tokens.css'), 'utf8');
const BRAND_TOKENS = [
  '--c-bg', '--c-surface', '--c-surface-2', '--c-text', '--c-text-muted', '--c-border', '--c-border-strong',
  '--c-primary', '--c-primary-hover', '--c-on-primary', '--c-primary-soft', '--c-accent', '--c-on-accent', '--c-accent-soft',
];

/** Declarations inside the first rule whose selector is exactly `selector`. */
function block(selector: string, from = 0): string {
  const i = css.indexOf(`${selector} {`, from);
  if (i < 0) return '';
  return css.slice(i, css.indexOf('}', i));
}

describe('tokens.css', () => {
  for (const b of BRANDS) {
    it(`${b.id} defines every token in light, forced dark and OS dark`, () => {
      const light = block(`[data-brand="${b.id}"]`);
      const dark = block(`[data-brand="${b.id}"][data-theme="dark"]`);
      const osDark = block(`  [data-brand="${b.id}"]:not([data-theme="light"])`);
      for (const t of BRAND_TOKENS) {
        expect(light, `${b.id} light ${t}`).toContain(`${t}:`);
        expect(dark, `${b.id} dark ${t}`).toContain(`${t}:`);
        expect(osDark, `${b.id} os-dark ${t}`).toContain(`${t}:`);
      }
      // The two dark blocks must agree, or "Auto" and "Dark" would differ.
      const decls = (s: string) => s.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('--')).sort();
      expect(decls(osDark)).toEqual(decls(dark));
    });
  }
});

describe('setBrand', () => {
  it('lets an admin pick a known brand and nobody else', async () => {
    expect(await currentBrand()).toBe('meadow');
    const mgr = await makeUser('manager');
    await expect(setBrand(mgr, 'barnyard')).rejects.toThrow(/admin/);
    const admin = await makeUser('admin');
    await expect(setBrand(admin, 'neon')).rejects.toThrow(/Unknown/);
    expect(await setBrand(admin, 'barnyard')).toBe('barnyard');
  });
});
