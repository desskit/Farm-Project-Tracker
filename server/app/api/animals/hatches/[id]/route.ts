import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { updateHatch } from '@/lib/data/livestock';
import { hatchPatchSchema } from '@/lib/api/livestock-schemas';

/** Candling result, a failed clutch, or the hatch itself. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('animals.log');
    const parsed = hatchPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    await updateHatch(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
