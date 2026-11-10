import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { createNotice } from '@/lib/data/notices';
import { noticeSchema } from '@/lib/api/people-schemas';

/** Post a notice. Who may post to which audience is checked in the data layer. */
export async function POST(req: Request) {
  try {
    const user = await requireCap('farm.view');
    const parsed = noticeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const result = await createNotice(user, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
