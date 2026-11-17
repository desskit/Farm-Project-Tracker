import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { checkIn } from '@/lib/data/equipment';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

/** Bring it back: whoever has it, or a manager (checked in the data layer). */
export async function POST(req: Request, { params }: { params: { assetId: string } }) {
  try {
    const user = await requireCap('farm.view');
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      await checkIn(user, params.assetId);
      return { status: 200, body: { ok: true } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
