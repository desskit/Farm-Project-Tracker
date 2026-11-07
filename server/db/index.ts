import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

const url = process.env.DATABASE_URL || 'file:./data/app.db';

// libsql opens the file eagerly, so make sure its parent directory exists first
// (the Docker /data volume normally exists, but this keeps local/CI runs safe).
if (url.startsWith('file:')) {
  mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
}

// A single shared client per process. Next.js can re-evaluate modules in dev,
// so cache it on globalThis to avoid opening multiple handles to the file.
const globalForDb = globalThis as unknown as { __fptClient?: ReturnType<typeof createClient> };

export const client = globalForDb.__fptClient ?? createClient({ url });
if (process.env.NODE_ENV !== 'production') globalForDb.__fptClient = client;

export const db = drizzle(client, { schema });
export { schema };

/**
 * Per-database settings, applied once at boot before anything else runs.
 *
 * - WAL: readers (every page load) no longer block the single writer, and
 *   the nightly backup can copy the file while the crew is using the app.
 *   It's stored in the database file itself, so it persists.
 * - busy_timeout: when two writes do collide, wait up to 5s for the lock
 *   instead of failing the request straight away with SQLITE_BUSY.
 * - foreign_keys: the schema's ON DELETE CASCADE / SET NULL rules only work
 *   when this is on; set it explicitly rather than trust the driver default.
 */
export async function configureConnection(): Promise<void> {
  if (url.startsWith('file:')) await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA busy_timeout = 5000');
  await client.execute('PRAGMA foreign_keys = ON');
}

/**
 * Use this instead of `db.transaction`. libsql's local-file client hands its
 * connection to the transaction and opens a fresh one afterwards, which
 * silently drops per-connection settings (busy_timeout goes back to 0 — see
 * test/connection.test.ts). This puts them back however the callback ends.
 */
export async function transaction<T>(fn: Parameters<typeof db.transaction<T>>[0]): Promise<T> {
  try {
    return await db.transaction(fn);
  } finally {
    await configureConnection();
  }
}
