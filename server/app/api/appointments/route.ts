import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addAppointment } from '@/lib/data/appointments';
import { appointmentSchema } from '@/lib/api/appointment-schemas';

/** Add an appointment (managers; checked in the data layer). */
export async function POST(req: Request) {
  try {
    const user = await requireCap('farm.view');
    const parsed = appointmentSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Say what it is and pick a date.' }, { status: 400 });
    return NextResponse.json({ id: await addAppointment(user, parsed.data) });
  } catch (e) {
    return errorResponse(e);
  }
}
