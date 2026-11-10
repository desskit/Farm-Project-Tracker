import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { setWeatherThresholds } from '@/lib/data/weather';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ frostF: z.number().min(-40).max(60), heatF: z.number().min(60).max(130), rainIn: z.number().min(0.1).max(20) });

/** When to warn about frost, heat and heavy rain. */
export async function POST(req: Request) {
  try {
    const user = await requireCap('work.manage');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter sensible temperatures and a rain amount.' }, { status: 400 });
    await setWeatherThresholds(user, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
