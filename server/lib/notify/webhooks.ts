/**
 * Outgoing webhooks: tell another system when something happens on the farm.
 *
 * Safety rules:
 *  - HTTPS only, and never to a private, loopback or link-local address. The
 *    address is checked when the URL is saved and again at connection time
 *    (in the DNS lookup itself), so a name that later points inward is refused.
 *  - Five-second timeout, no redirects followed, response body ignored.
 *  - Each delivery is signed with the hook's secret.
 *  - A failed delivery never breaks whatever caused it.
 */
import 'server-only';
import { createHmac } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns';
import https from 'node:https';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { webhooks } from '@/db/schema';
import { isPrivateAddress, webhookBody, webhookUrlProblem, type WebhookEvent, type WebhookPayload } from '@/lib/domain/webhooks';
import { getSetting, setSetting } from '@/lib/data/settings';
import { addDays, todayISO } from '@/lib/domain/dates';
import { publicUrl } from './email';

type Hook = typeof webhooks.$inferSelect;
type LookupCb = (err: NodeJS.ErrnoException | null, address?: unknown, family?: number) => void;

/** dns.lookup, but an answer inside a private range is an error. */
function guardedLookup(hostname: string, options: object, cb: LookupCb): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = addresses as { address: string; family: number }[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return cb(Object.assign(new Error('That address is on the local network.'), { code: 'EPRIVATE' }));
    }
    if ((options as { all?: boolean }).all) cb(null, list);
    else cb(null, list[0].address, list[0].family);
  });
}

export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** One delivery. Resolves to a short status ("200", "Timed out", …); never rejects. */
export function deliver(hook: Pick<Hook, 'url' | 'secret'>, event: string, payload: WebhookPayload): Promise<string> {
  return new Promise((resolve) => {
    const problem = webhookUrlProblem(hook.url);
    if (problem) return resolve(problem);
    const body = JSON.stringify(webhookBody(event, payload, new Date().toISOString(), publicUrl()));
    let done = false;
    const finish = (s: string) => { if (!done) { done = true; resolve(s); } };
    try {
      const req = https.request(hook.url, {
        method: 'POST',
        timeout: 5000,
        lookup: guardedLookup as never,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'farm-tracker-webhook', 'X-Farm-Event': event, 'X-Farm-Signature': signBody(hook.secret, body) },
      }, (res) => {
        res.resume(); // drain and ignore
        finish(String(res.statusCode ?? 'No response'));
      });
      req.on('timeout', () => { req.destroy(); finish('Timed out'); });
      req.on('error', (e) => finish((e as NodeJS.ErrnoException).code === 'EPRIVATE' ? e.message : 'Could not connect'));
      req.end(body);
    } catch {
      finish('Could not connect');
    }
  });
}

async function record(id: string, status: string): Promise<void> {
  await db.update(webhooks).set({ lastStatus: status, lastAt: Date.now() }).where(eq(webhooks.id, id));
}

/** Send one hook now and note how it went. */
export async function deliverAndRecord(hook: Hook, event: string, payload: WebhookPayload): Promise<string> {
  const status = await deliver(hook, event, payload);
  await record(hook.id, status);
  return status;
}

/** Tell every active hook that wants this event. Fire-and-forget: callers don't wait on the network. */
export async function emitEvent(event: WebhookEvent, payload: WebhookPayload): Promise<void> {
  try {
    const hooks = (await db.select().from(webhooks).where(eq(webhooks.active, true))).filter((h) => !h.events.length || h.events.includes(event));
    for (const h of hooks) void deliverAndRecord(h, event, payload).catch(() => {});
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[webhooks] emit failed', e);
  }
}

const BIRTHS_KEY = 'webhook-births-sent';

/** Daily: births and hatches due within three days, announced once each. */
export async function runBirthHooks(today = todayISO()): Promise<{ sent: number }> {
  const hooks = await db.select({ id: webhooks.id }).from(webhooks).where(eq(webhooks.active, true)).limit(1);
  if (!hooks.length) return { sent: 0 };
  const { livestockAlerts } = await import('@/lib/data/livestock');
  const a = await livestockAlerts(today, 3);
  const sent = (await getSetting<Record<string, string>>(BIRTHS_KEY)) ?? {};
  const keep: Record<string, string> = {};
  for (const [k, d] of Object.entries(sent)) if (d >= addDays(today, -30)) keep[k] = d;
  let count = 0;
  const due = [
    ...a.births.map((b) => ({ id: b.id, title: 'Birth due soon', body: `${b.dam ?? b.groupName} is due around ${b.dueOn}`, url: `/farm/animals/${b.groupId}` })),
    ...a.hatches.filter((h) => h.id.endsWith('-hatch')).map((h) => ({ id: h.id, title: 'Hatch day soon', body: `${h.label}: ${h.date}`, url: '/farm/animals' })),
  ];
  for (const d of due) {
    if (keep[d.id]) continue;
    keep[d.id] = today;
    await emitEvent('birth.due', { title: d.title, body: d.body, url: d.url });
    count++;
  }
  await setSetting(BIRTHS_KEY, keep);
  return { sent: count };
}
