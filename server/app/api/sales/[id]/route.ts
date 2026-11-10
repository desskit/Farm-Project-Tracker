import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { deleteSale, setSalePaid } from '@/lib/data/sales';

const schema = z.object({ paid: z.boolean() });

/** Mark a sale paid or still owed (whoever recorded it, or a manager). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('sales.log');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    await setSalePaid(user, params.id, parsed.data.paid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('sales.log');
    await deleteSale(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
