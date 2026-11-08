import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { search } from '@/lib/data/search';
import { errorResponse } from '@/lib/api/errors';

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const q = new URL(req.url).searchParams.get('q') || '';
    const results = await search(user, q);
    return NextResponse.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
