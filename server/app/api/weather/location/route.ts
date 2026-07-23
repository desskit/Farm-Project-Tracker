import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { setWeatherLocation, refreshForecast } from '@/lib/data/weather';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ lat: z.number(), lon: z.number(), label: z.string().optional() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid latitude and longitude.' }, { status: 400 });
    await setWeatherLocation(user, parsed.data.lat, parsed.data.lon, parsed.data.label || '');
    const weather = await refreshForecast();
    return NextResponse.json({ ok: true, weather });
  } catch (e) {
    return errorResponse(e);
  }
}
