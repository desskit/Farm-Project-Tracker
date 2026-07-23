import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { publicKey } from '@/lib/notify/push';
import { errorResponse } from '@/lib/api/errors';

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ publicKey: publicKey() });
  } catch (e) {
    return errorResponse(e);
  }
}
