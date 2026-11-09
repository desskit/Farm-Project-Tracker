import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { deleteBreeding, setBreedingStatus } from '@/lib/data/livestock';
import { breedingPatchSchema } from '@/lib/api/livestock-schemas';


export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('animals.manage');
    const parsed = breedingPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    await setBreedingStatus(user, params.id, parsed.data.status, parsed.data.dueOn);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('animals.manage');
    await deleteBreeding(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
