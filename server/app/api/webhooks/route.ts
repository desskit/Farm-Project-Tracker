import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addWebhook } from '@/lib/data/webhooks';
import { webhookSchema } from '@/lib/api/webhook-schemas';

export async function POST(req: Request) {
  try {
    const user = await requireCap('system.admin');
    const parsed = webhookSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Give it a name and an https:// address.' }, { status: 400 });
    const id = await addWebhook(user, parsed.data);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return errorResponse(e);
  }
}
