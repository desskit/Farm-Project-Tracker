import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { deleteNote } from '@/lib/data/notes';
import { errorResponse } from '@/lib/api/errors';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    await deleteNote(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
