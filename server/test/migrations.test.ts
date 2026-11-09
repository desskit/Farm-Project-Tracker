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

describe('0018 rentals: per-person rent becomes units and leases', () => {
  it('wraps each assignment as a unit + month-to-month lease and moves charges under it', async () => {
    await migrate(drizzle(c), { migrationsFolder: migrationsBefore('0018') });
    await c.execute(`INSERT INTO users (id, name, email, role) VALUES ('u1','Sam','s@x','renter'), ('u2','Jo','j@x','worker'), ('u3','Al','a@x','worker')`);
    await c.execute(`INSERT INTO rent_assignments (user_id, amount, due_day, active) VALUES ('u1', 900, 5, 1), ('u2', 400, 1, 0)`);
    await c.execute(`INSERT INTO rent_charges (id, user_id, month, amount, due_date, status) VALUES
      ('a','u1','2026-09',900,'2026-09-05','verified'),
      ('b','u1','2026-10',900,'2026-10-05','unpaid'),
      ('c','u2','2026-10',400,'2026-10-01','verified'),
      ('d','u3','2026-10',300,'2026-10-01','unpaid')`);
    await c.execute(`INSERT INTO maintenance_requests (id, created_by, title) VALUES ('r1','u1','Leaky tap')`);

    await migrate(drizzle(c), { migrationsFolder: MIGRATIONS });

    const ls = (await c.execute('SELECT id, unit_id, start_date, end_date, rent, due_day, status FROM leases ORDER BY id')).rows;
    expect(ls.map((r) => [r.id, r.unit_id, r.start_date, r.rent, r.due_day, r.status])).toEqual([
      ['ls_u1', 'ru_u1', '2026-09-01', 900, 5, 'active'],
      ['ls_u2', 'ru_u2', '2026-10-01', 400, 1, 'ended'],
    ]);
    expect(ls[0].end_date).toBeNull();
    expect((await c.execute(`SELECT name FROM rental_units WHERE id = 'ru_u1'`)).rows[0].name).toBe("Sam's place");
    expect((await c.execute(`SELECT user_id, is_primary FROM lease_tenants WHERE lease_id = 'ls_u1'`)).rows[0]).toMatchObject({ user_id: 'u1', is_primary: 1 });
    const ch = (await c.execute('SELECT id, lease_id, kind FROM rent_charges ORDER BY id')).rows;
    expect(ch.map((r) => [r.id, r.lease_id, r.kind])).toEqual([['a', 'ls_u1', 'rent'], ['b', 'ls_u1', 'rent'], ['c', 'ls_u2', 'rent'], ['d', null, 'rent']]);
    expect((await c.execute(`SELECT unit_id FROM maintenance_requests WHERE id = 'r1'`)).rows[0].unit_id).toBe('ru_u1');

    // One rent per lease per month; utilities alongside are fine.
    await expect(c.execute(`INSERT INTO rent_charges (id, user_id, lease_id, month, amount, due_date) VALUES ('x','u1','ls_u1','2026-10',1,'2026-10-05')`)).rejects.toThrow();
    await c.execute(`INSERT INTO rent_charges (id, user_id, lease_id, kind, month, amount, due_date) VALUES ('y','u1','ls_u1','utility','2026-10',80,'2026-10-20')`);
    // Charges from before leases keep their one-per-person-per-month rule.
    await expect(c.execute(`INSERT INTO rent_charges (id, user_id, month, amount, due_date) VALUES ('z','u3','2026-10',1,'2026-10-01')`)).rejects.toThrow();
  });
});

describe('0020 dropping the old single-assignee columns', () => {
  it('keeps every chore, task, completion and assignment, and the cascades still work', async () => {
    await migrate(drizzle(c), { migrationsFolder: migrationsBefore('0020') });
    await c.execute(`INSERT INTO users (id, name, email, role) VALUES ('u1','Sam','s@x','worker'), ('u2','Jo','j@x','worker')`);
    await c.execute(`INSERT INTO chores (id, name, schedule, next_due, assigned_to) VALUES ('c1','Feed','{"type":"daily"}','2026-11-01','u1'), ('c2','Water','{"type":"daily"}','2026-11-01',NULL)`);
    await c.execute(`INSERT INTO chore_assignees (chore_id, user_id) VALUES ('c2','u2')`);
    await c.execute(`INSERT INTO chore_completions (id, chore_id, completed_by, date) VALUES ('cc1','c1','u1','2026-10-31'), ('cc2','c2','u2','2026-10-31')`);
    await c.execute(`INSERT INTO projects (id, name) VALUES ('p1','Barn')`);
    await c.execute(`INSERT INTO project_tasks (id, project_id, title, assigned_to) VALUES ('t1','p1','Roof','u2')`);

    await migrate(drizzle(c), { migrationsFolder: MIGRATIONS });

    const cols = (await c.execute(`SELECT name FROM pragma_table_info('chores')`)).rows.map((r) => r.name);
    expect(cols).not.toContain('assigned_to');
    expect((await c.execute('SELECT chore_id, user_id FROM chore_assignees ORDER BY chore_id')).rows.map((r) => [r.chore_id, r.user_id])).toEqual([['c1', 'u1'], ['c2', 'u2']]);
    expect((await c.execute('SELECT task_id, user_id FROM task_assignees')).rows.map((r) => [r.task_id, r.user_id])).toEqual([['t1', 'u2']]);
    expect((await c.execute('SELECT count(*) AS n FROM chore_completions')).rows[0].n).toBe(2);
    expect((await c.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0);
    await c.execute('PRAGMA foreign_keys = ON');
    await c.execute(`DELETE FROM chores WHERE id = 'c1'`);
    expect((await c.execute('SELECT count(*) AS n FROM chore_completions')).rows[0].n).toBe(1);
  });
});
