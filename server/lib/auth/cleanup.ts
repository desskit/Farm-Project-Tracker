/**
 * Nightly housekeeping of auth tables: drop expired sessions, consumed/expired
 * invites, and stale throttle rows. Keeps the tables from growing without bound
 * and ensures expired credentials can't linger. Run from the cron scheduler.
 */
import 'server-only';
import { and, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, invites, authThrottle } from '@/db/schema';

export async function cleanupAuthTables(): Promise<void> {
  const now = Date.now();
  // Expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  // Invites that have been used or have expired.
  await db.delete(invites).where(or(isNotNull(invites.usedAt), lt(invites.expiresAt, now)));
  // Throttle rows older than a day that are not currently locked. Actively
  // locked rows are kept until the lock elapses.
  const dayAgo = now - 24 * 60 * 60 * 1000;
  await db
    .delete(authThrottle)
    .where(and(lt(authThrottle.firstFailedAt, dayAgo), or(isNull(authThrottle.lockedUntil), lt(authThrottle.lockedUntil, now))));
}
