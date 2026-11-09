import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { saveGroup } from '@/lib/data/vault';
import { errorResponse } from '@/lib/api/errors';
import { groupSchema } from '@/lib/api/vault-schemas';


/** Create a sharing group (admins). */
export async function POST(req: Request) {
  try {
    const user = await requireCap('people.manage', 'Only admins manage sharing groups.');
    const parsed = groupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Give the group a name.' }, { status: 400 });
    return NextResponse.json({ id: await saveGroup(user, parsed.data) });
  } catch (e) {
    return errorResponse(e);
  }
}
