import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { markLoanPayment } from '@/lib/data/loans';
import { loanPaymentSchema } from '@/lib/api/loan-schemas';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

/** "I paid" from the borrower (waits for confirmation), or a payment a money manager takes in person. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    const parsed = loanPaymentSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Enter how much was paid.' }, { status: 400 });
    return await withIdempotency(user.id, idempotencyKey(req), async () => ({ status: 200, body: { id: await markLoanPayment(user, params.id, parsed.data) } }));
  } catch (e) {
    return errorResponse(e);
  }
}
