import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { addNote } from '@/lib/data/notes';
import { errorResponse } from '@/lib/api/errors';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

const schema = z.object({
  parentType: z.enum(['project', 'task', 'asset']),
  parentId: z.string().min(1),
  body: z.string().optional(),
  photoId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid note.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      const note = await addNote(user, parsed.data);
      return { status: 200, body: { note } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
