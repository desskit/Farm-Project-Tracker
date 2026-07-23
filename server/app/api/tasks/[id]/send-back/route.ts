import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { sendBackTask } from '@/lib/data/projects';
import { sendBackSchema } from '@/lib/api/project-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = sendBackSchema.safeParse(await req.json().catch(() => ({})));
    await sendBackTask(user, params.id, parsed.success ? parsed.data.reason : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
