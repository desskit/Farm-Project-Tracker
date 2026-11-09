import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { updateUnit } from '@/lib/data/land';
import { unitPatchSchema } from '@/lib/api/land-schemas';


export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('land.manage');
    const parsed = unitPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    await updateUnit(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
