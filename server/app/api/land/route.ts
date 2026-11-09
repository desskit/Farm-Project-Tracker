import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { createUnit } from '@/lib/data/land';
import { unitSchema } from '@/lib/api/land-schemas';

/** Add a garden, bed, pasture, paddock, orchard or field. */
export async function POST(req: Request) {
  try {
    const user = await requireCap('land.manage');
    const parsed = unitSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const result = await createUnit(user, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
