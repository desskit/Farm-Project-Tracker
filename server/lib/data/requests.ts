/**
 * Maintenance requests: renters (and anyone on the farm) report what needs
 * fixing; people with requests.manage triage and close them. Everyone sees
 * their own requests; managers see all.
 */
import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { maintenanceRequests, requestComments, users, type RequestStatus } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { uid } from '@/lib/ids';
import { publishChange } from '@/lib/realtime/bus';
import { pushRequest } from '@/lib/notify/events';
import { recipientsWith } from './recipients';
import { assertOwnUpload } from './attachment-access';
import { logActivity } from './activity';
import { DataError } from './errors';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  open: 'Open',
  in_progress: 'Being worked on',
  done: 'Done',
  declined: 'Declined',
};

export type RequestRow = typeof maintenanceRequests.$inferSelect & { createdByName: string };
export type RequestComment = { id: string; userId: string | null; userName: string; body: string; ts: number };

function seesAll(user: SessionUser) {
  return can(user, 'requests.manage');
}

async function withNames(rows: (typeof maintenanceRequests.$inferSelect)[]): Promise<RequestRow[]> {
  const ids = [...new Set(rows.map((r) => r.createdBy).filter((x): x is string => !!x))];
  const names = ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  return rows.map((r) => ({ ...r, createdByName: (r.createdBy && nameById.get(r.createdBy)) || 'Someone' }));
}

export async function listRequests(viewer: SessionUser): Promise<RequestRow[]> {
  const rows = seesAll(viewer)
    ? await db.select().from(maintenanceRequests).orderBy(desc(maintenanceRequests.updatedAt))
    : await db.select().from(maintenanceRequests).where(eq(maintenanceRequests.createdBy, viewer.id)).orderBy(desc(maintenanceRequests.updatedAt));
  return withNames(rows);
}

/** Open requests count, for managers' badges. */
export async function openRequestCount(): Promise<number> {
  const rows = await db.select({ status: maintenanceRequests.status }).from(maintenanceRequests);
  return rows.filter((r) => r.status === 'open').length;
}

export async function requestForViewer(
  viewer: SessionUser,
  id: string,
): Promise<{ request: RequestRow; comments: RequestComment[] } | null> {
  const rows = await db.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, id)).limit(1);
  const r = rows[0];
  if (!r || (!seesAll(viewer) && r.createdBy !== viewer.id)) return null;
  const comments = await db
    .select({ id: requestComments.id, userId: requestComments.userId, userName: users.name, body: requestComments.body, ts: requestComments.ts })
    .from(requestComments)
    .leftJoin(users, eq(users.id, requestComments.userId))
    .where(eq(requestComments.requestId, id))
    .orderBy(requestComments.ts);
  return {
    request: (await withNames([r]))[0],
    comments: comments.map((c) => ({ ...c, userName: c.userName ?? 'Someone' })),
  };
}

export async function createRequest(
  user: SessionUser,
  data: { title: string; details?: string; urgent?: boolean; photoId?: string | null },
): Promise<string> {
  if (!can(user, 'requests.create')) throw new DataError('You can’t send requests.', 403);
  const title = data.title.trim();
  if (!title) throw new DataError('Say briefly what needs fixing.', 400);
  await assertOwnUpload(user, data.photoId);
  const id = uid('rq');
  await db.insert(maintenanceRequests).values({
    id,
    createdBy: user.id,
    title,
    details: (data.details || '').trim(),
    urgent: !!data.urgent,
    photoId: data.photoId || null,
  });
  await logActivity(user.id, `sent a maintenance request: "${title}"`, { audience: 'requests.manage', href: `/requests/${id}` });
  const managers = (await recipientsWith('requests.manage')).map((m) => m.id);
  await pushRequest(user.id, managers, {
    title: data.urgent ? 'Urgent request' : 'New request',
    body: `${user.name}: ${title}`,
    url: `/requests/${id}`,
  });
  publishChange('request');
  return id;
}

export async function setRequestStatus(user: SessionUser, id: string, status: RequestStatus, note?: string): Promise<void> {
  if (!seesAll(user)) throw new DataError('Only people who handle requests can change their status.', 403);
  const found = await requestForViewer(user, id);
  if (!found) throw new DataError('No such request.', 404);
  const now = Date.now();
  const text = `${REQUEST_STATUS_LABEL[status]}${note?.trim() ? ` — ${note.trim()}` : ''}`;
  await db.batch([
    db.update(maintenanceRequests).set({ status, updatedAt: now }).where(eq(maintenanceRequests.id, id)),
    db.insert(requestComments).values({ id: uid('rc'), requestId: id, userId: user.id, body: text, ts: now }),
  ]);
  if (found.request.createdBy) {
    await pushRequest(user.id, [found.request.createdBy], {
      title: `Request: ${REQUEST_STATUS_LABEL[status]}`,
      body: `${found.request.title}${note?.trim() ? ` — ${note.trim()}` : ''}`,
      url: `/requests/${id}`,
    });
  }
  publishChange('request');
}

export async function addRequestComment(user: SessionUser, id: string, body: string): Promise<void> {
  const found = await requestForViewer(user, id);
  if (!found) throw new DataError('No such request.', 404);
  const text = body.trim();
  if (!text) throw new DataError('Write something first.', 400);
  const now = Date.now();
  await db.batch([
    db.insert(requestComments).values({ id: uid('rc'), requestId: id, userId: user.id, body: text, ts: now }),
    db.update(maintenanceRequests).set({ updatedAt: now }).where(eq(maintenanceRequests.id, id)),
  ]);
  // Tell the other side: the person who asked, or the people who handle it.
  const to =
    found.request.createdBy === user.id
      ? (await recipientsWith('requests.manage')).map((m) => m.id)
      : [found.request.createdBy].filter((x): x is string => !!x);
  await pushRequest(user.id, to, { title: 'New reply on a request', body: `${user.name}: ${text.slice(0, 120)}`, url: `/requests/${id}` });
  publishChange('request');
}
