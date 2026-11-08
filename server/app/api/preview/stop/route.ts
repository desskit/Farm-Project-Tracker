import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getRealSessionUser } from '@/lib/auth/session';
import { PREVIEW_COOKIE } from '@/lib/auth/constants';

/** Ends a preview. Always allowed (middleware exempts it from the read-only block). */
export async function POST(req: Request) {
  await getRealSessionUser(); // no requirement beyond having the cookie to clear
  cookies().delete(PREVIEW_COOKIE);
  return NextResponse.redirect(new URL('/people', req.url), 303);
}
