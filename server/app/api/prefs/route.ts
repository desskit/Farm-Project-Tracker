import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getPrefs, setPrefs } from '@/lib/data/prefs';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({
  email: z.enum(['off', 'daily', 'weekly']).optional(),
  push: z.boolean().optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ prefs: await getPrefs(user.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid preferences.' }, { status: 400 });
    await setPrefs(user.id, parsed.data);
    return NextResponse.json({ ok: true, prefs: await getPrefs(user.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
