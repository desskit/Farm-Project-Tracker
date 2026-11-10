import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { testWebhook } from '@/lib/data/webhooks';

/** Send a sample delivery and report how the other end answered. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('system.admin');
    const status = await testWebhook(user, params.id);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return errorResponse(e);
  }
}
