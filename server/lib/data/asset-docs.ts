/**
 * Asset documents — receipts, manuals, and warranties filed against a piece of
 * equipment. Ported from the prototype's assetDocs, but the file itself goes
 * through the shared attachments store instead of being inlined as base64.
 */
import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { assetDocs, users } from '@/db/schema';
import type { AssetDocType } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { deleteAttachment } from './attachments';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';

export { DOC_TYPE_LABELS } from '@/lib/domain/asset-doc-types';

export type AssetDocRow = {
  id: string;
  assetId: string;
  name: string;
  docType: AssetDocType;
  attachmentId: string;
  uploadedBy: string | null;
  uploaderName: string;
  date: string;
  ts: number;
};

function isManager(user: SessionUser): boolean {
  return user.role === 'manager' || user.role === 'admin';
}

export async function listAssetDocs(assetId: string): Promise<AssetDocRow[]> {
  const rows = await db
    .select({
      id: assetDocs.id,
      assetId: assetDocs.assetId,
      name: assetDocs.name,
      docType: assetDocs.docType,
      attachmentId: assetDocs.attachmentId,
      uploadedBy: assetDocs.uploadedBy,
      uploaderName: users.name,
      date: assetDocs.date,
      ts: assetDocs.ts,
    })
    .from(assetDocs)
    .leftJoin(users, eq(users.id, assetDocs.uploadedBy))
    .where(eq(assetDocs.assetId, assetId))
    .orderBy(desc(assetDocs.ts));
  return rows.map((r) => ({ ...r, uploaderName: r.uploaderName ?? 'Someone' }));
}

/** Document counts per asset, for the registry list. */
export async function docCountsByAsset(assetIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of assetIds) out[id] = 0;
  if (!assetIds.length) return out;
  const rows = await db
    .select({ assetId: assetDocs.assetId, n: sql<number>`count(*)` })
    .from(assetDocs)
    .where(inArray(assetDocs.assetId, assetIds))
    .groupBy(assetDocs.assetId);
  for (const r of rows) out[r.assetId] = Number(r.n);
  return out;
}

export async function addAssetDoc(
  user: SessionUser,
  assetId: string,
  data: { name: string; docType: AssetDocType; attachmentId: string },
): Promise<void> {
  const name = (data.name || '').trim() || 'Document';
  await db.insert(assetDocs).values({
    id: uid('doc'),
    assetId,
    name,
    docType: data.docType,
    attachmentId: data.attachmentId,
    uploadedBy: user.id,
    date: todayISO(),
  });
  await logActivity(user.id, `filed a document on an asset`);
  publishChange('asset');
}

/** Deletes a document and the underlying file. Uploader or a manager only. */
export async function deleteAssetDoc(user: SessionUser, id: string): Promise<void> {
  const rows = await db.select().from(assetDocs).where(eq(assetDocs.id, id)).limit(1);
  const doc = rows[0];
  if (!doc) throw new DataError('No such document.', 404);
  if (doc.uploadedBy !== user.id && !isManager(user)) {
    throw new DataError('Only the uploader or a manager can delete this document.', 403);
  }
  await db.delete(assetDocs).where(eq(assetDocs.id, id));
  await deleteAttachment(doc.attachmentId);
  publishChange('asset');
}
