import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { deleteGuide, saveGuide } from '@/lib/data/guides';
import { guideSchema } from '@/lib/api/people-schemas';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('work.manage');
    const parsed = guideSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A guide needs a title and at least one step.' }, { status: 400 });
    await saveGuide(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('work.manage');
    await deleteGuide(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
