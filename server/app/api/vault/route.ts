import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { createEntry } from '@/lib/data/vault';
import { errorResponse } from '@/lib/api/errors';
import { entrySchema } from '@/lib/api/vault-schemas';


/** Add a password or code. */
export async function POST(req: Request) {
  try {
    const user = await requireCap('vault.create');
    const parsed = entrySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the name, password and who can see it.' }, { status: 400 });
    return NextResponse.json({ id: await createEntry(user, parsed.data) });
  } catch (e) {
    return errorResponse(e);
  }
}
