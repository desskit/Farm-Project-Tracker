import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { deleteStandingOrder, saveStandingOrder } from '@/lib/data/standing-orders';
import { standingOrderSchema } from '@/lib/api/standing-order-schemas';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('sales.log');
    const parsed = standingOrderSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the buyer, price and schedule.' }, { status: 400 });
    await saveStandingOrder(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('sales.log');
    await deleteStandingOrder(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
