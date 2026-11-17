import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { approvePayRun } from '@/lib/data/pay';
import { payRunSchema } from '@/lib/api/pay-schemas';

/** Approve a pay period (writes the pay and the rent credits). */
export async function POST(req: Request) {
  try {
    const user = await requireCap('finance.manage');
    const parsed = payRunSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the amounts.' }, { status: 400 });
    return NextResponse.json({ id: await approvePayRun(user, parsed.data.periodStart, parsed.data.toRent) });
  } catch (e) {
    return errorResponse(e);
  }
}
