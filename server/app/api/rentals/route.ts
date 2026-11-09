import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { createRentalUnit } from '@/lib/data/rentals';
import { rentalUnitSchema } from '@/lib/api/rentals-schemas';

export async function POST(req: Request) {
  try {
    const user = await requireCap('rentals.manage');
    const parsed = rentalUnitSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const result = await createRentalUnit(user, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
