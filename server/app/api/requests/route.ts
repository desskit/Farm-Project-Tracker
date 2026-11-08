import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { createRequest } from '@/lib/data/requests';
import { errorResponse } from '@/lib/api/errors';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

const schema = z.object({
  title: z.string().trim().min(1).max(140),
  details: z.string().max(4000).optional(),
  urgent: z.boolean().optional(),
  photoId: z.string().max(64).nullable().optional(),
});

/** Send a maintenance request. */
export async function POST(req: Request) {
  try {
    const user = await requireCap('requests.create');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Say briefly what needs fixing.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      const id = await createRequest(user, parsed.data);
      return { status: 200, body: { id } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
