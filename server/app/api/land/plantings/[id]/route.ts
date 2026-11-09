import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { deletePlanting, setPlantingStatus } from '@/lib/data/land';
import { plantingStatusSchema } from '@/lib/api/land-schemas';


export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('land.log');
    const parsed = plantingStatusSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    await setPlantingStatus(user, params.id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}


export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('land.manage');
    await deletePlanting(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
