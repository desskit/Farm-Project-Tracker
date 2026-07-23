import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { updateUserRole, removeUser } from '@/lib/data/users';
import { errorResponse } from '@/lib/api/errors';

const roleSchema = z.object({ role: z.enum(['admin', 'manager', 'worker']) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const parsed = roleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A valid role is required.' }, { status: 400 });
    await updateUserRole(params.id, parsed.data.role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const me = await requireAdmin();
    await removeUser(params.id, me.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
