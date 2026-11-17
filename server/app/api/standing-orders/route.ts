import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { saveStandingOrder } from '@/lib/data/standing-orders';
import { standingOrderSchema } from '@/lib/api/standing-order-schemas';

export async function POST(req: Request) {
  try {
    const user = await requireCap('sales.log');
    const parsed = standingOrderSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the buyer, price and schedule.' }, { status: 400 });
    return NextResponse.json({ id: await saveStandingOrder(user, null, parsed.data) });
  } catch (e) {
    return errorResponse(e);
  }
}
