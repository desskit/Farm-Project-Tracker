/**
 * Notes — a running logbook attached to a project, task, or asset. Anyone can
 * add a note (optionally with a photo); the author or a manager can delete one.
 * Mirrors the prototype's notes, backed by the `notes` table.
 */
import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { notes, users } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';

export type NoteParentType = 'project' | 'task' | 'asset';
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

function isManager(user: SessionUser): boolean {
  return user.role === 'manager' || user.role === 'admin';
}

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

export async function addNote(
  user: SessionUser,
  data: { parentType: NoteParentType; parentId: string; body?: string; photoId?: string | null },
): Promise<NoteRow> {
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
  const row = (await listNotes(data.parentType, data.parentId)).find((n) => n.id === id);
  return row!;
}

export async function deleteNote(user: SessionUser, id: string): Promise<void> {
  const rows = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  const note = rows[0];
  if (!note) throw new DataError('No such note.', 404);
  if (note.userId !== user.id && !isManager(user)) {
    throw new DataError('Only the author or a manager can delete this note.', 403);
  }
  await db.delete(notes).where(eq(notes.id, id));
  publishChange('note');
}
