import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { refreshForecast } from '@/lib/data/weather';
import { errorResponse } from '@/lib/api/errors';

export async function POST() {
  try {
    await requireCap('farm.view');
    const weather = await refreshForecast();
    return NextResponse.json({ ok: true, weather });
  } catch (e) {
    return errorResponse(e);
  }
}
