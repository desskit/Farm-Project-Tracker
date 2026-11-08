import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { deployStatus, requestUpdate } from '@/lib/deploy/control';
import { errorResponse } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

/** Update status for the admin panel (polled while an update runs). */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await deployStatus(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Ask the host to run the normal CI-gated update now. */
export async function POST() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json(await requestUpdate(admin));
  } catch (e) {
    return errorResponse(e);
  }
}
