import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { addMaintenance } from '@/lib/data/maintenance';
import { createMaintenanceSchema } from '@/lib/api/maintenance-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = createMaintenanceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Name and interval are required.' }, { status: 400 });
    const item = await addMaintenance(user, { ...parsed.data, assetId: params.id });
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
