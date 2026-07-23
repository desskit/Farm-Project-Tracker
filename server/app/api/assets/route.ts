import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { listAssets, addAsset } from '@/lib/data/maintenance';
import { createAssetSchema } from '@/lib/api/maintenance-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ assets: await listAssets() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = createAssetSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
    const asset = await addAsset(user, parsed.data);
    return NextResponse.json({ asset });
  } catch (e) {
    return errorResponse(e);
  }
}
