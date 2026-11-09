import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { logEvent } from '@/lib/data/livestock';
import { eventSchema } from '@/lib/api/livestock-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';


/** Treatments, weights, births, deaths, sales — replay-safe; the data layer checks sale/purchase need animals.manage. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('animals.log');
    const parsed = eventSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      await logEvent(user, params.id, parsed.data);
      return { status: 200, body: { ok: true } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
