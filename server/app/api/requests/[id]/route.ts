import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { setRequestStatus } from '@/lib/data/requests';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'declined']),
  note: z.string().max(2000).optional(),
});

/** Change a request's status (people who handle requests). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('requests.manage');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    await setRequestStatus(user, params.id, parsed.data.status, parsed.data.note);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
