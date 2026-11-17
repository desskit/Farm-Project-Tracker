import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { settleDelivery } from '@/lib/data/standing-orders';
import { deliverySchema } from '@/lib/api/standing-order-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

/** Delivered (records the sale) or skipped. Replay-safe, and a delivery can only be settled once. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('sales.log');
    const parsed = deliverySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => ({
      status: 200,
      body: { saleId: await settleDelivery(user, params.id, parsed.data.forDate, parsed.data.action, parsed.data.paid) },
    }));
  } catch (e) {
    return errorResponse(e);
  }
}
