import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { deleteEntry, updateEntry } from '@/lib/data/vault';
import { errorResponse } from '@/lib/api/errors';
import { entrySchema } from '@/lib/api/vault-schemas';

/** Change an entry (its owner only — checked in the data layer). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('vault.create');
    const parsed = entrySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the name and who can see it.' }, { status: 400 });
    await updateEntry(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Delete an entry: its owner, or an admin. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('vault.use');
    await deleteEntry(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
