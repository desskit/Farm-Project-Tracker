import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addPlantings } from '@/lib/data/land';
import { plantingSchema } from '@/lib/api/land-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

/** Sow or plan a crop (optionally a succession). Replay-safe. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('land.log');
    const parsed = plantingSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      const result = await addPlantings(user, params.id, parsed.data);
      return { status: 200, body: { ids: result } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
