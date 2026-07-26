import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { deleteExpense } from '@/lib/data/project-expenses';
import { errorResponse } from '@/lib/api/errors';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await deleteExpense(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
