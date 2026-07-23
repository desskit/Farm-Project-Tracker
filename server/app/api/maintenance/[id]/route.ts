import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { updateMaintenance, deleteMaintenance } from '@/lib/data/maintenance';
import { updateMaintenanceSchema } from '@/lib/api/maintenance-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = updateMaintenanceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid update.' }, { status: 400 });
    const item = await updateMaintenance(user, params.id, parsed.data);
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await deleteMaintenance(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
