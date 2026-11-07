/**
 * Session and invite tokens are stored only as digests: a leaked database
 * (or backup) can't be replayed as a login or a password-set link.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { createInvite, getValidInvite, acceptInvite } from '@/lib/auth/invites';
import { hashToken } from '@/lib/auth/tokens';

const { db, schema } = await useTestDb();

describe('invite tokens', () => {
  it('stores a digest, works with the raw token, and is single-use', async () => {
    const u = await makeUser('worker');
    const { token } = await createInvite(u.id);
    const stored = await db.select().from(schema.invites).where(eq(schema.invites.userId, u.id));
    expect(stored).toHaveLength(1);
    expect(stored[0].token).toBe(hashToken(token));
    expect(stored[0].token).not.toBe(token);

    // The digest itself is not a usable link.
    expect(await getValidInvite(stored[0].token)).toBeNull();
    expect((await getValidInvite(token))?.email).toBe(u.email);

    // Accepting logs out existing sessions for that person.
    await db.insert(schema.sessions).values({ id: hashToken('old'), userId: u.id, expiresAt: Date.now() + 60_000 });
    expect(await acceptInvite(token, 'hash')).toEqual({ userId: u.id });
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, u.id))).toHaveLength(0);
    expect(await acceptInvite(token, 'hash')).toBeNull();
  });
});
