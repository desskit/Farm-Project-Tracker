/**
 * Activity log — a running feed of who did what. logActivity() is called from
 * the data-layer mutations (completions, creations, rent/inventory actions),
 * mirroring the prototype's logActivity.
 */
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { activity, users } from '@/db/schema';
import { uid } from '@/lib/ids';
import { publishChange } from '@/lib/realtime/bus';
import { can, type Cap } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';

export type ActivityRow = { id: string; ts: number; userId: string | null; text: string; userName: string; href: string | null };

/**
 * Records something that happened. `audience` is the capability someone needs
 * to see it in the feed (money, people and admin events aren't for everyone);
 * `href` makes the entry a link.
 */
export async function logActivity(
  userId: string | null,
  text: string,
  opts: { audience?: Cap; href?: string } = {},
): Promise<void> {
  // Fire-and-forget: never let a logging failure break the underlying action.
  try {
    await db.insert(activity).values({ id: uid('act'), userId, text, audience: opts.audience ?? null, href: opts.href ?? null });
  } catch {
    /* ignore */
  }
  // Anything worth logging is worth pushing to other devices in real time.
  publishChange('activity');
}

/** The newest entries `viewer` may see, optionally just one person's. */
export async function listActivity(viewer: SessionUser, limit = 40, onlyUserId?: string): Promise<ActivityRow[]> {
  const rows = await db
    .select({ id: activity.id, ts: activity.ts, userId: activity.userId, text: activity.text, userName: users.name, audience: activity.audience, href: activity.href })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.userId))
    .where(onlyUserId ? eq(activity.userId, onlyUserId) : undefined)
    .orderBy(desc(activity.ts))
    .limit(limit * 4);
  return rows
    .filter((r) => (r.audience ? can(viewer, r.audience as Cap) : can(viewer, 'farm.view')))
    .slice(0, limit)
    .map(({ audience: _a, ...r }) => ({ ...r, userName: r.userName ?? 'Someone' }));
}
