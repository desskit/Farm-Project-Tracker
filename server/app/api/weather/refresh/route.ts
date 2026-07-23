import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { refreshForecast } from '@/lib/data/weather';
import { errorResponse } from '@/lib/api/errors';

export async function POST() {
  try {
    await requireUser();
    const weather = await refreshForecast();
    return NextResponse.json({ ok: true, weather });
  } catch (e) {
    return errorResponse(e);
  }
}
