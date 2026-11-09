import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addInspection } from '@/lib/data/rentals';
import { inspectionSchema } from '@/lib/api/rentals-schemas';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('rentals.manage');
    const parsed = inspectionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const result = await addInspection(user, params.id, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
