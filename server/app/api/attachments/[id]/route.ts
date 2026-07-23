import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { readAttachment } from '@/lib/data/attachments';
import { errorResponse } from '@/lib/api/errors';

// Auth-checked file serving. Any signed-in user may view proof photos.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const found = await readAttachment(params.id);
    if (!found) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return new NextResponse(found.data as unknown as BodyInit, {
      headers: {
        'Content-Type': found.row.mime,
        'Cache-Control': 'private, max-age=86400',
        'Content-Disposition': `inline; filename="${found.row.id}"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
