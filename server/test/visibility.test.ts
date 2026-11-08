/**
 * Visibility suite: one farm, one person per kind of access, checked across
 * every place work shows up. Crew see their own work and anything up for
 * grabs; guests only their own; managers and family everything.
 */
import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { listChores, choreForViewer, completeChore, claimChore } from '@/lib/data/chores';
import { listProjects, projectForViewer, projectTasksFor, toggleTask } from '@/lib/data/projects';
import { getDashboard } from '@/lib/data/dashboard';
import { calendarItems } from '@/lib/data/calendar';
import { search } from '@/lib/data/search';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

const manager = await makeUser('manager', 'Morgan');
const family = await makeUser('family', 'Fran');
const crew = await makeUser('worker', 'Casey');
const guest = await makeUser('guest', 'Gale');

await db.insert(schema.chores).values([
  { id: 'ch-crew', name: 'Feed hens (crew)', schedule: { type: 'daily' }, nextDue: T },
  { id: 'ch-open', name: 'Fix fence (open)', schedule: { type: 'once' }, nextDue: T, open: true },
  { id: 'ch-other', name: 'Muck barn (other)', schedule: { type: 'daily' }, nextDue: T },
  { id: 'ch-guest', name: 'Water beds (guest)', schedule: { type: 'daily' }, nextDue: T },
]);
await db.insert(schema.choreAssignees).values([
  { choreId: 'ch-crew', userId: crew.id },
  { choreId: 'ch-other', userId: manager.id },
  { choreId: 'ch-guest', userId: guest.id },
]);
await db.insert(schema.projects).values([
  { id: 'p-shared', name: 'Greenhouse' },
  { id: 'p-private', name: 'Barn roof' },
]);
await db.insert(schema.projectTasks).values([
  { id: 't-crew', projectId: 'p-shared', title: 'Cut panels (crew)', dueDate: T },
  { id: 't-other', projectId: 'p-shared', title: 'Order glass (other)', dueDate: T },
  { id: 't-roof', projectId: 'p-private', title: 'Get quotes (roof)', dueDate: addDays(T, 1) },
]);
await db.insert(schema.taskAssignees).values([{ taskId: 't-crew', userId: crew.id }]);

const choreIds = async (u: typeof crew) => (await listChores(u)).map((c) => c.id).sort();

describe('who sees which work', () => {
  it('chore lists', async () => {
    expect(await choreIds(manager)).toEqual(['ch-crew', 'ch-guest', 'ch-open', 'ch-other']);
    expect(await choreIds(family)).toEqual(['ch-crew', 'ch-guest', 'ch-open', 'ch-other']);
    expect(await choreIds(crew)).toEqual(['ch-crew', 'ch-open']);
    expect(await choreIds(guest)).toEqual(['ch-guest']);
  });

  it('chore detail and actions on hidden work answer "not found"', async () => {
    expect(await choreForViewer(crew, 'ch-other')).toBeNull();
    await expect(completeChore(crew, 'ch-other')).rejects.toThrow(/No such chore/);
    await expect(claimChore(guest, 'ch-open')).rejects.toThrow(/No such chore/);
  });

  it('projects and their tasks', async () => {
    expect((await listProjects(crew)).map((p) => p.id)).toEqual(['p-shared']);
    expect(await projectForViewer(crew, 'p-private')).toBeNull();
    expect((await projectTasksFor('p-shared', crew)).map((t) => t.id)).toEqual(['t-crew']);
    expect((await projectTasksFor('p-shared', manager)).map((t) => t.id).sort()).toEqual(['t-crew', 't-other']);
    expect((await listProjects(guest)).length).toBe(0);
    await expect(toggleTask(crew, 't-roof')).rejects.toThrow(/No such task/);
  });

  it('dashboard "All", calendar and search', async () => {
    const all = await getDashboard(crew, 'all');
    const titles = [...all.overdue, ...all.today, ...all.upcoming].filter((i) => i.kind !== 'maintenance').map((i) => i.id).sort();
    expect(titles).toEqual(['ch-crew', 'ch-open', 't-crew']);

    const cal = (await calendarItems(crew, T, addDays(T, 3))).filter((i) => i.kind !== 'rent').map((i) => i.id);
    expect(cal).not.toContain('ch-other');
    expect(cal).not.toContain('t-roof');
    expect(cal).toContain('ch-crew');

    const hits = (await search(crew, '(')).map((r) => r.id);
    expect(hits).toEqual(expect.arrayContaining(['ch-crew', 'ch-open', 't-crew']));
    expect(hits).not.toContain('ch-other');
    expect(hits).not.toContain('t-roof');
    expect((await search(crew, 'Morgan')).some((r) => r.kind === 'person')).toBe(false);
    expect((await search(manager, 'Casey')).some((r) => r.kind === 'person')).toBe(true);
  });

  it('a crew member switched to "see all work" sees everything', async () => {
    await db.insert(schema.userCaps).values({ userId: crew.id, cap: 'work.viewAll', allow: true });
    const { capsFor } = await import('@/lib/auth/session');
    const crewAll = { ...crew, caps: await capsFor(crew.id, 'worker') };
    expect(await choreIds(crewAll)).toHaveLength(4);
  });
});
