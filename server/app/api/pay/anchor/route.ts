import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { setPayAnchor } from '@/lib/data/pay';
import { payAnchorSchema } from '@/lib/api/pay-schemas';

/** The day pay periods start (every two weeks from it). */
export async function POST(req: Request) {
  try {
    const user = await requireCap('finance.manage');
    const parsed = payAnchorSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 });
    await setPayAnchor(user, parsed.data.date);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
