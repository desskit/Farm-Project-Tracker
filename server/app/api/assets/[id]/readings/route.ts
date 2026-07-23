import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { addReading } from '@/lib/data/maintenance';
import { addReadingSchema } from '@/lib/api/maintenance-schemas';
import { errorResponse } from '@/lib/api/errors';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = addReadingSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid reading.' }, { status: 400 });
    await addReading(user, params.id, parsed.data.reading, parsed.data.date);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
