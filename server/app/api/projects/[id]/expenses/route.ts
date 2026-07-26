import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { addExpense, listExpenses } from '@/lib/data/project-expenses';
import { createExpenseSchema } from '@/lib/api/project-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    return NextResponse.json({ expenses: await listExpenses(params.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = createExpenseSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid expense.' }, { status: 400 });
    }
    await addExpense(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
