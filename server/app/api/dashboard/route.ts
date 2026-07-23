import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { getDashboard } from '@/lib/data/dashboard';
import { errorResponse } from '@/lib/api/errors';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const scope = new URL(req.url).searchParams.get('scope') === 'all' ? 'all' : 'mine';
    return NextResponse.json({ buckets: await getDashboard(user, scope) });
  } catch (e) {
    return errorResponse(e);
  }
}
