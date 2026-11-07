/**
 * Upgrades rehearsed against data shaped like production's, not an empty
 * database: migrate to an older version, insert rows the old code could
 * produce, then apply the rest.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const MIGRATIONS = path.resolve(__dirname, '../db/migrations');
let dir: string;
let c: Client;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'fpt-mig-'));
  c = createClient({ url: `file:${path.join(dir, 'app.db')}` });
});
afterEach(() => {
  c.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Migrations folder truncated to entries whose tag sorts before `beforeTag`. */
function migrationsBefore(beforeTag: string): string {
  const folder = path.join(dir, 'old');
  cpSync(MIGRATIONS, folder, { recursive: true });
  const jp = path.join(folder, 'meta', '_journal.json');
  const j = JSON.parse(readFileSync(jp, 'utf8'));
  j.entries = j.entries.filter((e: { tag: string }) => e.tag < beforeTag);
  writeFileSync(jp, JSON.stringify(j));
  return folder;
}

describe('0010 indexes + rent uniqueness', () => {
  it('collapses duplicate rent charges, keeping the most settled, then enforces uniqueness', async () => {
    await migrate(drizzle(c), { migrationsFolder: migrationsBefore('0010') });
    await c.execute(`INSERT INTO users (id, name, email, role) VALUES ('u1','Sam','s@x','worker'), ('u2','Jo','j@x','worker')`);
    // Sam: three copies of November — one verified, one marked, one unpaid.
    // Jo: two unpaid copies. Plus a normal December charge for Sam.
    await c.execute(`INSERT INTO rent_charges (id, user_id, month, amount, due_date, status) VALUES
      ('a','u1','2026-11',500,'2026-11-01','unpaid'),
      ('b','u1','2026-11',500,'2026-11-01','verified'),
      ('c','u1','2026-11',500,'2026-11-01','marked'),
      ('d','u2','2026-11',450,'2026-11-01','unpaid'),
      ('e','u2','2026-11',450,'2026-11-01','unpaid'),
      ('f','u1','2026-12',500,'2026-12-01','unpaid')`);

    await migrate(drizzle(c), { migrationsFolder: MIGRATIONS });

    const rows = (await c.execute('SELECT id, user_id, month, status FROM rent_charges ORDER BY user_id, month')).rows;
    expect(rows.map((r) => r.id)).toEqual(['b', 'f', 'e']);
    // The kept November charge for Sam is the verified one; Jo keeps the newer.
    await expect(
      c.execute(`INSERT INTO rent_charges (id, user_id, month, amount, due_date, status) VALUES ('g','u1','2026-12',1,'2026-12-01','unpaid')`),
    ).rejects.toThrow();
  });

  it('applies cleanly to a database with no duplicates', async () => {
    await migrate(drizzle(c), { migrationsFolder: migrationsBefore('0010') });
    await c.execute(`INSERT INTO users (id, name, email, role) VALUES ('u1','Sam','s@x','worker')`);
    await c.execute(`INSERT INTO rent_charges (id, user_id, month, amount, due_date, status) VALUES ('a','u1','2026-11',500,'2026-11-01','unpaid')`);
    await migrate(drizzle(c), { migrationsFolder: MIGRATIONS });
    expect((await c.execute('SELECT count(*) AS n FROM rent_charges')).rows[0].n).toBe(1);
    const idx = await c.execute(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%_idx'`);
    expect(idx.rows.length).toBeGreaterThanOrEqual(20);
  });
});
