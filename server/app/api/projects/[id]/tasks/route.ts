import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { addTask } from '@/lib/data/projects';
import { createTaskSchema } from '@/lib/api/project-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = createTaskSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A task title is required.' }, { status: 400 });
    const task = await addTask(user, params.id, parsed.data);
    return NextResponse.json({ task });
  } catch (e) {
    return errorResponse(e);
  }
}
