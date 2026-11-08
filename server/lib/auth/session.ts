/**
 * Session management: opaque tokens stored in the `sessions` table, carried in
 * an httpOnly cookie. Identity for the whole app derives from here (replacing
 * the prototype's `currentUserId`-in-state).
 */
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, userCaps, users } from '@/db/schema';
import type { Role } from '@/db/schema';
import { can, resolveCaps, type Cap } from '@/lib/domain/permissions';
import { requestCache } from '@/lib/request-cache';
import { PREVIEW_COOKIE, SESSION_COOKIE } from './constants';
import { hashToken } from './tokens';

export { SESSION_COOKIE };
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/**
 * The signed-in person. `caps` is what they may do (role defaults plus their
 * switches); check it with `can(user, cap)` from lib/domain/permissions, never
 * by comparing roles. It's an array so it can be passed to client components.
 * It's optional only so tests and scripts can build a user by hand; then the
 * role's defaults apply.
 */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  caps?: Cap[];
  /** Set while an admin previews the app as this person (everything read-only). */
  previewBy?: { id: string; name: string; until: number };
};

/** Role defaults plus this person's switches. */
export async function capsFor(userId: string, role: Role): Promise<Cap[]> {
  const overrides = await db.select({ cap: userCaps.cap, allow: userCaps.allow }).from(userCaps).where(eq(userCaps.userId, userId));
  return resolveCaps(role, overrides);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  // Only the digest is stored; the raw token lives in the cookie alone.
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  cookies().delete(SESSION_COOKIE);
}

/**
 * The person actually signed in, ignoring any preview. Only the preview
 * controls need this; everything else uses getSessionUser().
 */
export const getRealSessionUser = requestCache(async (): Promise<SessionUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const now = Date.now();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    // Deactivating someone, or their access end date passing, takes effect on
    // their very next request, even if they already hold a valid cookie.
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        gt(sessions.expiresAt, now),
        eq(users.active, true),
        or(isNull(users.accessExpiresAt), gt(users.accessExpiresAt, now)),
      ),
    )
    .limit(1);
  const u = rows[0];
  if (!u) return null;
  return { ...u, caps: await capsFor(u.id, u.role) };
});

/** Parses the preview cookie: whose view, and until when. */
export function parsePreview(value: string | undefined, now = Date.now()): { userId: string; until: number } | null {
  if (!value) return null;
  const [userId, untilRaw] = value.split('.');
  const until = Number(untilRaw);
  if (!userId || !Number.isFinite(until) || until <= now) return null;
  return { userId, until };
}

/**
 * The signed-in user, or null — or, while an admin is previewing, the person
 * being previewed (with `previewBy` set), so every page and permission check
 * shows exactly what that person would get. Cached per request.
 */
export const getSessionUser = requestCache(async (): Promise<SessionUser | null> => {
  const real = await getRealSessionUser();
  if (!real) return null;
  const preview = parsePreview(cookies().get(PREVIEW_COOKIE)?.value);
  if (!preview || !can(real, 'system.admin') || preview.userId === real.id) return real;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, preview.userId))
    .limit(1);
  const target = rows[0];
  if (!target) return real;
  return {
    ...target,
    caps: await capsFor(target.id, target.role),
    previewBy: { id: real.id, name: real.name, until: preview.until },
  };
});

/** Throwing guard for API routes / server actions. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('Not signed in.', 401);
  return user;
}

/** Signed in and allowed to do `cap`, or a 401/403. */
export async function requireCap(cap: Cap, message = 'You don’t have access to that.'): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, cap)) throw new AuthError(message, 403);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireCap('system.admin', 'Admins only.');
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
