import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { toggleTask } from '@/lib/data/projects';
import { errorResponse } from '@/lib/api/errors';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

const schema = z.object({ photoId: z.string().nullable().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    const photoId = parsed.success ? parsed.data.photoId ?? null : null;
    // Especially important here: replaying a *toggle* would flip it back.
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      await toggleTask(user, params.id, photoId);
      return { status: 200, body: { ok: true } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
