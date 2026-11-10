import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { dismissSetup } from '@/lib/data/setup';

/** Put the first-run checklist away for good. */
export async function POST() {
  try {
    const user = await requireCap('system.admin');
    await dismissSetup(user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
