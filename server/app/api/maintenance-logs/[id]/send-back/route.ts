import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { sendBackService } from '@/lib/data/maintenance';
import { sendBackSchema } from '@/lib/api/maintenance-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = sendBackSchema.safeParse(await req.json().catch(() => ({})));
    await sendBackService(user, params.id, parsed.success ? parsed.data.reason : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
