import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { logService } from '@/lib/data/maintenance';
import { logServiceSchema } from '@/lib/api/maintenance-schemas';
import { errorResponse } from '@/lib/api/errors';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = logServiceSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid service log.' }, { status: 400 });
    // Replay-safe: a repeat would otherwise record the cost a second time.
    return await withIdempotency(user.id, idempotencyKey(req), async () => {
      await logService(user, params.id, parsed.data);
      return { status: 200, body: { ok: true } };
    });
  } catch (e) {
    return errorResponse(e);
  }
}
