import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { saveAttachment } from '@/lib/data/attachments';
import { errorResponse } from '@/lib/api/errors';

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const id = await saveAttachment(user.id, { buffer, mime: file.type, size: buffer.length });
    return NextResponse.json({ id });
  } catch (e) {
    return errorResponse(e);
  }
}
