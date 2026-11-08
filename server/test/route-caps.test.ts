/**
 * Every API route decides access on purpose:
 *  - public routes (sign-in, invite, health) are listed here and in middleware;
 *  - a few routes serve everyone signed in, renters included (their own rent,
 *    files, settings, live updates) and may use plain requireUser();
 *  - everything else must name a capability (requireCap / requireAdmin), so a
 *    renter or guest can't reach farm features just by being signed in.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CAPS } from '@/lib/domain/permissions';

const API = path.resolve(__dirname, '../app/api');
const PUBLIC = ['auth/login', 'auth/logout', 'auth/forgot-password', 'invite/[token]', 'health'];
const ANY_SIGNED_IN = [
  'attachments', 'attachments/[id]', 'auth/change-password', 'events', 'prefs', 'push/public-key', 'push/subscribe',
  'preview/stop',
  'requests/[id]/comments', // the sender or a handler; requestForViewer decides
  'rent/[id]/mark', 'rent/[id]/reopen', 'rent/[id]/verify', 'rent/assign', 'rent/stop', 'rent-docs', 'rent-docs/[id]',
];

function routes(dir = API, base = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routes(p, base ? `${base}/${name}` : name));
    else if (name === 'route.ts') out.push(base);
  }
  return out;
}

describe('API route access', () => {
  const all = routes();

  it('every non-public route checks who is asking', () => {
    const unguarded = all.filter((r) => !PUBLIC.includes(r)).filter((r) => {
      const src = readFileSync(path.join(API, r, 'route.ts'), 'utf8');
      return !/require(User|Cap|Admin)\(|getRealSessionUser\(/.test(src);
    });
    expect(unguarded).toEqual([]);
  });

  it('farm routes name a capability instead of "anyone signed in"', () => {
    const loose = all
      .filter((r) => !PUBLIC.includes(r) && !ANY_SIGNED_IN.includes(r))
      .filter((r) => /requireUser\(/.test(readFileSync(path.join(API, r, 'route.ts'), 'utf8')));
    expect(loose, 'use requireCap(...) or add the route to ANY_SIGNED_IN with a reason').toEqual([]);
  });

  it('only uses capabilities that exist', () => {
    const used = all.flatMap((r) =>
      [...readFileSync(path.join(API, r, 'route.ts'), 'utf8').matchAll(/requireCap\('([^']+)'/g)].map((m) => m[1]),
    );
    expect(used.filter((c) => !(CAPS as readonly string[]).includes(c))).toEqual([]);
  });

  it('public routes are the ones middleware lets through', () => {
    const mw = readFileSync(path.resolve(__dirname, '../middleware.ts'), 'utf8');
    for (const r of PUBLIC) expect(mw, r).toContain(`/api/${r.split('/')[0]}`);
  });
});
