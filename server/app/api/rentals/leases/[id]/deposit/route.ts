import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addDepositEntry } from '@/lib/data/rentals';
import { depositSchema } from '@/lib/api/rentals-schemas';

/** Deposit received, a deduction (with its reason) or a refund. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('rentals.manage');
    const parsed = depositSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter an amount.' }, { status: 400 });
    return NextResponse.json({ id: await addDepositEntry(user, params.id, parsed.data) });
  } catch (e) {
    return errorResponse(e);
  }
}
