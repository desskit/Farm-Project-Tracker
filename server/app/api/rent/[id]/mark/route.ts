import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { markRentPaid } from '@/lib/data/rent';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ note: z.string().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    await markRentPaid(user, params.id, parsed.success ? parsed.data.note : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
