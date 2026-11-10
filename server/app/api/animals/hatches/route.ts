import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addHatch } from '@/lib/data/livestock';
import { hatchSchema } from '@/lib/api/livestock-schemas';

/** Eggs set in the incubator (or under a broody hen). */
export async function POST(req: Request) {
  try {
    const user = await requireCap('animals.log');
    const parsed = hatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const id = await addHatch(user, parsed.data);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return errorResponse(e);
  }
}
