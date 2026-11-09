import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { deleteGroup, saveGroup } from '@/lib/data/vault';
import { errorResponse } from '@/lib/api/errors';
import { groupSchema } from '@/lib/api/vault-schemas';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('people.manage', 'Only admins manage sharing groups.');
    const parsed = groupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Give the group a name.' }, { status: 400 });
    await saveGroup(user, { ...parsed.data, id: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('people.manage', 'Only admins manage sharing groups.');
    await deleteGroup(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
