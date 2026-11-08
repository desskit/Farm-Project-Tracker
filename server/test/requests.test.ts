/** Maintenance requests: renters see their own, handlers see all and close them. */
import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { addRequestComment, createRequest, listRequests, requestForViewer, setRequestStatus } from '@/lib/data/requests';
import { canViewAttachment } from '@/lib/data/attachment-access';

const { db, schema } = await useTestDb();
const manager = await makeUser('manager');
const renter = await makeUser('renter', 'Rita');
const other = await makeUser('renter', 'Ollie');
const guest = await makeUser('guest');

describe('requests', () => {
  it('renters send and see only their own; managers see all', async () => {
    await db.insert(schema.attachments).values({ id: 'a-leak', path: 'a-leak.jpg', mime: 'image/jpeg', uploadedBy: renter.id });
    const id = await createRequest(renter, { title: 'Sink leaking', urgent: true, photoId: 'a-leak' });
    await createRequest(other, { title: 'Porch light out' });
    expect((await listRequests(renter)).map((r) => r.title)).toEqual(['Sink leaking']);
    expect((await listRequests(manager)).length).toBe(2);
    expect(await requestForViewer(other, id)).toBeNull();
    // The photo follows the request: sender and handlers only.
    expect(await canViewAttachment(renter, 'a-leak')).toBe(true);
    expect(await canViewAttachment(manager, 'a-leak')).toBe(true);
    expect(await canViewAttachment(other, 'a-leak')).toBe(false);
  });

  it('only handlers change status; both sides can reply', async () => {
    const id = await createRequest(renter, { title: 'Heat not working' });
    await expect(setRequestStatus(renter, id, 'done')).rejects.toThrow(/handle/);
    await setRequestStatus(manager, id, 'in_progress', 'Coming Tuesday');
    await addRequestComment(renter, id, 'Thanks!');
    await expect(addRequestComment(other, id, 'hi')).rejects.toThrow(/No such request/);
    const found = await requestForViewer(renter, id);
    expect(found?.request.status).toBe('in_progress');
    expect(found?.comments.map((c) => c.body)).toEqual(['Being worked on — Coming Tuesday', 'Thanks!']);
  });

  it('guests cannot send requests', async () => {
    await expect(createRequest(guest, { title: 'x' })).rejects.toThrow(/can’t send/);
  });
});
