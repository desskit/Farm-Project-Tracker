import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { updateTask, deleteTask } from '@/lib/data/projects';
import { updateTaskSchema } from '@/lib/api/project-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    const parsed = updateTaskSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid task update.' }, { status: 400 });
    const task = await updateTask(user, params.id, parsed.data);
    return NextResponse.json({ task });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    await deleteTask(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
