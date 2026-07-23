import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { updateProject, deleteProject } from '@/lib/data/projects';
import { updateProjectSchema } from '@/lib/api/project-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = updateProjectSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid project update.' }, { status: 400 });
    const project = await updateProject(user, params.id, parsed.data);
    return NextResponse.json({ project });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await deleteProject(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
