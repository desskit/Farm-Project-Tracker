/**
 * Event-driven push — a nudge the moment something happens to *you*, as opposed
 * to the once-a-day digest in ./digest.ts.
 *
 * Design rules, learned from apps that buzz too much:
 *  - Never notify someone about their own action.
 *  - Only notify people with a direct stake (assignee, the person sent back to).
 *  - Respect `eventPush`, which is separate from the digest's `push` switch.
 *  - Never let a failed send break the mutation that triggered it — these are
 *    fire-and-forget from the data layer's point of view.
 */
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { users, notificationPrefs } from '@/db/schema';
import { sendPushToUser, pushConfigured } from './push';

/**
 * Who actually gets a given event push: everyone named who still exists, is
 * active, hasn't opted out, and isn't the person who caused the event.
 * Exported because this filtering is the whole substance of the module.
 */
export async function eventPushRecipients(userIds: string[], exceptUserId: string | null): Promise<string[]> {
  const unique = [...new Set(userIds.filter(Boolean))].filter((id) => id !== exceptUserId);
  if (!unique.length) return [];
  const active = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, unique), eq(users.active, true)));
  const activeIds = active.map((u) => u.id);
  if (!activeIds.length) return [];

  const rows = await db
    .select({ userId: notificationPrefs.userId, eventPush: notificationPrefs.eventPush })
    .from(notificationPrefs)
    .where(inArray(notificationPrefs.userId, activeIds));
  const optedOut = new Set(rows.filter((r) => !r.eventPush).map((r) => r.userId));
  // No prefs row means defaults, and the default is on.
  return activeIds.filter((id) => !optedOut.has(id));
}

/**
 * Sends to everyone in `userIds` except `exceptUserId` (normally the actor).
 * Swallows errors: a notification must never fail the write that caused it.
 */
async function notify(
  userIds: string[],
  exceptUserId: string | null,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const targets = await eventPushRecipients(userIds, exceptUserId);
    await Promise.all(targets.map((id) => sendPushToUser(id, payload)));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[events] push failed', e);
  }
}

/** Someone put you on a chore or task you weren't on before. */
export async function pushAssigned(
  actorId: string,
  userIds: string[],
  what: 'chore' | 'task',
  title: string,
  url: string,
): Promise<void> {
  await notify(userIds, actorId, {
    title: what === 'chore' ? 'New chore for you' : 'New task for you',
    body: title,
    url,
  });
}

/** A manager sent your completed work back for a redo. */
export async function pushSentBack(
  actorId: string,
  workerId: string | null,
  title: string,
  url: string,
  reason?: string,
): Promise<void> {
  if (!workerId) return;
  await notify([workerId], actorId, {
    title: 'Work sent back',
    body: reason ? `${title} — ${reason}` : title,
    url,
  });
}

/** An open item was claimed — the people already on it should know. */
export async function pushClaimed(
  actorId: string,
  actorName: string,
  otherUserIds: string[],
  title: string,
  url: string,
): Promise<void> {
  await notify(otherUserIds, actorId, {
    title: 'Someone joined your job',
    body: `${actorName} picked up ${title}`,
    url,
  });
}

/** A supply crossed its reorder point — managers need to know to restock. */
export async function pushLowStock(actorId: string, itemName: string, qty: number, unit: string): Promise<void> {
  const managers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.active, true));
  const ids = managers.filter((m) => m.role === 'manager' || m.role === 'admin').map((m) => m.id);
  await notify(ids, actorId, {
    title: 'Running low',
    body: `${itemName} is down to ${qty} ${unit}`,
    url: '/more/supplies',
  });
}
