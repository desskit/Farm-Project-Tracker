/**
 * Who may open a file. Decided from what the file is attached to, and
 * **denied by default**:
 *
 *  - rental paperwork: that renter and people with finance.view;
 *  - project expense receipts: finance.view, or whoever uploaded it;
 *  - anything else on the farm (proof photos, service logs, asset papers,
 *    notes): people who can use the farm app (farm.view) — so renters can't
 *    open farm photos;
 *  - attached to nothing yet: only the uploader (and admins).
 *
 * A file attached to several things must pass every one of them, so linking a
 * lease to a chore can't widen who sees the lease. And people may only attach
 * files they uploaded themselves (assertOwnUpload), which stops that trick at
 * the source.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  assetDocs, attachments, choreCompletions, maintenanceLogs, notes, projectExpenses, projectTasks, rentDocs,
} from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { DataError } from './errors';

type Ref = { kind: 'rent'; renterId: string } | { kind: 'expense' } | { kind: 'farm' };

async function referencesTo(id: string): Promise<Ref[]> {
  const [rent, expense, completion, log, assetDoc, task, note] = await Promise.all([
    db.select({ userId: rentDocs.userId }).from(rentDocs).where(eq(rentDocs.attachmentId, id)),
    db.select({ id: projectExpenses.id }).from(projectExpenses).where(eq(projectExpenses.photoId, id)),
    db.select({ id: choreCompletions.id }).from(choreCompletions).where(eq(choreCompletions.photoId, id)),
    db.select({ id: maintenanceLogs.id }).from(maintenanceLogs).where(eq(maintenanceLogs.photoId, id)),
    db.select({ id: assetDocs.id }).from(assetDocs).where(eq(assetDocs.attachmentId, id)),
    db.select({ id: projectTasks.id }).from(projectTasks).where(eq(projectTasks.donePhotoId, id)),
    db.select({ id: notes.id }).from(notes).where(eq(notes.photoId, id)),
  ]);
  return [
    ...rent.map((r) => ({ kind: 'rent' as const, renterId: r.userId })),
    ...expense.map(() => ({ kind: 'expense' as const })),
    ...[...completion, ...log, ...assetDoc, ...task, ...note].map(() => ({ kind: 'farm' as const })),
  ];
}

export async function canViewAttachment(user: SessionUser, id: string): Promise<boolean> {
  const rows = await db.select({ uploadedBy: attachments.uploadedBy }).from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!rows[0]) return false;
  const uploader = rows[0].uploadedBy === user.id;
  const refs = await referencesTo(id);
  if (!refs.length) return uploader || can(user, 'system.admin');
  return refs.every((r) => {
    if (r.kind === 'rent') return r.renterId === user.id || can(user, 'finance.view');
    if (r.kind === 'expense') return uploader || can(user, 'finance.view');
    return can(user, 'farm.view');
  });
}

/**
 * Throws unless `user` uploaded this file. Call before attaching a file to
 * anything, so nobody can attach (and so expose) a file they found the id of.
 */
export async function assertOwnUpload(user: SessionUser, id: string | null | undefined): Promise<void> {
  if (!id) return;
  const rows = await db.select({ uploadedBy: attachments.uploadedBy }).from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!rows[0] || rows[0].uploadedBy !== user.id) {
    throw new DataError('That file can’t be attached here. Upload it again.', 400);
  }
}

/** Uploads attached to nothing are kept this long (an offline phone may still be sending the rest). */
const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Deletes files uploaded more than a week ago that nothing refers to: photos
 * picked and then abandoned, or left behind when their record was deleted.
 * Returns how many went. Run nightly.
 */
export async function pruneOrphanAttachments(now = Date.now()): Promise<number> {
  const { deleteAttachment } = await import('./attachments');
  const old = await db.select({ id: attachments.id, createdAt: attachments.createdAt }).from(attachments);
  let removed = 0;
  for (const a of old) {
    if (now - a.createdAt < ORPHAN_GRACE_MS) continue;
    if ((await referencesTo(a.id)).length) continue;
    await deleteAttachment(a.id);
    removed++;
  }
  return removed;
}
