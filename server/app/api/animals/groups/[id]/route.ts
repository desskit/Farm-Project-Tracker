import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { updateGroup } from '@/lib/data/livestock';
import { groupPatchSchema } from '@/lib/api/livestock-schemas';


export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('animals.manage');
    const parsed = groupPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    await updateGroup(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
