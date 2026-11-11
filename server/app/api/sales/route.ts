import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addSale } from '@/lib/data/sales';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';
import { loanTermsSchema } from '@/lib/api/loan-schemas';

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kind: z.enum(['eggs', 'milk', 'produce', 'animal', 'hay', 'other']),
  item: z.string().max(80).optional(),
  qty: z.number().min(0).max(1e7).nullable().optional(),
  unit: z.string().max(20).optional(),
  amount: z.number().positive().max(1e7),
  buyer: z.string().max(80).optional(),
  paid: z.boolean().optional(),
  groupId: z.string().max(64).nullable().optional(),
  landUnitId: z.string().max(64).nullable().optional(),
  notes: z.string().max(500).optional(),
  loan: loanTermsSchema.nullable().optional(),
});

/** Record a sale. Replay-safe, so one logged at the farm stand with no signal isn't counted twice. */
export async function POST(req: Request) {
  try {
    const user = await requireCap('sales.log');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter what was sold and for how much.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => ({ status: 200, body: { id: await addSale(user, parsed.data) } }));
  } catch (e) {
    return errorResponse(e);
  }
}
