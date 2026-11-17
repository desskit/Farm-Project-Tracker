import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { checkOut } from '@/lib/data/equipment';
import { checkoutSchema } from '@/lib/api/equipment-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

/** Take it out. Replay-safe (scanned in a barn with no signal). */
export async function POST(req: Request, { params }: { params: { assetId: string } }) {
  try {
    const user = await requireCap('work.do');
    const parsed = checkoutSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the return date.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => ({ status: 200, body: { id: await checkOut(user, params.assetId, parsed.data) } }));
  } catch (e) {
    return errorResponse(e);
  }
}
