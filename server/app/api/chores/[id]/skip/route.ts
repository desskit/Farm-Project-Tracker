import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { skipChore } from '@/lib/data/chores';
import { errorResponse } from '@/lib/api/errors';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

const schema = z.object({ note: z.string().max(500).optional() });

/** Skip this occurrence. Replay-safe: a queued skip sent twice skips once. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('work.do');
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => ({ status: 200, body: { nextDue: await skipChore(user, params.id, parsed.data.note) } }));
  } catch (e) {
    return errorResponse(e);
  }
}
