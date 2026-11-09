import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { revealEntry } from '@/lib/data/vault';
import { errorResponse } from '@/lib/api/errors';

/**
 * Decrypt one secret for someone allowed to see it; logged. POST (not GET) so
 * it's never cached, prefetched or replayed from history, and so preview mode
 * (which blocks writes) can't reveal anything.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('vault.use');
    return NextResponse.json(await revealEntry(user, params.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
