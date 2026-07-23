import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { updateAsset, deleteAsset } from '@/lib/data/maintenance';
import { updateAssetSchema } from '@/lib/api/maintenance-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = updateAssetSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid asset update.' }, { status: 400 });
    const asset = await updateAsset(user, params.id, parsed.data);
    return NextResponse.json({ asset });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await deleteAsset(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
