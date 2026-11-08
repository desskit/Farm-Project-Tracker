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
