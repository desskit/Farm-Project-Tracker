/**
 * Rental paperwork — the lease and everything hanging off it, filed against a
 * renter. Modelled on asset documents, but with tighter access: a lease
 * carries terms and signatures, so unlike a chore's proof photo it is not
 * something the whole crew should be able to read.
 *
 * Access rule throughout: the renter it belongs to, or a manager/admin.
 * Deletion additionally allows whoever uploaded it, matching asset docs.
 */
import 'server-only';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { rentDocs, users } from '@/db/schema';
import type { RentDocType } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { deleteAttachment } from './attachments';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';
import { can } from '@/lib/domain/permissions';
import { assertOwnUpload } from './attachment-access';

export { RENT_DOC_LABELS } from '@/lib/domain/rent-doc-types';

export type RentDocRow = {
  id: string;
  userId: string;
  name: string;
  docType: RentDocType;
  attachmentId: string;
  uploadedBy: string | null;
  uploaderName: string;
  date: string;
  ts: number;
  expiresOn: string | null;
};


/** The renter themselves, or a manager. */
function canAccess(user: SessionUser, renterId: string): boolean {
  return user.id === renterId || can(user, 'finance.view');
}

/** Throws unless `user` may see or add paperwork for `renterId`. */
function assertAccess(user: SessionUser, renterId: string): void {
  if (!canAccess(user, renterId)) {
    throw new DataError('You can only see your own rental documents.', 403);
  }
}

export async function listRentDocs(user: SessionUser, renterId: string): Promise<RentDocRow[]> {
  assertAccess(user, renterId);
  const rows = await db
    .select({
      id: rentDocs.id,
      userId: rentDocs.userId,
      name: rentDocs.name,
      docType: rentDocs.docType,
      attachmentId: rentDocs.attachmentId,
      uploadedBy: rentDocs.uploadedBy,
      uploaderName: users.name,
      date: rentDocs.date,
      ts: rentDocs.ts,
      expiresOn: rentDocs.expiresOn,
    })
    .from(rentDocs)
    .leftJoin(users, eq(users.id, rentDocs.uploadedBy))
    .where(eq(rentDocs.userId, renterId))
    .orderBy(desc(rentDocs.date), desc(rentDocs.ts));
  return rows.map((r) => ({ ...r, uploaderName: r.uploaderName ?? 'Someone' }));
}

/** Document counts per renter, for the rent page's per-person rows. */
export async function docCountsByRenter(renterIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of renterIds) out[id] = 0;
  if (!renterIds.length) return out;
  const rows = await db
    .select({ userId: rentDocs.userId, n: sql<number>`count(*)` })
    .from(rentDocs)
    .where(inArray(rentDocs.userId, renterIds))
    .groupBy(rentDocs.userId);
  for (const r of rows) out[r.userId] = Number(r.n);
  return out;
}

export async function addRentDoc(
  user: SessionUser,
  renterId: string,
  data: { name: string; docType: RentDocType; attachmentId: string; expiresOn?: string | null },
): Promise<void> {
  await assertOwnUpload(user, data.attachmentId);
  assertAccess(user, renterId);
  const renter = await db.select({ id: users.id }).from(users).where(eq(users.id, renterId)).limit(1);
  if (!renter.length) throw new DataError('No such person.', 404);
  const name = (data.name || '').trim() || 'Document';
  await db.insert(rentDocs).values({
    id: uid('rd'),
    userId: renterId,
    name,
    docType: data.docType,
    attachmentId: data.attachmentId,
    uploadedBy: user.id,
    date: todayISO(),
    expiresOn: data.expiresOn || null,
  });
  // Deliberately vague: the activity feed is farm-wide, and which paperwork a
  // renter filed isn't everyone's business.
  await logActivity(user.id, 'filed a rental document', { audience: 'finance.view', href: '/more/rent' });
  publishChange('rent');
}

/** Deletes a document and the underlying file. Uploader, the renter, or a manager. */
export async function deleteRentDoc(user: SessionUser, id: string): Promise<void> {
  const rows = await db.select().from(rentDocs).where(eq(rentDocs.id, id)).limit(1);
  const doc = rows[0];
  if (!doc) throw new DataError('No such document.', 404);
  if (doc.uploadedBy !== user.id && !canAccess(user, doc.userId)) {
    throw new DataError('Only the renter, the uploader, or a manager can delete this.', 403);
  }
  await db.delete(rentDocs).where(eq(rentDocs.id, id));
  await deleteAttachment(doc.attachmentId);
  publishChange('rent');
}

/**
 * Removes every rental document belonging to a renter, files included.
 *
 * Must run *before* the account is deleted. The database would cascade the
 * rows away on its own, but the attachments would survive — and since the
 * access gate below works by looking up the owning `rent_docs` row, a lease
 * whose row had vanished would become readable by anyone signed in. Deleting
 * the files deliberately is what keeps that from happening.
 */
export async function purgeRentDocsFor(userId: string): Promise<number> {
  const docs = await db.select().from(rentDocs).where(eq(rentDocs.userId, userId));
  for (const doc of docs) {
    await db.delete(rentDocs).where(eq(rentDocs.id, doc.id));
    await deleteAttachment(doc.attachmentId);
  }
  return docs.length;
}

/** How many documents a renter has on file — for the removal warning. */
export async function rentDocCountFor(userId: string): Promise<number> {
  const rows = await db.select({ id: rentDocs.id }).from(rentDocs).where(eq(rentDocs.userId, userId));
  return rows.length;
}
