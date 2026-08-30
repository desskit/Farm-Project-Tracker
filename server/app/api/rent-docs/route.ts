import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { addRentDoc, listRentDocs } from '@/lib/data/rent-docs';
import { errorResponse } from '@/lib/api/errors';

// Deliberately not nested under /api/rent/[id]/… — that segment already means
// a rent *charge*, and paperwork belongs to a renter, not a month's charge.
const schema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  docType: z.enum(['lease', 'addendum', 'deposit', 'inspection', 'insurance', 'other']),
  attachmentId: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const userId = new URL(req.url).searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Which renter?' }, { status: 400 });
    return NextResponse.json({ docs: await listRentDocs(user, userId) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid document.' }, { status: 400 });
    }
    const { userId, ...doc } = parsed.data;
    await addRentDoc(user, userId, doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
