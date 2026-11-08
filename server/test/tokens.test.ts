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

describe('access end date', () => {
  it('stops people being offered as recipients once their access has ended', async () => {
    const { recipientsWith } = await import('@/lib/data/recipients');
    const g = await makeUser('family');
    const before = (await recipientsWith('work.do')).map((r) => r.id);
    expect(before).toContain(g.id);
    await db.update(schema.users).set({ accessExpiresAt: Date.now() - 1000 }).where(eq(schema.users.id, g.id));
    expect((await recipientsWith('work.do')).map((r) => r.id)).not.toContain(g.id);
  });

  it('honours per-person switches when picking recipients', async () => {
    const { recipientsWith } = await import('@/lib/data/recipients');
    const crew = await makeUser('worker');
    expect((await recipientsWith('supplies.manage')).map((r) => r.id)).not.toContain(crew.id);
    await db.insert(schema.userCaps).values({ userId: crew.id, cap: 'supplies.manage', allow: true });
    expect((await recipientsWith('supplies.manage')).map((r) => r.id)).toContain(crew.id);
  });
});
