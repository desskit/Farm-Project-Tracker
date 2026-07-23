import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { completeChore } from '@/lib/data/chores';
import { completeChoreSchema } from '@/lib/api/chore-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = completeChoreSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    await completeChore(user, params.id, parsed.data.notes, parsed.data.photoId ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
