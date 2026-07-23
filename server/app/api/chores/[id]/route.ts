import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { choreById, updateChore, deleteChore, choreCompletionsFor, choreStreak } from '@/lib/data/chores';
import { updateChoreSchema } from '@/lib/api/chore-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const chore = await choreById(params.id);
    if (!chore) return NextResponse.json({ error: 'No such chore.' }, { status: 404 });
    const [completions, streak] = await Promise.all([choreCompletionsFor(params.id), choreStreak(params.id)]);
    return NextResponse.json({ chore, completions, streak });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = updateChoreSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid chore update.' }, { status: 400 });
    }
    const chore = await updateChore(user, params.id, parsed.data);
    return NextResponse.json({ chore });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await deleteChore(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
