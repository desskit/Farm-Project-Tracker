import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { reopenRent } from '@/lib/data/rent';
import { errorResponse } from '@/lib/api/errors';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await reopenRent(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
