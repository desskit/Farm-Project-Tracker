import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { removeCalendarToken, resetCalendarToken } from '@/lib/data/calendar-feed';
import { publicUrl } from '@/lib/notify/email';

/** Create or replace my calendar link. The old one stops working at once. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const token = await resetCalendarToken(user.id);
    const origin = publicUrl() ?? new URL(req.url).origin;
    return NextResponse.json({ url: `${origin}/api/calendar/feed/${token}.ics` });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Turn my calendar link off. */
export async function DELETE() {
  try {
    const user = await requireUser();
    await removeCalendarToken(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
