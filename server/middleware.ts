import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PREVIEW_COOKIE, SESSION_COOKIE } from '@/lib/auth/constants';

/**
 * Edge middleware: applies security headers to every response, and does a fast
 * presence-only session-cookie check to redirect signed-out users to /login
 * before any page renders.
 *
 * The cookie check is presence-only — it cannot validate the token against the
 * database (the libsql driver needs the Node.js runtime, which Edge middleware
 * doesn't have). The authoritative check is requireUser()/getSessionUser()
 * (lib/auth/session.ts), which every Server Component and Route Handler calls
 * under the Node.js runtime.
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/forgot',
  '/invite',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/invite',
  '/api/health',
  '/manifest.webmanifest',
  '/icon.svg',
  '/sw.js',
];

const isProd = process.env.NODE_ENV === 'production';

// Pragmatic CSP for a Next.js App Router app: locks down external origins and
// framing while allowing the inline scripts/styles Next injects for hydration.
// 'unsafe-eval' is dev-only (HMR needs it); it is dropped in production builds.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ');

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('Content-Security-Policy', CSP);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProd) res.headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  return res;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cross-site request forgery guard for every state-changing request.
 *
 * The session cookie is SameSite=Lax, which already stops most cross-site
 * POSTs; this is the second lock. Browsers label where a request came from —
 * `Sec-Fetch-Site` on modern ones, `Origin` on all of them for a POST — so a
 * write that a browser says came from another site is refused. Requests with
 * neither header (curl, scripts) aren't browser-driven forgery and pass
 * through to the normal auth checks.
 */
function isCrossSiteWrite(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.get('host');
  } catch {
    return true; // "null" or malformed origins are never ours
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isCrossSiteWrite(req)) {
    return withSecurityHeaders(NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 }));
  }
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Previewing as someone else is look-only: no write gets through except
  // ending the preview (or signing out).
  if (
    req.cookies.has(PREVIEW_COOKIE) &&
    !SAFE_METHODS.has(req.method) &&
    pathname !== '/api/preview/stop' &&
    pathname !== '/api/auth/logout'
  ) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'You’re previewing as someone else — nothing can be changed. End the preview first.' }, { status: 403 }),
    );
  }

  if (!isPublic && !req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return withSecurityHeaders(NextResponse.redirect(url));
  }
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
