import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { deleteWebhook, updateWebhook } from '@/lib/data/webhooks';
import { webhookPatchSchema } from '@/lib/api/webhook-schemas';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('system.admin');
    const parsed = webhookPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    await updateWebhook(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('system.admin');
    await deleteWebhook(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
