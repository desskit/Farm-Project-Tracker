import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { snoozeChore } from '@/lib/data/chores';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('work.do');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Pick a day.' }, { status: 400 });
    await snoozeChore(user, params.id, parsed.data.until);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
