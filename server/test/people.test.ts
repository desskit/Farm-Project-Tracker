/** Phase 3: rotating chores, notices by audience, contacts, guides, chore notes. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { addChore, completeChore, releaseChore, skipChore } from '@/lib/data/chores';
import { getDashboard, myOverdueCount } from '@/lib/data/dashboard';
import { createNotice, deleteNotice, noticesFor } from '@/lib/data/notices';
import { listContacts, saveContact } from '@/lib/data/contacts';
import { guideById, guidesFor, saveGuide, setGuideLink } from '@/lib/data/guides';
import { canViewAttachment } from '@/lib/data/attachment-access';
import { addNote, listNotes } from '@/lib/data/notes';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const turn = async (id: string) => (await db.select().from(schema.chores).where(eq(schema.chores.id, id)))[0].turnUserId;
const mineIds = async (u: Parameters<typeof getDashboard>[0]) => {
  const b = await getDashboard(u, 'mine');
  return [...b.overdue, ...b.today, ...b.upcoming].map((i) => i.id);
};

describe('rotating chores', () => {
  it('shows for one person at a time and moves on when done or skipped', async () => {
    const mgr = await makeUser('manager');
    const al = await makeUser('worker', 'Al');
    const bo = await makeUser('worker', 'Bo');
    const c = await addChore(mgr, { name: 'Muck out', schedule: { type: 'daily' }, nextDue: addDays(T, -1), assigneeIds: [bo.id, al.id], rotate: true });
    expect(await turn(c.id)).toBe(al.id); // name order
    expect(await mineIds(al)).toContain(c.id);
    expect(await mineIds(bo)).not.toContain(c.id);
    expect([await myOverdueCount(al), await myOverdueCount(bo)]).toEqual([1, 0]);
    await completeChore(bo, c.id); // Bo covers for Al: still moves on from Al
    expect(await turn(c.id)).toBe(bo.id);
    await skipChore(bo, c.id);
    expect(await turn(c.id)).toBe(al.id);
    await db.update(schema.chores).set({ open: true }).where(eq(schema.chores.id, c.id));
    await releaseChore(al, c.id); // Al steps off: the turn can't stay with him
    expect(await turn(c.id)).toBe(bo.id);
  });
});

describe('notices', () => {
  it('reach the right audience and come down on their last day', async () => {
    const mgr = await makeUser('manager');
    const family = await makeUser('family');
    const crew = await makeUser('worker');
    const renter = await makeUser('renter');
    const farm = await createNotice(mgr, { title: 'Hay delivery Friday', audience: 'farm' });
    await createNotice(mgr, { title: 'Water off Thursday', audience: 'tenants', expiresOn: addDays(T, 2) });
    await createNotice(mgr, { title: 'Gate code changed', audience: 'everyone' });
    const titles = async (u: typeof crew, day = T) => (await noticesFor(u, day)).map((n) => n.title).sort();
    expect(await titles(crew)).toEqual(['Gate code changed', 'Hay delivery Friday']);
    expect(await titles(renter)).toEqual(['Gate code changed', 'Water off Thursday']);
    expect(await titles(renter, addDays(T, 3))).toEqual(['Gate code changed']);
    await expect(createNotice(family, { title: 'x', audience: 'tenants' })).rejects.toThrow(/can’t post/);
    await expect(deleteNotice(crew, farm)).rejects.toThrow(/can’t take/);
    await deleteNotice(mgr, farm);
    expect(await titles(crew)).toEqual(['Gate code changed']);
  });
});

describe('contacts', () => {
  it('shows tenants only the ones marked for them', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    const renter = await makeUser('renter');
    await saveContact(mgr, null, { name: 'Dr. Hale', kind: 'vet', phone: '555-0101' });
    await saveContact(mgr, null, { name: 'After-hours plumber', kind: 'emergency', phone: '555-0199', showTenants: true });
    expect((await listContacts(crew)).map((c) => c.name)).toEqual(['After-hours plumber', 'Dr. Hale']);
    expect((await listContacts(renter)).map((c) => c.name)).toEqual(['After-hours plumber']);
    await expect(saveContact(crew, null, { name: 'x' })).rejects.toThrow(/Only managers/);
  });
});

describe('guides and chore notes', () => {
  it('attach to work, keep photos to the farm, and chores take notes', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    const renter = await makeUser('renter');
    await db.insert(schema.attachments).values({ id: 'att-g', path: 'g.jpg', mime: 'image/jpeg', uploadedBy: mgr.id });
    const g = await saveGuide(mgr, null, { title: 'Start the generator', steps: [{ text: 'Fuel on' }, { text: ' ' }, { text: 'Pull cord' }], photos: [{ attachmentId: 'att-g', step: 5 }] });
    const view = (await guideById(g))!;
    expect(view.steps.map((s) => s.text)).toEqual(['Fuel on', 'Pull cord']);
    expect(view.photos).toEqual([{ attachmentId: 'att-g', step: 1 }]); // clamped to the last step
    expect(await canViewAttachment(crew, 'att-g')).toBe(true);
    expect(await canViewAttachment(renter, 'att-g')).toBe(false);
    const c = await addChore(mgr, { name: 'Run generator', schedule: { type: 'monthly', day: 1 }, assigneeIds: [crew.id] });
    await setGuideLink(mgr, g, 'chore', c.id, true);
    expect((await guidesFor('chore', c.id)).map((x) => x.title)).toEqual(['Start the generator']);
    await expect(saveGuide(crew, null, { title: 'x', steps: [{ text: 'y' }] })).rejects.toThrow(/Only managers/);
    await addNote(crew, { parentType: 'chore', parentId: c.id, body: '@Nobody the pull cord is fraying' });
    expect((await listNotes('chore', c.id)).map((n) => n.body)).toEqual(['@Nobody the pull cord is fraying']);
    const stranger = await makeUser('worker');
    await expect(addNote(stranger, { parentType: 'chore', parentId: c.id, body: 'hi' })).rejects.toThrow(/Not found/);
  });
});
