import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addUtilityBill } from '@/lib/data/rentals';
import { billSchema } from '@/lib/api/rentals-schemas';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('rentals.manage');
    const parsed = billSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter the month and amount.' }, { status: 400 });
    const result = await addUtilityBill(user, params.id, parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
