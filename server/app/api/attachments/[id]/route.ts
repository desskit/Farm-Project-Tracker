import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { readAttachment } from '@/lib/data/attachments';
import { canViewAttachment } from '@/lib/data/rent-docs';
import { errorResponse } from '@/lib/api/errors';

/**
 * Auth-checked file serving. Any signed-in user may view proof photos and
 * asset paperwork — that's shared farm work. Rental documents are the
 * exception: a lease is between one renter and the farm, so those are
 * restricted to that renter and managers.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    if (!(await canViewAttachment(user, params.id))) {
      // 404 rather than 403 — no reason to confirm the file exists.
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }
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
