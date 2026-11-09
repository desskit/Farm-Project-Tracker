import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { createGroup } from '@/lib/data/livestock';
import { groupSchema } from '@/lib/api/livestock-schemas';


/** Add a herd, flock or pen. */
export async function POST(req: Request) {
  try {
    const user = await requireCap('animals.manage');
    const parsed = groupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const result = await createGroup(user, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
