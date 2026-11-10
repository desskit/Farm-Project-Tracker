import { NextResponse } from 'next/server';
import { calendarFeedFor, userForCalendarToken } from '@/lib/data/calendar-feed';
import { publicUrl } from '@/lib/notify/email';

export const dynamic = 'force-dynamic';

/**
 * Public by design: phone calendars fetch this with no cookie. The secret in
 * the path is the credential (see lib/data/calendar-feed.ts); a wrong or
 * reset one gets a plain 404.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const viewer = await userForCalendarToken(params.token.replace(/\.ics$/, ''));
  if (!viewer) return new NextResponse('Not found', { status: 404 });
  const origin = publicUrl() ?? new URL(req.url).origin;
  return new NextResponse(await calendarFeedFor(viewer, origin), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900' },
  });
}
