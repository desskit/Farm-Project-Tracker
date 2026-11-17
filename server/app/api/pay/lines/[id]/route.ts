import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { markPayLinePaid } from '@/lib/data/pay';
import { payLinePaidSchema } from '@/lib/api/pay-schemas';

/** The paid-out part was handed over. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('finance.manage');
    const parsed = payLinePaidSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the date.' }, { status: 400 });
    await markPayLinePaid(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
