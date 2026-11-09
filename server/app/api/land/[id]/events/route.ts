import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { logLandEvent } from '@/lib/data/land';
import { landEventSchema } from '@/lib/api/land-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

/** Amend, spray (with PHI), prune, water, mow… Replay-safe. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('land.log');
    const parsed = landEventSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      await logLandEvent(user, params.id, parsed.data);
      return { status: 200, body: { ok: true } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
