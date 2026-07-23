import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { logService } from '@/lib/data/maintenance';
import { logServiceSchema } from '@/lib/api/maintenance-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = logServiceSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid service log.' }, { status: 400 });
    await logService(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
