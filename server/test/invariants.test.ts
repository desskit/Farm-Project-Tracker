import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { checkInvariants } from '@/lib/data/invariants';

const { db, schema } = await useTestDb();

describe('checkInvariants', () => {
  it('is clean on a healthy farm and reports what it finds', async () => {
    await makeUser('admin');
    expect((await checkInvariants()).findings).toEqual([]);
    const renter = await makeUser('renter');
    await db.insert(schema.chores).values({ id: 'c1', name: 'x', schedule: { type: 'daily' }, nextDue: '2026-01-01' });
    await db.insert(schema.choreAssignees).values({ choreId: 'c1', userId: renter.id });
    const r = await checkInvariants();
    expect(r.ok).toBe(false);
    expect(r.findings.map((f) => f.check)).toEqual(['Renters assigned to work']);
  });
});
