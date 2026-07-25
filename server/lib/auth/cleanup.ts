/**
 * Nightly housekeeping of auth tables: drop expired sessions, consumed/expired
 * invites, and stale throttle rows. Keeps the tables from growing without bound
 * and ensures expired credentials can't linger. Run from the cron scheduler.
 */
import 'server-only';
import { and, desc, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, invites, authThrottle, activity } from '@/db/schema';

/** Rows of history to keep; the feed only ever shows the most recent few. */
const ACTIVITY_KEEP = 5000;

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

  // Trim the activity feed so it can't grow without bound over years of use.
  const cutoff = await db
    .select({ ts: activity.ts })
    .from(activity)
    .orderBy(desc(activity.ts))
    .limit(1)
    .offset(ACTIVITY_KEEP);
  if (cutoff[0]) await db.delete(activity).where(lt(activity.ts, cutoff[0].ts));
}
