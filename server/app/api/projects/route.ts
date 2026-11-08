import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { listProjects, addProject } from '@/lib/data/projects';
import { createProjectSchema } from '@/lib/api/project-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function GET() {
  try {
    const user = await requireCap('farm.view');
    return NextResponse.json({ projects: await listProjects(user) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireCap('farm.view');
    const parsed = createProjectSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A project name is required.' }, { status: 400 });
    const project = await addProject(user, parsed.data);
    return NextResponse.json({ project });
  } catch (e) {
    return errorResponse(e);
  }
}
