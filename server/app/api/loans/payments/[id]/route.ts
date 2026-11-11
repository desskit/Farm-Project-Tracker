import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { confirmLoanPayment, deleteLoanPayment } from '@/lib/data/loans';

/** Confirm a payment the borrower marked. */
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('finance.manage');
    await confirmLoanPayment(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Withdraw your own waiting payment, or (money managers) turn one down or remove a mistaken one. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    await deleteLoanPayment(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
