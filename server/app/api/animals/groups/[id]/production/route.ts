import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { logProduction } from '@/lib/data/livestock';
import { productionSchema } from '@/lib/api/livestock-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';


/** Eggs collected, milk, wool — replay-safe for offline logging. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('animals.log');
    const parsed = productionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter how many.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      await logProduction(user, params.id, parsed.data);
      return { status: 200, body: { ok: true } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
