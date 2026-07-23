/**
 * Admin-invite account provisioning: an admin creates a person (no open
 * signup); the server mints a token; the invitee follows /invite/[token] to
 * set their own password and activate the account.
 */
import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { invites, users } from '@/db/schema';

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export async function createInvite(userId: string): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + INVITE_TTL_MS;
  await db.insert(invites).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

export type InviteInfo = { token: string; name: string; email: string };

/** Looks up a not-yet-used, not-expired invite. Null if invalid/expired/used. */
export async function getValidInvite(token: string): Promise<InviteInfo | null> {
  const rows = await db
    .select({ token: invites.token, name: users.name, email: users.email })
    .from(invites)
    .innerJoin(users, eq(users.id, invites.userId))
    .where(and(eq(invites.token, token), isNull(invites.usedAt), gt(invites.expiresAt, Date.now())))
    .limit(1);
  return rows[0] ?? null;
}

/** Sets the account's password and consumes the invite. Null if invalid/expired/used. */
export async function acceptInvite(token: string, passwordHash: string): Promise<{ userId: string } | null> {
  const rows = await db
    .select({ userId: invites.userId })
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.usedAt), gt(invites.expiresAt, Date.now())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
  await db.update(invites).set({ usedAt: Date.now() }).where(eq(invites.token, token));
  return { userId: row.userId };
}
