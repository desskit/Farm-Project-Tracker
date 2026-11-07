import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import {
  checkTimeZone,
  pendingMigrations,
  preflightMigrations,
  preMigrationSnapshot,
  PRE_MIGRATE_MARKER,
} from './safety';

const REAL_MIGRATIONS = path.resolve(__dirname, '../../db/migrations');

let dir: string;
let open: Client[] = [];
const client = (file: string) => {
  const c = createClient({ url: `file:${file}` });
  open.push(c);
  return c;
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'fpt-safety-'));
});
afterEach(() => {
  for (const c of open) c.close();
  open = [];
  rmSync(dir, { recursive: true, force: true });
});

/** A copy of the real migrations folder holding only the first `n` entries. */
function migrationsUpTo(n: number): string {
  const folder = path.join(dir, `migrations-${n}`);
  cpSync(REAL_MIGRATIONS, folder, { recursive: true });
  const journalPath = path.join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  journal.entries = journal.entries.slice(0, n);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

function journalLength(): number {
  return JSON.parse(readFileSync(path.join(REAL_MIGRATIONS, 'meta', '_journal.json'), 'utf8')).entries.length;
}

describe('checkTimeZone', () => {
  // vitest pins TZ=America/Chicago for this process.
  it('accepts a real farm timezone', () => {
    expect(checkTimeZone({ NODE_ENV: 'production' }).ok).toBe(true);
  });

  it('reports the zone actually in effect', () => {
    expect(checkTimeZone({}).zone).toBe('America/Chicago');
  });
});

describe('pendingMigrations', () => {
  it('treats a fresh database as needing everything', async () => {
    const pending = await pendingMigrations(client(path.join(dir, 'fresh.db')), REAL_MIGRATIONS);
    expect(pending).toHaveLength(journalLength());
  });

  it('lists only what is newer than the last applied migration', async () => {
    const c = client(path.join(dir, 'partial.db'));
    await migrate(drizzle(c), { migrationsFolder: migrationsUpTo(3) });
    const pending = await pendingMigrations(c, REAL_MIGRATIONS);
    expect(pending).toHaveLength(journalLength() - 3);
  });

  it('is empty once everything is applied', async () => {
    const c = client(path.join(dir, 'full.db'));
    await migrate(drizzle(c), { migrationsFolder: REAL_MIGRATIONS });
    expect(await pendingMigrations(c, REAL_MIGRATIONS)).toEqual([]);
  });
});

describe('preMigrationSnapshot', () => {
  it('writes a usable copy and a marker the deploy script can read', async () => {
    const c = client(path.join(dir, 'live.db'));
    await migrate(drizzle(c), { migrationsFolder: REAL_MIGRATIONS });
    await c.execute(`INSERT INTO users (id, name, email, role) VALUES ('u1', 'Sam', 's@x.com', 'worker')`);

    const backups = path.join(dir, 'backups');
    const file = await preMigrationSnapshot(c, backups, ['0010_x'], 1_700_000_000_000);

    const [ts, name] = readFileSync(path.join(backups, PRE_MIGRATE_MARKER), 'utf8').split('\n')[0].split(' ');
    expect(ts).toBe('1700000000000');
    expect(name).toBe(file);
    const copy = client(path.join(backups, file));
    const rows = await copy.execute('SELECT name FROM users');
    expect(rows.rows[0].name).toBe('Sam');
  });

  it('keeps only the most recent few', async () => {
    const c = client(path.join(dir, 'live.db'));
    await c.execute('CREATE TABLE t (x)');
    const backups = path.join(dir, 'backups');
    for (let i = 0; i < 8; i++) await preMigrationSnapshot(c, backups, [], 1_700_000_000_000 + i * 1000);
    const kept = readdirSync(backups).filter((f) => f.startsWith('pre-migrate-') && f.endsWith('.db'));
    expect(kept).toHaveLength(5);
  });
});

describe('preflightMigrations', () => {
  it('migrates a copy and leaves the live database untouched', async () => {
    const livePath = path.join(dir, 'live.db');
    const live = client(livePath);
    await migrate(drizzle(live), { migrationsFolder: migrationsUpTo(3) });
    await live.execute(`INSERT INTO users (id, name, email, role) VALUES ('u1', 'Sam', 's@x.com', 'worker')`);

    const backups = path.join(dir, 'backups');
    const applied = await preflightMigrations(`file:${livePath}`, REAL_MIGRATIONS, backups);

    expect(applied).toHaveLength(journalLength() - 3);
    // The live database still has only the first three migrations applied.
    expect(await pendingMigrations(live, REAL_MIGRATIONS)).toHaveLength(journalLength() - 3);
    // And the rehearsal copy is cleaned up.
    expect(existsSync(backups) ? readdirSync(backups).filter((f) => f.startsWith('preflight-')) : []).toEqual([]);
  });

  it('fails — without touching live data — when a migration would not apply', async () => {
    const livePath = path.join(dir, 'live.db');
    const live = client(livePath);
    await migrate(drizzle(live), { migrationsFolder: REAL_MIGRATIONS });
    await live.execute(`INSERT INTO users (id, name, email, role) VALUES ('u1', 'Sam', 's@x.com', 'worker')`);

    // A new migration that cannot apply to this data: it adds a uniqueness
    // rule that two existing rows already break.
    await live.execute(`INSERT INTO users (id, name, email, role) VALUES ('u2', 'Sam', 's2@x.com', 'worker')`);
    const folder = path.join(dir, 'broken');
    cpSync(REAL_MIGRATIONS, folder, { recursive: true });
    const journalPath = path.join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const last = journal.entries[journal.entries.length - 1];
    journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1000, tag: '9999_breaks' });
    writeFileSync(journalPath, JSON.stringify(journal));
    writeFileSync(path.join(folder, '9999_breaks.sql'), 'CREATE UNIQUE INDEX users_name_unique ON users (name);');

    await expect(preflightMigrations(`file:${livePath}`, folder, path.join(dir, 'backups'))).rejects.toThrow();

    // Live data is exactly as it was: both rows present, migration not recorded.
    expect((await live.execute('SELECT count(*) AS n FROM users')).rows[0].n).toBe(2);
    expect(await pendingMigrations(live, folder)).toEqual(['9999_breaks']);
  });
});
