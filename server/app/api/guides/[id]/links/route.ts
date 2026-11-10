import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { setGuideLink } from '@/lib/data/guides';
import { guideLinkSchema } from '@/lib/api/people-schemas';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('work.manage');
    const parsed = guideLinkSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    await setGuideLink(user, params.id, parsed.data.parentType, parsed.data.parentId, parsed.data.on);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
