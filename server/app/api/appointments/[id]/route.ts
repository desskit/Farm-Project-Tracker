import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { deleteAppointment, setAppointmentStatus, updateAppointment } from '@/lib/data/appointments';
import { appointmentPatchSchema } from '@/lib/api/appointment-schemas';

/** Change an appointment, or mark it done or cancelled. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    const parsed = appointmentPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details.' }, { status: 400 });
    if ('title' in parsed.data) await updateAppointment(user, params.id, parsed.data);
    else await setAppointmentStatus(user, params.id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    await deleteAppointment(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
