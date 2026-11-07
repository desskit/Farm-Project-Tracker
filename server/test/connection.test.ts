/**
 * Facts about the database connection that the rest of the app relies on.
 * libsql's local-file client can swap its underlying connection around
 * transactions, so per-connection settings are checked after each kind of
 * write, not just at startup.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { configureConnection, transaction } from '@/db';

const { db, client, schema } = await useTestDb();

async function pragma(name: string): Promise<number | string> {
  const r = await client.execute(`PRAGMA ${name}`);
  return r.rows[0][0] as number | string;
}

beforeAll(async () => {
  await configureConnection();
});

describe('connection settings', () => {
  it('enforces foreign keys', async () => {
    expect(Number(await pragma('foreign_keys'))).toBe(1);
  });

  it('uses WAL so readers never block the writer', async () => {
    expect(String(await pragma('journal_mode')).toLowerCase()).toBe('wal');
  });

  it('waits for a lock rather than failing instantly', async () => {
    expect(Number(await pragma('busy_timeout'))).toBeGreaterThanOrEqual(5000);
  });

  it('keeps both settings after a batch', async () => {
    const u = await makeUser('worker');
    await db.batch([
      db.insert(schema.notificationPrefs).values({ userId: u.id }),
      db.update(schema.users).set({ name: 'Batched' }).where(eq(schema.users.id, u.id)),
    ]);
    expect(Number(await pragma('foreign_keys'))).toBe(1);
    expect(Number(await pragma('busy_timeout'))).toBeGreaterThanOrEqual(5000);
  });

  it('keeps both settings after a transaction (via the helper)', async () => {
    const u = await makeUser('worker');
    await transaction(async (tx) => {
      await tx.update(schema.users).set({ name: 'Tx' }).where(eq(schema.users.id, u.id));
    });
    expect(Number(await pragma('foreign_keys'))).toBe(1);
    expect(Number(await pragma('busy_timeout'))).toBeGreaterThanOrEqual(5000);
  });

  it('keeps settings even when the transaction throws', async () => {
    await expect(
      transaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(Number(await pragma('busy_timeout'))).toBeGreaterThanOrEqual(5000);
  });

  it('actually cascades deletes after a transaction', async () => {
    const u = await makeUser('worker');
    await transaction(async (tx) => {
      await tx.insert(schema.notificationPrefs).values({ userId: u.id });
    });
    await db.delete(schema.users).where(eq(schema.users.id, u.id));
    const left = await db.select().from(schema.notificationPrefs).where(eq(schema.notificationPrefs.userId, u.id));
    expect(left).toHaveLength(0);
  });

  it('rolls a failed batch back completely', async () => {
    const u = await makeUser('worker');
    await expect(
      db.batch([
        db.update(schema.users).set({ name: 'Half' }).where(eq(schema.users.id, u.id)),
        // Duplicate primary key: the second statement fails.
        db.insert(schema.users).values({ id: u.id, name: 'dup', email: 'dup@test.local', role: 'worker' }),
      ]),
    ).rejects.toThrow();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(row.name).not.toBe('Half');
  });
});

describe('rent charge uniqueness', () => {
  it('refuses a second charge for the same person and month', async () => {
    const u = await makeUser('worker');
    const charge = { userId: u.id, month: '2026-12', amount: 500, dueDate: '2026-12-01', status: 'unpaid' as const };
    await db.insert(schema.rentCharges).values({ id: 'rc_a', ...charge });
    await expect(db.insert(schema.rentCharges).values({ id: 'rc_b', ...charge })).rejects.toThrow();
  });
});
