import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addUtilityAccount } from '@/lib/data/rentals';
import { utilitySchema } from '@/lib/api/rentals-schemas';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('rentals.manage');
    const parsed = utilitySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const result = await addUtilityAccount(user, params.id, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
