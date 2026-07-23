import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { stopRent } from '@/lib/data/rent';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ userId: z.string() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A person is required.' }, { status: 400 });
    await stopRent(user, parsed.data.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
