import { NextResponse } from 'next/server';
import { requireManager } from '@/lib/auth/session';
import { getProject } from '@/lib/data/projects';
import { suggestSteps } from '@/lib/ai/suggest-steps';
import { errorResponse } from '@/lib/api/errors';

// Generates AI-suggested task steps for a project. Manager+admin only (it costs
// an API call). Returns suggestions for the user to review; it does not create
// tasks itself.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireManager();
    const project = await getProject(params.id);
    if (!project) return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    const steps = await suggestSteps(project.name, project.description);
    return NextResponse.json({ steps });
  } catch (e) {
    return errorResponse(e);
  }
}
