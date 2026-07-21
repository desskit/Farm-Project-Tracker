/**
 * Session management: opaque tokens stored in the `sessions` table, carried in
 * an httpOnly cookie. Identity for the whole app derives from here (replacing
 * the prototype's `currentUserId`-in-state).
 */
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import type { Role } from '@/db/schema';

export const SESSION_COOKIE = 'fpt_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type SessionUser = { id: string; name: string; email: string; role: Role };

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db.insert(sessions).values({ id: token, userId, expiresAt });
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
  if (token) await db.delete(sessions).where(eq(sessions.id, token));
  cookies().delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Validates the token against the DB + expiry. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, Date.now())))
    .limit(1);
  return rows[0] ?? null;
}

/** Throwing guard for API routes / server actions. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('Not signed in.', 401);
  return user;
}

export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'manager' && user.role !== 'admin') throw new AuthError('Managers and admins only.', 403);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new AuthError('Admins only.', 403);
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
