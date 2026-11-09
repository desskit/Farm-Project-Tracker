import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { logHarvest } from '@/lib/data/land';
import { harvestSchema } from '@/lib/api/land-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

/** Log a harvest; refused inside a spray’s pre-harvest interval. Replay-safe. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('land.log');
    const parsed = harvestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter how much.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      await logHarvest(user, params.id, parsed.data);
      return { status: 200, body: { ok: true } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
