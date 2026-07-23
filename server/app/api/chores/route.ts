import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { listChores, addChore } from '@/lib/data/chores';
import { createChoreSchema } from '@/lib/api/chore-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ chores: await listChores() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = createChoreSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid chore.' }, { status: 400 });
    }
    const chore = await addChore(user, parsed.data);
    return NextResponse.json({ chore });
  } catch (e) {
    return errorResponse(e);
  }
}
