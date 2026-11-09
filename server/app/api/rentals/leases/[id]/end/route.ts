import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { endLease } from '@/lib/data/rentals';
import { endLeaseSchema } from '@/lib/api/rentals-schemas';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('rentals.manage');
    const parsed = endLeaseSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    await endLease(user, params.id, parsed.data.endDate);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
