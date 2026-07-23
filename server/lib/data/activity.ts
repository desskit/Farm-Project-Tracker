/**
 * Activity log — a running feed of who did what. logActivity() is called from
 * the data-layer mutations (completions, creations, rent/inventory actions),
 * mirroring the prototype's logActivity.
 */
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { activity, users } from '@/db/schema';
import { uid } from '@/lib/ids';

export type ActivityRow = { id: string; ts: number; userId: string | null; text: string; userName: string };

export async function logActivity(userId: string | null, text: string): Promise<void> {
  // Fire-and-forget: never let a logging failure break the underlying action.
  try {
    await db.insert(activity).values({ id: uid('act'), userId, text });
  } catch {
    /* ignore */
  }
}

export async function listActivity(limit = 40): Promise<ActivityRow[]> {
  const rows = await db
    .select({ id: activity.id, ts: activity.ts, userId: activity.userId, text: activity.text, userName: users.name })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.userId))
    .orderBy(desc(activity.ts))
    .limit(limit);
  return rows.map((r) => ({ ...r, userName: r.userName ?? 'Someone' }));
}
