/**
 * Managing outgoing webhooks (system.admin only). Delivery lives in
 * lib/notify/webhooks.ts.
 */
import 'server-only';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { webhooks } from '@/db/schema';
import { uid } from '@/lib/ids';
import { can } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { isWebhookEvent, webhookUrlProblem } from '@/lib/domain/webhooks';
import { deliverAndRecord } from '@/lib/notify/webhooks';
import { logActivity } from './activity';
import { DataError } from './errors';

export type WebhookRow = typeof webhooks.$inferSelect;
const MAX_HOOKS = 20;

function admin(user: SessionUser) {
  if (!can(user, 'system.admin')) throw new DataError('Only an admin can manage webhooks.', 403);
}

export async function listWebhooks(user: SessionUser): Promise<WebhookRow[]> {
  admin(user);
  return (await db.select().from(webhooks)).sort((a, b) => a.name.localeCompare(b.name));
}

export type WebhookInput = { name: string; url: string; events?: string[] };

function clean(d: WebhookInput) {
  const problem = webhookUrlProblem(d.url);
  if (problem) throw new DataError(problem, 400);
  if (!d.name.trim()) throw new DataError('Give it a name.', 400);
  return { name: d.name.trim(), url: d.url.trim(), events: [...new Set((d.events ?? []).filter(isWebhookEvent))] };
}

export async function addWebhook(user: SessionUser, d: WebhookInput): Promise<string> {
  admin(user);
  const values = clean(d);
  if ((await db.select({ id: webhooks.id }).from(webhooks)).length >= MAX_HOOKS) throw new DataError(`That’s the limit of ${MAX_HOOKS} webhooks.`, 400);
  const id = uid('wh');
  await db.insert(webhooks).values({ id, ...values, secret: randomBytes(24).toString('hex') });
  await logActivity(user.id, `added the webhook "${values.name}"`, { audience: 'system.admin', href: '/more/webhooks' });
  return id;
}

export async function updateWebhook(user: SessionUser, id: string, d: Partial<WebhookInput> & { active?: boolean }): Promise<void> {
  admin(user);
  const [h] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  if (!h) throw new DataError('No such webhook.', 404);
  const values = clean({ name: d.name ?? h.name, url: d.url ?? h.url, events: d.events ?? h.events });
  await db.update(webhooks).set({ ...values, active: d.active ?? h.active }).where(eq(webhooks.id, id));
}

export async function deleteWebhook(user: SessionUser, id: string): Promise<void> {
  admin(user);
  await db.delete(webhooks).where(eq(webhooks.id, id));
}

/** Sends a sample delivery and returns how it went ("200", "Timed out", …). */
export async function testWebhook(user: SessionUser, id: string): Promise<string> {
  admin(user);
  const [h] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  if (!h) throw new DataError('No such webhook.', 404);
  return deliverAndRecord(h, 'test', { title: 'Test from Farm Project Tracker', body: `Sent by ${user.name}`, url: '/more/webhooks' });
}
