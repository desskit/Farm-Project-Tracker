/**
 * How-to guides: ordered steps with photos, attachable to chores, machines,
 * animal groups and places so the instructions are where the work is.
 * Anyone on the farm can read them; writing needs work.manage.
 */
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '@/db';
import { guideLinks, guidePhotos, guides, type GuideParentType, type GuideStep } from '@/db/schema';
import { uid } from '@/lib/ids';
import { can } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { assertOwnUpload } from './attachment-access';
import { DataError } from './errors';

export type GuideRow = typeof guides.$inferSelect;
export type GuideView = GuideRow & { photos: { attachmentId: string; step: number }[]; links: { parentType: GuideParentType; parentId: string }[] };

function need(user: SessionUser) {
  if (!can(user, 'work.manage')) throw new DataError('Only managers can write guides.', 403);
}

export async function listGuides(): Promise<(GuideRow & { photoCount: number })[]> {
  const [rows, photos] = await Promise.all([db.select().from(guides).orderBy(desc(guides.updatedAt)), db.select({ g: guidePhotos.guideId }).from(guidePhotos)]);
  return rows.map((g) => ({ ...g, photoCount: photos.filter((p) => p.g === g.id).length })).sort((a, b) => a.title.localeCompare(b.title));
}

export async function guideById(id: string): Promise<GuideView | null> {
  const [g] = await db.select().from(guides).where(eq(guides.id, id)).limit(1);
  if (!g) return null;
  const [photos, links] = await Promise.all([
    db.select({ attachmentId: guidePhotos.attachmentId, step: guidePhotos.step }).from(guidePhotos).where(eq(guidePhotos.guideId, id)),
    db.select({ parentType: guideLinks.parentType, parentId: guideLinks.parentId }).from(guideLinks).where(eq(guideLinks.guideId, id)),
  ]);
  return { ...g, photos, links };
}

/** Guides attached to one thing (a chore, a machine…). */
export async function guidesFor(parentType: GuideParentType, parentId: string): Promise<{ id: string; title: string; summary: string }[]> {
  const links = await db.select({ id: guideLinks.guideId }).from(guideLinks).where(and(eq(guideLinks.parentType, parentType), eq(guideLinks.parentId, parentId)));
  if (!links.length) return [];
  const rows = await db.select({ id: guides.id, title: guides.title, summary: guides.summary }).from(guides).where(inArray(guides.id, links.map((l) => l.id)));
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

export type GuideInput = { title: string; summary?: string; steps: GuideStep[]; photos?: { attachmentId: string; step: number }[] };

export async function saveGuide(user: SessionUser, id: string | null, d: GuideInput): Promise<string> {
  need(user);
  const steps = d.steps.map((s) => ({ text: s.text.trim() })).filter((s) => s.text);
  if (!steps.length) throw new DataError('Write at least one step.', 400);
  const existing = id ? await guideById(id) : null;
  if (id && !existing) throw new DataError('No such guide.', 404);
  const kept = new Set(existing?.photos.map((p) => p.attachmentId) ?? []);
  const photos = [...new Map((d.photos ?? []).map((p) => [p.attachmentId, p])).values()];
  // Photos already on the guide stay as they are; new ones must be the editor's own uploads.
  for (const p of photos) if (!kept.has(p.attachmentId)) await assertOwnUpload(user, p.attachmentId);
  const gid = id ?? uid('gd');
  const values = { title: d.title.trim(), summary: d.summary?.trim() ?? '', steps, updatedAt: Date.now() };
  const ops: BatchItem<'sqlite'>[] = [
    id ? db.update(guides).set(values).where(eq(guides.id, gid)) : db.insert(guides).values({ id: gid, ...values, createdBy: user.id }),
    db.delete(guidePhotos).where(eq(guidePhotos.guideId, gid)),
    ...photos.map((p) => db.insert(guidePhotos).values({ guideId: gid, attachmentId: p.attachmentId, step: Math.min(Math.max(-1, Math.floor(p.step)), steps.length - 1) })),
  ];
  await db.batch(ops as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return gid;
}

export async function deleteGuide(user: SessionUser, id: string): Promise<void> {
  need(user);
  await db.delete(guides).where(eq(guides.id, id));
}

/** Attach a guide to (or detach it from) a chore, machine, group or place. */
export async function setGuideLink(user: SessionUser, guideId: string, parentType: GuideParentType, parentId: string, on: boolean): Promise<void> {
  need(user);
  if (on) {
    const [g] = await db.select({ id: guides.id }).from(guides).where(eq(guides.id, guideId)).limit(1);
    if (!g) throw new DataError('No such guide.', 404);
    await db.insert(guideLinks).values({ guideId, parentType, parentId }).onConflictDoNothing();
  } else {
    await db.delete(guideLinks).where(and(eq(guideLinks.guideId, guideId), eq(guideLinks.parentType, parentType), eq(guideLinks.parentId, parentId)));
  }
}
