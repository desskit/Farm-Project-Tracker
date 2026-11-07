/**
 * Boot-time setup (imported from instrumentation.ts under the Node runtime).
 * Uses top-level await so the server finishes setup before accepting requests:
 *   1. refuse to run on the wrong timezone (see lib/boot/safety.ts)
 *   2. in pre-flight mode, test the migrations on a copy and exit
 *   3. snapshot the database, then apply pending migrations
 *   4. ensure a first admin exists (from SEED_ADMIN_* env) so login works on a
 *      fresh install — real auth replaces the prototype's user switcher.
 */
import path from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { db, client } from '@/db';
import { users, notificationPrefs } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import { startCron } from '@/lib/notify/cron';
import {
  backupDir,
  checkTimeZone,
  pendingMigrations,
  preflightMigrations,
  preMigrationSnapshot,
} from '@/lib/boot/safety';

/* eslint-disable no-console */
const migrationsFolder = path.join(process.cwd(), 'db', 'migrations');

function fatal(message: string): never {
  console.error(`[boot] FATAL: ${message}`);
  // Exit rather than throw: a crashed boot is what the healthcheck and the
  // auto-update rollback are built to notice; a half-started server is not.
  process.exit(1);
}

const tz = checkTimeZone();
if (!tz.ok) fatal(tz.message);
console.log(`[boot] ${tz.message} · today is ${todayISO()} · local time ${new Date().toTimeString().slice(0, 5)}`);

if (process.env.MIGRATION_PREFLIGHT === '1') {
  // Run by scripts/auto-update.sh with the NEW image before switching over.
  try {
    const url = process.env.DATABASE_URL || 'file:./data/app.db';
    const applied = await preflightMigrations(url, migrationsFolder, backupDir());
    console.log(`[preflight] ok — ${applied.length ? `would apply ${applied.join(', ')}` : 'no pending migrations'}`);
    process.exit(0);
  } catch (e) {
    console.error('[preflight] FAILED', e);
    process.exit(1);
  }
}

const pending = await pendingMigrations(client, migrationsFolder);
if (pending.length) {
  const hasData = (
    await client.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
  ).rows.length;
  if (hasData) {
    // Migrations only go forward. Without this copy a bad one is unrecoverable,
    // so if it can't be taken (disk full?) don't migrate at all.
    try {
      const file = await preMigrationSnapshot(client, backupDir(), pending);
      console.log(`[boot] snapshot ${file} taken before applying ${pending.length} migration(s)`);
    } catch (e) {
      fatal(`could not snapshot the database before migrating (${e instanceof Error ? e.message : e})`);
    }
  }
  await migrate(db, { migrationsFolder });
  console.log(`[boot] applied ${pending.join(', ')}`);
} else {
  console.log('[boot] database up to date');
}
/* eslint-enable no-console */

const anyUser = await db.select({ id: users.id }).from(users).limit(1);
if (!anyUser.length) {
  // Lower-cased to match how login looks accounts up — otherwise a mixed-case
  // SEED_ADMIN_EMAIL would create an admin who could never sign in.
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Admin';
  if (email && password) {
    const id = uid('u');
    await db.insert(users).values({ id, name, email, role: 'admin', passwordHash: await hashPassword(password) });
    await db.insert(notificationPrefs).values({ userId: id });
    // eslint-disable-next-line no-console
    console.log(`[boot] created first admin: ${email}`);
  } else {
    // eslint-disable-next-line no-console
    console.warn('[boot] no users found and SEED_ADMIN_EMAIL/PASSWORD are unset — set them to create the first admin');
  }
}

// Start the hourly notification scheduler (no-op if email/push aren't configured).
startCron();
