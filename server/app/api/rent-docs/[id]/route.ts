import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { deleteRentDoc } from '@/lib/data/rent-docs';
import { errorResponse } from '@/lib/api/errors';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await deleteRentDoc(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
