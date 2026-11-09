import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { accessLogFor } from '@/lib/data/vault';
import { errorResponse } from '@/lib/api/errors';

/** Who opened an entry and when (owner and admins). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('vault.use');
    return NextResponse.json({ log: await accessLogFor(user, params.id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
