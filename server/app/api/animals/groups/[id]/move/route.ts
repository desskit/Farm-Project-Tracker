import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { moveGroup } from '@/lib/data/land';
import { moveSchema } from '@/lib/api/land-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

/** Move a group to another paddock; the move and its location change together. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('land.log');
    const parsed = moveSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      await moveGroup(user, params.id, parsed.data.toUnitId, parsed.data);
      return { status: 200, body: { ok: true } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
