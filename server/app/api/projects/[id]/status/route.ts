import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { updateProjectStatus } from '@/lib/data/projects';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ status: z.enum(['idea', 'planned', 'in_progress', 'on_hold', 'done']) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A valid status is required.' }, { status: 400 });
    await updateProjectStatus(user, params.id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
