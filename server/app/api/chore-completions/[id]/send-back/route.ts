import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { sendBackChoreCompletion } from '@/lib/data/chores';
import { sendBackSchema } from '@/lib/api/chore-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    const parsed = sendBackSchema.safeParse(await req.json().catch(() => ({})));
    await sendBackChoreCompletion(user, params.id, parsed.success ? parsed.data.reason : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
