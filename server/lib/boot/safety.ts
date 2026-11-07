/**
 * Boot-time safety checks, kept out of lib/boot-migrate.ts so they can be
 * tested against a temp database.
 *
 *  - Timezone: every "today" in the app is the server's local date, so a
 *    container left on UTC puts a US farm on tomorrow's date every evening,
 *    and the nightly jobs fire mid-workday. Production refuses to start on UTC
 *    unless that is explicitly intended.
 *  - Pre-migration snapshot: migrations only go forward. Before applying any,
 *    take a consistent copy (VACUUM INTO) and leave a marker naming it, so the
 *    auto-update script can put the database back if the new version then
 *    fails its healthcheck.
 *  - Pre-flight: run the pending migrations against a *copy* of the live
 *    database and exit. The auto-update script does this with the new image
 *    before switching anything over, so a migration that would fail on real
 *    data never touches real data.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Etc/Universal', 'Universal', 'Zulu']);

/** The zone the process is really using. An invalid TZ silently becomes UTC, so read it back. */
export function effectiveTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export type TzCheck = { ok: boolean; zone: string; message: string };

export function checkTimeZone(env: Record<string, string | undefined> = process.env): TzCheck {
  const zone = effectiveTimeZone();
  const isUtc = UTC_ZONES.has(zone);
  if (!isUtc) return { ok: true, zone, message: `timezone ${zone}` };
  if (env.ALLOW_UTC === '1') return { ok: true, zone, message: `timezone ${zone} (allowed by ALLOW_UTC=1)` };
  if (env.NODE_ENV !== 'production') {
    return { ok: true, zone, message: `timezone ${zone} — fine for development, but set TZ in production` };
  }
  return {
    ok: false,
    zone,
    message:
      `the server is running on ${zone}${env.TZ ? ` (TZ="${env.TZ}" was not recognised)` : ''}. ` +
      `"Today", due dates and every scheduled job would be on the wrong day each evening. ` +
      `Set TZ in .env to the farm's timezone (e.g. TZ=America/Chicago), or ALLOW_UTC=1 if UTC is really intended.`,
  };
}

/** Where backups (and pre-migration snapshots) live — matches lib/backup.ts. */
export function backupDir(env: Record<string, string | undefined> = process.env): string {
  const uploads = env.UPLOAD_DIR || './data/uploads';
  return env.BACKUP_DIR || path.join(path.dirname(uploads), 'backups');
}

type Journal = { entries: { tag: string; when: number }[] };

/**
 * How many migrations in the folder haven't been applied yet. Drizzle applies
 * every journal entry newer than the latest it has recorded, so compare
 * against that timestamp rather than counting rows.
 */
export async function pendingMigrations(client: Client, migrationsFolder: string): Promise<string[]> {
  const journal = JSON.parse(
    await fs.readFile(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;
  let lastApplied = -1;
  try {
    const r = await client.execute('SELECT max(created_at) AS last FROM __drizzle_migrations');
    const v = r.rows[0]?.last;
    if (v != null) lastApplied = Number(v);
  } catch {
    // No migrations table yet: a fresh database, everything is pending.
  }
  return journal.entries.filter((e) => e.when > lastApplied).map((e) => e.tag);
}

function sqlString(p: string): string {
  return `'${p.replace(/'/g, "''")}'`;
}

/** Consistent point-in-time copy of the database, safe while it's being written. */
export async function snapshotTo(client: Client, dest: string): Promise<number> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rm(dest, { force: true });
  await client.execute(`VACUUM INTO ${sqlString(dest)}`);
  return (await fs.stat(dest)).size;
}

export const PRE_MIGRATE_MARKER = 'pre-migrate-latest.txt';
const KEEP_PRE_MIGRATE = 5;

/**
 * Snapshot before migrating, and record it in a one-line marker
 * ("<epoch-ms> <filename>") the auto-update script can read without JSON.
 */
export async function preMigrationSnapshot(
  client: Client,
  dir: string,
  pending: string[],
  now = Date.now(),
): Promise<string> {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const file = `pre-migrate-${stamp}.db`;
  await snapshotTo(client, path.join(dir, file));
  await fs.writeFile(path.join(dir, PRE_MIGRATE_MARKER), `${now} ${file}\n# before: ${pending.join(', ')}\n`);

  // Keep a handful; each one is a full copy of the database.
  const old = (await fs.readdir(dir))
    .filter((f) => /^pre-migrate-.*\.db$/.test(f))
    .sort()
    .reverse()
    .slice(KEEP_PRE_MIGRATE);
  for (const f of old) await fs.rm(path.join(dir, f), { force: true });
  return file;
}

/**
 * Copy the live database, migrate the copy, check it, delete it. Throws if
 * the migrations fail or leave the copy corrupt; never writes to `liveUrl`.
 */
export async function preflightMigrations(liveUrl: string, migrationsFolder: string, dir: string): Promise<string[]> {
  const live = createClient({ url: liveUrl });
  const copyPath = path.join(dir, `preflight-${Date.now()}.db`);
  try {
    const pending = await pendingMigrations(live, migrationsFolder);
    await snapshotTo(live, copyPath);
    const copy = createClient({ url: `file:${copyPath}` });
    try {
      await copy.execute('PRAGMA foreign_keys = ON');
      await migrate(drizzle(copy), { migrationsFolder });
      const check = await copy.execute('PRAGMA integrity_check');
      const verdict = String(check.rows[0]?.integrity_check ?? check.rows[0]?.[0] ?? '');
      if (verdict !== 'ok') throw new Error(`integrity_check after migrating: ${verdict}`);
      const fk = await copy.execute('PRAGMA foreign_key_check');
      if (fk.rows.length) throw new Error(`${fk.rows.length} foreign-key violation(s) after migrating`);
    } finally {
      copy.close();
    }
    return pending;
  } finally {
    live.close();
    await fs.rm(copyPath, { force: true });
    await fs.rm(`${copyPath}-wal`, { force: true });
    await fs.rm(`${copyPath}-shm`, { force: true });
  }
}
