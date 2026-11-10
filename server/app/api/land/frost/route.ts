import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { setFrostDates } from '@/lib/data/land';
import { errorResponse } from '@/lib/api/errors';

const md = z.string().regex(/^\d{2}-\d{2}$/);
const schema = z.object({ lastSpring: md, firstFall: md });

/** The farm's average frost dates, which the planting calendar is built from. */
export async function POST(req: Request) {
  try {
    const user = await requireCap('land.manage');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Pick both dates.' }, { status: 400 });
    await setFrostDates(user, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
