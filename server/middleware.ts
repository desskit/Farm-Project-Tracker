import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';

/**
 * Edge-safe route guard: redirects to /login when the session cookie is
 * entirely absent, for a fast UX redirect before any page renders.
 *
 * This is a presence check only — it cannot validate the token against the
 * database (the libsql driver needs the Node.js runtime, which Edge
 * middleware doesn't have). The authoritative check is
 * requireUser()/getSessionUser() (lib/auth/session.ts), which every Server
 * Component and Route Handler calls under the Node.js runtime.
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/invite',
  '/api/auth/login',
  '/api/invite',
  '/api/health',
  '/manifest.webmanifest',
  '/icon.svg',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
