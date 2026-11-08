/** File access is decided by what a file is attached to, and denied by default. */
import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { canViewAttachment, assertOwnUpload, pruneOrphanAttachments } from '@/lib/data/attachment-access';
import { todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const file = async (id: string, uploadedBy: string, createdAt = Date.now()) =>
  db.insert(schema.attachments).values({ id, path: `${id}.jpg`, mime: 'image/jpeg', uploadedBy, createdAt });

const manager = await makeUser('manager');
const crew = await makeUser('worker');
const renter = await makeUser('renter');
const otherRenter = await makeUser('renter');

await db.insert(schema.chores).values({ id: 'c1', name: 'Feed', schedule: { type: 'daily' }, nextDue: T });
await file('a-proof', crew.id);
await db.insert(schema.choreCompletions).values({ id: 'cc1', choreId: 'c1', completedBy: crew.id, date: T, photoId: 'a-proof' });
await file('a-lease', manager.id);
await db.insert(schema.rentDocs).values({ id: 'rd1', userId: renter.id, name: 'Lease', docType: 'lease', attachmentId: 'a-lease', uploadedBy: manager.id, date: T });
await file('a-receipt', manager.id);
await db.insert(schema.projects).values({ id: 'p1', name: 'Shed' });
await db.insert(schema.projectExpenses).values({ id: 'e1', projectId: 'p1', label: 'Lumber', amount: 40, date: T, userId: manager.id, photoId: 'a-receipt' });
await file('a-loose', crew.id);

describe('canViewAttachment', () => {
  it('farm photos: farm people yes, renters no', async () => {
    expect(await canViewAttachment(manager, 'a-proof')).toBe(true);
    expect(await canViewAttachment(crew, 'a-proof')).toBe(true);
    expect(await canViewAttachment(renter, 'a-proof')).toBe(false);
  });
  it('leases: that renter and money people only', async () => {
    expect(await canViewAttachment(renter, 'a-lease')).toBe(true);
    expect(await canViewAttachment(otherRenter, 'a-lease')).toBe(false);
    expect(await canViewAttachment(crew, 'a-lease')).toBe(false);
    expect(await canViewAttachment(manager, 'a-lease')).toBe(true);
  });
  it('receipts: money people or the uploader', async () => {
    expect(await canViewAttachment(crew, 'a-receipt')).toBe(false);
    expect(await canViewAttachment(manager, 'a-receipt')).toBe(true);
  });
  it('unattached uploads: only the uploader; unknown ids: nobody', async () => {
    expect(await canViewAttachment(crew, 'a-loose')).toBe(true);
    expect(await canViewAttachment(manager, 'a-loose')).toBe(false);
    expect(await canViewAttachment(manager, 'nope')).toBe(false);
  });
  it('attaching a lease to farm work does not widen who sees it', async () => {
    await db.insert(schema.notes).values({ id: 'n1', parentType: 'project', parentId: 'p1', userId: manager.id, body: 'x', date: T, photoId: 'a-lease' });
    expect(await canViewAttachment(crew, 'a-lease')).toBe(false);
  });
});

describe('assertOwnUpload', () => {
  it('only lets people attach files they uploaded', async () => {
    await expect(assertOwnUpload(crew, 'a-loose')).resolves.toBeUndefined();
    await expect(assertOwnUpload(crew, 'a-lease')).rejects.toThrow(/Upload it again/);
    await expect(assertOwnUpload(crew, null)).resolves.toBeUndefined();
  });
});

describe('pruneOrphanAttachments', () => {
  it('removes week-old unattached uploads only', async () => {
    await file('a-old-loose', crew.id, Date.now() - 8 * 86400_000);
    const n = await pruneOrphanAttachments();
    expect(n).toBe(1);
    const left = (await db.select({ id: schema.attachments.id }).from(schema.attachments)).map((r) => r.id);
    expect(left).not.toContain('a-old-loose');
    expect(left).toEqual(expect.arrayContaining(['a-proof', 'a-lease', 'a-receipt', 'a-loose']));
  });
});
