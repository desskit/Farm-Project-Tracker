/**
 * Notice board: short announcements pinned to the top of Today (for the farm)
 * and the renter portal (for tenants). Posting to the farm needs work.manage;
 * to tenants (or everyone) rentals.manage. A notice comes down on its last
 * day or when someone who could have posted it removes it.
 */
import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { notices, users, type NoticeAudience } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { pushToPeople } from '@/lib/notify/events';
import { publishChange } from '@/lib/realtime/bus';
import { logActivity } from './activity';
import { DataError } from './errors';
import { recipientsWith } from './recipients';

export type NoticeRow = typeof notices.$inferSelect & { byName: string | null };

export function canPostNotice(user: SessionUser, audience: NoticeAudience): boolean {
  return audience === 'farm' ? can(user, 'work.manage') : can(user, 'rentals.manage');
}
export function postableAudiences(user: SessionUser): NoticeAudience[] {
  return (['farm', 'tenants', 'everyone'] as NoticeAudience[]).filter((a) => canPostNotice(user, a));
}

async function all(): Promise<NoticeRow[]> {
  const rows = await db.select({ n: notices, byName: users.name }).from(notices).leftJoin(users, eq(users.id, notices.createdBy)).orderBy(desc(notices.createdAt));
  return rows.map((r) => ({ ...r.n, byName: r.byName }));
}

/** Notices this person should see right now. */
export async function noticesFor(viewer: SessionUser, today = todayISO()): Promise<NoticeRow[]> {
  const mine: NoticeAudience = can(viewer, 'farm.view') ? 'farm' : 'tenants';
  return (await all()).filter((n) => (n.audience === mine || n.audience === 'everyone') && (!n.expiresOn || n.expiresOn >= today));
}

/** Everything still up, for the people who manage the board. */
export async function noticesToManage(viewer: SessionUser, today = todayISO()): Promise<NoticeRow[]> {
  return (await all()).filter((n) => canPostNotice(viewer, n.audience) && (!n.expiresOn || n.expiresOn >= today));
}

export async function createNotice(user: SessionUser, d: { title: string; body?: string; audience: NoticeAudience; expiresOn?: string | null }): Promise<string> {
  if (!canPostNotice(user, d.audience)) throw new DataError('You can’t post notices to them.', 403);
  const id = uid('nt');
  await db.insert(notices).values({ id, title: d.title.trim(), body: d.body?.trim() ?? '', audience: d.audience, expiresOn: d.expiresOn || null, createdBy: user.id });
  const farm = d.audience === 'tenants' ? [] : (await recipientsWith('farm.view')).map((r) => r.id);
  let tenants: string[] = [];
  if (d.audience !== 'farm') {
    const onFarm = new Set((await recipientsWith('farm.view')).map((r) => r.id));
    tenants = (await db.select({ id: users.id }).from(users).where(eq(users.active, true))).map((u) => u.id).filter((x) => !onFarm.has(x));
  }
  await pushToPeople([...farm, ...tenants], { title: d.title.trim(), body: d.body?.trim().slice(0, 140) || 'New notice', url: '/' }, user.id);
  await logActivity(user.id, `posted a notice: "${d.title.trim()}"`, { audience: d.audience === 'farm' ? undefined : 'rentals.manage', href: '/more/notices' });
  publishChange('all');
  return id;
}

export async function deleteNotice(user: SessionUser, id: string): Promise<void> {
  const [n] = await db.select().from(notices).where(eq(notices.id, id)).limit(1);
  if (!n) throw new DataError('No such notice.', 404);
  if (!canPostNotice(user, n.audience)) throw new DataError('You can’t take that notice down.', 403);
  await db.delete(notices).where(eq(notices.id, id));
  publishChange('all');
}
