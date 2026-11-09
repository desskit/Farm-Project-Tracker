import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { deleteLandEvent } from '@/lib/data/land';


export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('land.manage');
    await deleteLandEvent(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
