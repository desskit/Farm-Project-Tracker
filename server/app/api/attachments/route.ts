import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { saveAttachment, MAX_UPLOAD_BYTES, ALLOWED_MIME } from '@/lib/data/attachments';
import { errorResponse } from '@/lib/api/errors';

const tooLarge = () =>
  NextResponse.json({ error: 'That file is too large (max 8 MB).' }, { status: 413 });

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    // Reject oversized uploads before reading the body — buffering first would
    // let a large file exhaust the container's memory.
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > MAX_UPLOAD_BYTES * 1.1) return tooLarge();

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return tooLarge();
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: 'Only images or PDFs are allowed.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = await saveAttachment(user.id, { buffer, mime: file.type, size: buffer.length });
    return NextResponse.json({ id });
  } catch (e) {
    return errorResponse(e);
  }
}
