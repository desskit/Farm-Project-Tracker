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

export async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string }): Promise<void> {
  if (!ensureConfigured()) return;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
          JSON.stringify(payload),
        );
      } catch (e: any) {
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        }
      }
    }),
  );
}
