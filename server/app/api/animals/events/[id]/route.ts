import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { deleteEvent } from '@/lib/data/livestock';


export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('animals.manage');
    await deleteEvent(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
