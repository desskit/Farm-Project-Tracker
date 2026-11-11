import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { cancelLoan } from '@/lib/data/loans';

/** Cancel a loan set up by mistake (only while nothing has been paid). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('finance.manage');
    await cancelLoan(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
