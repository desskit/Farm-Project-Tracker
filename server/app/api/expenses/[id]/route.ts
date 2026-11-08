import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { deleteExpense } from '@/lib/data/project-expenses';
import { errorResponse } from '@/lib/api/errors';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('finance.view');
    await deleteExpense(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
