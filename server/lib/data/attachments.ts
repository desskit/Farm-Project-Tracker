/**
 * Attachments — proof photos (and future docs) stored as files on disk under
 * UPLOAD_DIR, with metadata in the `attachments` table. Images are resized
 * client-side before upload, so no server-side image processing (or native
 * deps) is needed here.
 */
import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { attachments } from '@/db/schema';
import { uid } from '@/lib/ids';
import { DataError } from './errors';

export type AttachmentRow = typeof attachments.$inferSelect;

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB hard cap
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function extFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  return 'bin';
}

export async function saveAttachment(userId: string, file: { buffer: Buffer; mime: string; size: number }): Promise<string> {
  if (!ALLOWED.has(file.mime)) throw new DataError('Only images or PDFs are allowed.', 400);
  if (file.size > MAX_BYTES) throw new DataError('File is too large (max 8 MB).', 400);

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const id = uid('att');
  const rel = `${id}.${extFor(file.mime)}`;
  await fs.writeFile(path.join(UPLOAD_DIR, rel), file.buffer);
  await db.insert(attachments).values({ id, path: rel, mime: file.mime, size: file.size, uploadedBy: userId });
  return id;
}

export async function getAttachment(id: string): Promise<{ row: AttachmentRow; absPath: string } | null> {
  const rows = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { row, absPath: path.join(UPLOAD_DIR, row.path) };
}

export async function readAttachment(id: string): Promise<{ row: AttachmentRow; data: Buffer } | null> {
  const found = await getAttachment(id);
  if (!found) return null;
  try {
    const data = await fs.readFile(found.absPath);
    return { row: found.row, data };
  } catch {
    return null;
  }
}
