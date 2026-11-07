import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth/session';

/**
 * Sign out. POST only: a GET logout can be triggered by any page that embeds
 * an image pointing here. The response also asks the browser to drop cached
 * pages, so the next person on a shared phone doesn't see the last one's
 * screens from the offline cache. (Clear-Site-Data "cache" leaves IndexedDB
 * alone, so changes still waiting to sync aren't thrown away.)
 */
export async function POST(req: Request) {
  await destroySession();
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.headers.set('Clear-Site-Data', '"cache"');
  return res;
}

/** Old links and bookmarks: send them to the account page, where the button is. */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/more/account', req.url), 303);
}
