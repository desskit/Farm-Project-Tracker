import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { listProjects, addProject } from '@/lib/data/projects';
import { createProjectSchema } from '@/lib/api/project-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ projects: await listProjects() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = createProjectSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A project name is required.' }, { status: 400 });
    const project = await addProject(user, parsed.data);
    return NextResponse.json({ project });
  } catch (e) {
    return errorResponse(e);
  }
}
