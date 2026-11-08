import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { search } from '@/lib/data/search';
import { errorResponse } from '@/lib/api/errors';

export async function GET(req: Request) {
  try {
    const user = await requireCap('farm.view');
    const q = new URL(req.url).searchParams.get('q') || '';
    const results = await search(user, q);
    return NextResponse.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
