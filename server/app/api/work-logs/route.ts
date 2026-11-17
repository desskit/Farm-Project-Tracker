import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addWorkLog } from '@/lib/data/pay';
import { workLogSchema } from '@/lib/api/pay-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

/** Hours worked, typed in. Replay-safe, so hours logged with no signal aren't counted twice. */
export async function POST(req: Request) {
  try {
    const user = await requireCap('work.do');
    const parsed = workLogSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter the date and hours.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => ({ status: 200, body: { id: await addWorkLog(user, parsed.data) } }));
  } catch (e) {
    return errorResponse(e);
  }
}
