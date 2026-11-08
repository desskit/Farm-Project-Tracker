import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { addRequestComment } from '@/lib/data/requests';
import { errorResponse } from '@/lib/api/errors';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

const schema = z.object({ body: z.string().trim().min(1).max(4000) });

/** Reply on a request: the person who sent it, or anyone who handles requests (checked in the data layer). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      await addRequestComment(user, params.id, parsed.data.body);
      return { status: 200, body: { ok: true } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
