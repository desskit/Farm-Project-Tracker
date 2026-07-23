import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { setRent } from '@/lib/data/rent';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ userId: z.string(), amount: z.number(), dueDay: z.number() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A person, amount, and due day are required.' }, { status: 400 });
    await setRent(user, parsed.data.userId, parsed.data.amount, parsed.data.dueDay);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
