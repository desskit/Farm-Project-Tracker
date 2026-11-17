import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { savePaySettings } from '@/lib/data/pay';
import { paySettingsSchema } from '@/lib/api/pay-schemas';

/** Someone's hourly rate and how much of their pay goes toward rent. */
export async function PUT(req: Request, { params }: { params: { userId: string } }) {
  try {
    const user = await requireCap('finance.manage');
    const parsed = paySettingsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the rate and the rent rule.' }, { status: 400 });
    await savePaySettings(user, params.userId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
