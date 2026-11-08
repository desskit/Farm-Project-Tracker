import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { stopTimer } from '@/lib/data/timers';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ kind: z.enum(['chore', 'task', 'maintenance']), refId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const user = await requireCap('work.do');
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid timer.' }, { status: 400 });
    await stopTimer(user, parsed.data.kind, parsed.data.refId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
