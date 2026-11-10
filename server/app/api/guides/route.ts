import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { saveGuide } from '@/lib/data/guides';
import { guideSchema } from '@/lib/api/people-schemas';

export async function POST(req: Request) {
  try {
    const user = await requireCap('work.manage');
    const parsed = guideSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A guide needs a title and at least one step.' }, { status: 400 });
    const result = await saveGuide(user, null, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
