/**
 * Codebase rules that are easy to break by accident and expensive to find
 * later. Each one explains itself in its failure message.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('conventions', () => {
  it('never calls db.transaction directly (use `transaction` from @/db)', () => {
    const offenders = [...sourceFiles(path.join(ROOT, 'lib')), ...sourceFiles(path.join(ROOT, 'app'))]
      // lib/client is browser code; its `db.transaction` is IndexedDB's.
      .filter((f) => !f.includes(`${path.sep}lib${path.sep}client${path.sep}`))
      .filter((f) => /\bdb\.transaction\(/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f));
    expect(
      offenders,
      'libsql drops busy_timeout after db.transaction(); the helper restores it',
    ).toEqual([]);
  });
});

describe('permissions', () => {
  // Access is decided by capabilities (lib/domain/permissions.ts), never by
  // comparing role names in feature code. Allowed: the permissions module,
  // the last-admin guard in users.ts, tests and seed data.
  it('has no direct role comparisons outside the permission module', () => {
    const allowed = [/lib\/domain\/permissions\.ts$/, /lib\/data\/users\.ts$/, /\.test\.ts$/, /db\/seed\.ts$/];
    const offenders: string[] = [];
    for (const f of ["lib", "app", "components", "db"].flatMap((d) => sourceFiles(path.join(ROOT, d)))) {
      if (allowed.some((a) => a.test(f))) continue;
      const src = readFileSync(f, 'utf8');
      if (/\.role\s*[!=]==\s*'(admin|manager|family|worker|guest|renter)'/.test(src)) offenders.push(path.relative(ROOT, f));
    }
    expect(offenders).toEqual([]);
  });
});

describe('redesign ratchets', () => {
  const ui = () => ['app', 'components'].flatMap((d) => sourceFiles(path.join(ROOT, d))).filter((f) => f.endsWith('.tsx'));

  it('uses in-app dialogs, never the browser prompt/confirm boxes', () => {
    const offenders = ui()
      .filter((f) => !f.endsWith(path.join('components', 'ui', 'dialogs.tsx'))) // the replacement itself
      .filter((f) => /(?<![.\w])(window\.)?(confirm|prompt|alert)\(/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(ROOT, f)), 'use useDialogs() from components/ui').toEqual([]);
  });

  // Inline styles are being replaced by CSS modules screen by screen. This
  // number may only go down: lower it when you remove some.
  const INLINE_STYLE_LIMIT = 85;
  it(`has at most ${INLINE_STYLE_LIMIT} inline style blocks`, () => {
    const n = ui().reduce((sum, f) => sum + (readFileSync(f, 'utf8').match(/style=\{\{/g)?.length ?? 0), 0);
    expect(n).toBeLessThanOrEqual(INLINE_STYLE_LIMIT);
  });
});
