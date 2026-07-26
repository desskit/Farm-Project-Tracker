import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { adjustStock } from '@/lib/data/inventory';
import { errorResponse } from '@/lib/api/errors';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

const schema = z.object({ delta: z.number(), reason: z.string().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a non-zero amount.' }, { status: 400 });
    // Stock moves are relative, so a replay would double-count the draw.
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      const qty = await adjustStock(user, params.id, parsed.data.delta, parsed.data.reason);
      return { status: 200, body: { ok: true, qty } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
