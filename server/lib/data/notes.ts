/**
 * Notes — a running logbook attached to a project, task, or asset. Anyone can
 * add a note (optionally with a photo); the author or a manager can delete one.
 * Mirrors the prototype's notes, backed by the `notes` table.
 */
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { notes, projectTasks, users } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import { capsFor, type SessionUser } from '@/lib/auth/session';
import { findMentions } from '@/lib/domain/mentions';
import { pushToPeople } from '@/lib/notify/events';
import { recipientsWith } from './recipients';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';
import { can } from '@/lib/domain/permissions';
import { assertOwnUpload } from './attachment-access';
import { assertWorkVisible } from './work-access';

export type NoteParentType = 'project' | 'task' | 'asset' | 'chore';
export type NoteRow = {
  id: string;
  parentType: NoteParentType;
  parentId: string;
  userId: string | null;
  userName: string;
  date: string;
  ts: number;
  body: string;
  photoId: string | null;
};


export async function listNotes(parentType: NoteParentType, parentId: string): Promise<NoteRow[]> {
  const rows = await db
    .select({
      id: notes.id,
      parentType: notes.parentType,
      parentId: notes.parentId,
      userId: notes.userId,
      userName: users.name,
      date: notes.date,
      ts: notes.ts,
      body: notes.body,
      photoId: notes.photoId,
    })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.userId))
    .where(and(eq(notes.parentType, parentType), eq(notes.parentId, parentId)))
    .orderBy(desc(notes.ts));
  return rows.map((r) => ({ ...r, userName: r.userName ?? 'Someone' }));
}

/**
 * Notes for many parents of the same type in one query, grouped by parent id —
 * used by list views (a project's tasks) that would otherwise fan out.
 */
export async function listNotesForParents(
  parentType: NoteParentType,
  parentIds: string[],
): Promise<Record<string, NoteRow[]>> {
  const out: Record<string, NoteRow[]> = {};
  if (!parentIds.length) return out;
  const rows = await db
    .select({
      id: notes.id,
      parentType: notes.parentType,
      parentId: notes.parentId,
      userId: notes.userId,
      userName: users.name,
      date: notes.date,
      ts: notes.ts,
      body: notes.body,
      photoId: notes.photoId,
    })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.userId))
    .where(and(eq(notes.parentType, parentType), inArray(notes.parentId, parentIds)))
    .orderBy(desc(notes.ts));
  for (const id of parentIds) out[id] = [];
  for (const r of rows) {
    (out[r.parentId] ??= []).push({ ...r, userName: r.userName ?? 'Someone' });
  }
  return out;
}

export async function addNote(
  user: SessionUser,
  data: { parentType: NoteParentType; parentId: string; body?: string; photoId?: string | null },
): Promise<NoteRow> {
  await assertWorkVisible(user, data.parentType, data.parentId);
  await assertOwnUpload(user, data.photoId);
  const body = (data.body || '').trim();
  if (!body && !data.photoId) throw new DataError('Write a note or attach a photo.', 400);
  const id = uid('note');
  await db.insert(notes).values({
    id,
    parentType: data.parentType,
    parentId: data.parentId,
    userId: user.id,
    date: todayISO(),
    body,
    photoId: data.photoId || null,
  });
  await logActivity(user.id, 'added a note');
  publishChange('note');
  await notifyMentions(user, data.parentType, data.parentId, body);
  const row = (await listNotes(data.parentType, data.parentId)).find((n) => n.id === id);
  return row!;
}

async function noteHref(parentType: NoteParentType, parentId: string): Promise<string> {
  if (parentType === 'chore') return `/chores/${parentId}`;
  if (parentType === 'project') return `/projects/${parentId}`;
  if (parentType === 'asset') return `/maintenance/${parentId}`;
  const [t] = await db.select({ projectId: projectTasks.projectId }).from(projectTasks).where(eq(projectTasks.id, parentId)).limit(1);
  return t ? `/projects/${t.projectId}` : '/projects';
}

/** "@Sam" in a note pushes to Sam — but only if Sam can see the thing the note is on. */
async function notifyMentions(author: SessionUser, parentType: NoteParentType, parentId: string, body: string): Promise<void> {
  if (!body.includes('@')) return;
  const people = await recipientsWith('farm.view');
  const ids = findMentions(body, people).filter((id) => id !== author.id);
  if (!ids.length) return;
  const allowed: string[] = [];
  for (const p of people.filter((x) => ids.includes(x.id))) {
    const viewer: SessionUser = { id: p.id, name: p.name, email: p.email, role: p.role, caps: await capsFor(p.id, p.role) };
    if (await assertWorkVisible(viewer, parentType, parentId).then(() => true, () => false)) allowed.push(p.id);
  }
  if (allowed.length) await pushToPeople(allowed, { title: `${author.name} mentioned you`, body: body.slice(0, 140), url: await noteHref(parentType, parentId) });
}

export async function deleteNote(user: SessionUser, id: string): Promise<void> {
  const rows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  const note = rows[0];
  if (!note) throw new DataError('No such note.', 404);
  if (note.userId !== user.id && !can(user, 'work.manage')) {
    throw new DataError('Only the author or a manager can delete this note.', 403);
  }
  await db.delete(notes).where(eq(notes.id, id));
  publishChange('note');
}
