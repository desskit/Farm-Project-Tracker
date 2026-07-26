/**
 * Web Push (VAPID) via web-push. No-op when VAPID_* env is unset. Subscriptions
 * are stored per user; dead subscriptions (410/404) are pruned on send.
 */
import 'server-only';
import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { uid } from '@/lib/ids';

let configured = false;
let checked = false;

function ensureConfigured(): boolean {
  if (checked) return configured;
  checked = true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
  return (configured = true);
}

export function pushConfigured(): boolean {
  return !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}
export function publicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  const existing = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint)).limit(1);
  if (existing.length) {
    await db.update(pushSubscriptions).set({ userId, keys: sub.keys }).where(eq(pushSubscriptions.endpoint, sub.endpoint));
  } else {
    await db.insert(pushSubscriptions).values({ id: uid('ps'), userId, endpoint: sub.endpoint, keys: sub.keys });
  }
}

export type PushResult = {
  /** Devices the push service accepted. */
  delivered: number;
  /** Dead subscriptions removed during this send (browser returned 410/404). */
  pruned: number;
  /** Live subscriptions that failed for some other reason. */
  failed: number;
  /** First real failure, for surfacing to an admin running a test. */
  error: string | null;
};

/** Turns a web-push rejection into something an admin can act on. */
function describePushError(e: unknown): string {
  const err = e as { statusCode?: number; body?: string; message?: string };
  const status = err?.statusCode;
  const detail = (err?.body || err?.message || 'unknown error').toString().trim().slice(0, 200);
  if (status === 401 || status === 403) {
    return `${status} from the push service — the VAPID keys don't match the ones this device subscribed with. Re-enable push on the device after changing keys. (${detail})`;
  }
  if (status === 413) return `413 — payload too large. (${detail})`;
  if (status === 429) return `429 — the push service is rate-limiting this server. (${detail})`;
  return status ? `${status} — ${detail}` : detail;
}

/**
 * Sends to every device a user has registered, reporting what happened.
 * Dead subscriptions are pruned as a side effect, which is why a "no devices
 * left" outcome is meaningful rather than an error.
 */
export async function sendPushToUserVerbose(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<PushResult> {
  const result: PushResult = { delivered: 0, pruned: 0, failed: 0, error: null };
  if (!ensureConfigured()) {
    result.error = 'VAPID keys are not configured on this server.';
    return result;
  }
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
        JSON.stringify(payload),
      );
      result.delivered++;
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        // The browser dropped this subscription — clean it up rather than
        // reporting it as a failure the admin needs to fix.
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        result.pruned++;
      } else {
        result.failed++;
        if (!result.error) result.error = describePushError(e);
      }
    }
  }
  return result;
}

/** Fire-and-forget send used by the digest and event notifications. */
export async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string }): Promise<void> {
  await sendPushToUserVerbose(userId, payload);
}

/** How many devices a user currently has registered for push. */
export async function subscriptionCount(userId: string): Promise<number> {
  const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return rows.length;
}
