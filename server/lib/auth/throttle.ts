/**
 * Login throttling / account lockout. Failures are counted per key within a
 * sliding window; once the threshold is hit, the key is locked for a cooldown.
 * The login route checks both the email and the client IP, so neither a single
 * account nor a single source can be brute-forced.
 *
 * State lives in the `auth_throttle` table (survives restarts); stale rows are
 * pruned by the nightly cleanup job.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { authThrottle } from '@/db/schema';

const MAX_FAILURES = 5; // failures within the window before a lockout
const WINDOW_MS = 15 * 60 * 1000; // failures older than this reset the counter
const LOCK_MS = 15 * 60 * 1000; // how long a lockout lasts

export type ThrottleState = { allowed: boolean; retryAfterSec: number };

/** Returns whether the given keys are currently allowed (none locked out). */
export async function checkThrottle(keys: string[]): Promise<ThrottleState> {
  const now = Date.now();
  let retryAfterSec = 0;
  for (const key of keys) {
    const row = (await db.select().from(authThrottle).where(eq(authThrottle.key, key)).limit(1))[0];
    if (row?.lockedUntil && row.lockedUntil > now) {
      retryAfterSec = Math.max(retryAfterSec, Math.ceil((row.lockedUntil - now) / 1000));
    }
  }
  return { allowed: retryAfterSec === 0, retryAfterSec };
}

/**
 * Records a failed attempt against each key, locking it once the threshold is
 * reached. Returns the resulting state (locked or not) so callers can surface a
 * retry-after immediately on the attempt that trips the lock.
 */
export async function recordFailure(keys: string[], opts?: { maxFailures?: number }): Promise<ThrottleState> {
  const now = Date.now();
  const limit = opts?.maxFailures ?? MAX_FAILURES;
  let retryAfterSec = 0;
  for (const key of keys) {
    const row = (await db.select().from(authThrottle).where(eq(authThrottle.key, key)).limit(1))[0];
    if (!row || now - row.firstFailedAt > WINDOW_MS) {
      await db
        .insert(authThrottle)
        .values({ key, failures: 1, firstFailedAt: now, lockedUntil: null })
        .onConflictDoUpdate({ target: authThrottle.key, set: { failures: 1, firstFailedAt: now, lockedUntil: null } });
    } else {
      const failures = row.failures + 1;
      const lockedUntil = failures >= limit ? now + LOCK_MS : null;
      await db.update(authThrottle).set({ failures, lockedUntil }).where(eq(authThrottle.key, key));
      if (lockedUntil) retryAfterSec = Math.max(retryAfterSec, Math.ceil(LOCK_MS / 1000));
    }
  }
  return { allowed: retryAfterSec === 0, retryAfterSec };
}

/** Clears throttle state for the given keys (called on a successful login). */
export async function clearThrottle(keys: string[]): Promise<void> {
  for (const key of keys) {
    await db.delete(authThrottle).where(eq(authThrottle.key, key));
  }
}

/** Extracts the client IP from proxy headers (Caddy sets X-Forwarded-For). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
