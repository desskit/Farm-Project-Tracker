import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { releaseTask } from '@/lib/data/projects';
import { errorResponse } from '@/lib/api/errors';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('work.do');
    await releaseTask(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
