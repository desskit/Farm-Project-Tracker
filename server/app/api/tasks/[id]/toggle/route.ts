import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { toggleTask } from '@/lib/data/projects';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ photoId: z.string().nullable().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    await toggleTask(user, params.id, parsed.success ? parsed.data.photoId ?? null : null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
