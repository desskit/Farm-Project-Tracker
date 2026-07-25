import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { deactivateUser, reactivateUser } from '@/lib/data/users';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ active: z.boolean() });

/** Turns an account off (keeping all history) or back on. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

    if (parsed.data.active) await reactivateUser(params.id);
    else await deactivateUser(params.id, me.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
