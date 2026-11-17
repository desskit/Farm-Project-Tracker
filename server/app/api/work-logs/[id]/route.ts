import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { decideWorkLog, deleteWorkLog } from '@/lib/data/pay';
import { workLogDecisionSchema } from '@/lib/api/pay-schemas';

/** Approve or reject typed-in hours (a manager, never your own; checked in the data layer). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    const parsed = workLogDecisionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    await decideWorkLog(user, params.id, parsed.data.approve);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Remove your own hours while they're still waiting. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    await deleteWorkLog(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
