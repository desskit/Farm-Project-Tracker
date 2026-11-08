/** Per-person switches and access end dates, as an admin sets them. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { setAccessExpiry, setUserCap, updateUserRole } from '@/lib/data/users';
import { capsFor } from '@/lib/auth/session';
import { cleanupAuthTables } from '@/lib/auth/cleanup';

const { db, schema } = await useTestDb();

describe('setUserCap', () => {
  it('switches only what the role allows, and resets to default with null', async () => {
    const admin = await makeUser('admin');
    const crew = await makeUser('worker');
    await setUserCap(admin.id, crew.id, 'work.manage', true);
    expect(await capsFor(crew.id, 'worker')).toContain('work.manage');
    await setUserCap(admin.id, crew.id, 'work.manage', null);
    expect(await capsFor(crew.id, 'worker')).not.toContain('work.manage');
    await expect(setUserCap(admin.id, crew.id, 'finance.manage', true)).rejects.toThrow(/can't/);
  });
});

describe('setAccessExpiry', () => {
  it('refuses admins and yourself, and signs people out when ended now', async () => {
    const admin = await makeUser('admin');
    const other = await makeUser('admin');
    const fam = await makeUser('family');
    await expect(setAccessExpiry(admin.id, other.id, Date.now() + 1e6)).rejects.toThrow(/Admins/);
    await expect(setAccessExpiry(fam.id, fam.id, Date.now() + 1e6)).rejects.toThrow(/own/);

    await db.insert(schema.sessions).values({ id: 'sess-fam', userId: fam.id, expiresAt: Date.now() + 1e6 });
    await setAccessExpiry(admin.id, fam.id, Date.now() - 1);
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, fam.id))).toHaveLength(0);

    // Promoting to admin clears any end date.
    await updateUserRole(fam.id, 'admin');
    const row = await db.select().from(schema.users).where(eq(schema.users.id, fam.id));
    expect(row[0].accessExpiresAt).toBeNull();
  });

  it('nightly cleanup clears sessions of anyone whose access ended', async () => {
    const g = await makeUser('worker');
    await db.update(schema.users).set({ accessExpiresAt: Date.now() - 1000 }).where(eq(schema.users.id, g.id));
    await db.insert(schema.sessions).values({ id: 'sess-g', userId: g.id, expiresAt: Date.now() + 1e6 });
    await cleanupAuthTables();
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, g.id))).toHaveLength(0);
  });
});
