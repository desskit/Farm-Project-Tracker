/**
 * Admin-invite account provisioning: an admin creates a person (no open
 * signup); the server mints a token; the invitee follows /invite/[token] to
 * set their own password and activate the account.
 */
import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { db } from '@/db';
import { invites, users, sessions } from '@/db/schema';
import { hashToken } from './tokens';

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Mints a fresh invite/reset link. Any earlier unused link for this person is
 * invalidated, so only the most recent email works — an old link sitting in an
 * inbox stops being an account-takeover route.
 */
export async function createInvite(userId: string): Promise<{ token: string; expiresAt: number }> {
  await db.delete(invites).where(and(eq(invites.userId, userId), isNull(invites.usedAt)));
  const token = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + INVITE_TTL_MS;
  // The emailed link carries the raw token; only its digest is stored.
  await db.insert(invites).values({ token: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export type InviteInfo = { token: string; name: string; email: string };

/** Looks up a not-yet-used, not-expired invite. Null if invalid/expired/used. */
export async function getValidInvite(token: string): Promise<InviteInfo | null> {
  const rows = await db
    .select({ token: invites.token, name: users.name, email: users.email })
    .from(invites)
    .innerJoin(users, eq(users.id, invites.userId))
    .where(and(eq(invites.token, hashToken(token)), isNull(invites.usedAt), gt(invites.expiresAt, Date.now())))
    .limit(1);
  return rows[0] ? { ...rows[0], token } : null;
}

/** Sets the account's password and consumes the invite. Null if invalid/expired/used. */
export async function acceptInvite(token: string, passwordHash: string): Promise<{ userId: string } | null> {
  const digest = hashToken(token);
  const rows = await db
    .select({ userId: invites.userId })
    .from(invites)
    .where(and(eq(invites.token, digest), isNull(invites.usedAt), gt(invites.expiresAt, Date.now())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // One change, all or nothing: set the password, consume this link, burn any
  // other outstanding link for this person, and sign out every existing
  // session — a reset is often "someone else may be in my account", so old
  // sessions must not survive it. The caller issues a fresh session after.
  await db.batch([
    db.update(users).set({ passwordHash }).where(eq(users.id, row.userId)),
    db.update(invites).set({ usedAt: Date.now() }).where(eq(invites.token, digest)),
    db.delete(invites).where(and(eq(invites.userId, row.userId), ne(invites.token, digest), isNull(invites.usedAt))),
    db.delete(sessions).where(eq(sessions.userId, row.userId)),
  ]);
  return { userId: row.userId };
}
