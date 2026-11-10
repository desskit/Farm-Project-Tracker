import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { markNewsSeen } from '@/lib/data/setup';

/** "Got it" on the what's-new card. */
export async function POST() {
  try {
    const user = await requireCap('farm.view');
    await markNewsSeen(user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
