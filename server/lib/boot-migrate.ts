/**
 * Boot-time setup (imported from instrumentation.ts under the Node runtime).
 * Uses top-level await so the server finishes setup before accepting requests:
 *   1. apply pending DB migrations
 *   2. ensure a first admin exists (from SEED_ADMIN_* env) so login works on a
 *      fresh install — real auth replaces the prototype's user switcher.
 */
import path from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from '@/db';
import { users, notificationPrefs } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { uid } from '@/lib/ids';
import { startCron } from '@/lib/notify/cron';

await migrate(db, { migrationsFolder: path.join(process.cwd(), 'db', 'migrations') });
// eslint-disable-next-line no-console
console.log('[boot] migrations applied');

const anyUser = await db.select({ id: users.id }).from(users).limit(1);
if (!anyUser.length) {
  const email = process.env.SEED_ADMIN_EMAIL;
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
