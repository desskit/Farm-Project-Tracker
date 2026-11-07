import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { setBrand } from '@/lib/data/brand';
import { errorResponse } from '@/lib/api/errors';

/** Sets the farm-wide brand chosen in /dev/ui. Body: { brand: BrandId }. */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { brand?: unknown };
    const brand = await setBrand(admin, body.brand);
    return NextResponse.json({ ok: true, brand });
  } catch (e) {
    return errorResponse(e);
  }
}
