/** Today: up-for-grabs and the manager's farm cards follow permissions. */
import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { farmCards, upForGrabs } from '@/lib/data/today';
import { todayISO, addDays } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

describe('Today', () => {
  it('offers open work to crew, not guests, and not work you are already on', async () => {
    const crew = await makeUser('worker');
    const guest = await makeUser('guest');
    await db.insert(schema.chores).values([
      { id: 'o1', name: 'Open fence job', schedule: { type: 'once' }, nextDue: T, open: true },
      { id: 'o2', name: 'Open but mine', schedule: { type: 'once' }, nextDue: T, open: true },
      { id: 'o3', name: 'Open next month', schedule: { type: 'once' }, nextDue: addDays(T, 40), open: true },
    ]);
    await db.insert(schema.choreAssignees).values({ choreId: 'o2', userId: crew.id });
    await db.insert(schema.projects).values({ id: 'p1', name: 'Barn' });
    await db.insert(schema.projectTasks).values({ id: 'ot', projectId: 'p1', title: 'Open task', open: true });

    expect((await upForGrabs(crew)).map((g) => g.id).sort()).toEqual(['o1', 'ot']);
    expect(await upForGrabs(guest)).toEqual([]);
  });

  it('shows farm cards only to people who see all work, each gated by its permission', async () => {
    const crew = await makeUser('worker');
    const family = await makeUser('family');
    const manager = await makeUser('manager');
    expect(await farmCards(crew)).toBeNull();
    const fam = (await farmCards(family))!;
    expect(fam.rentToVerify).toBeUndefined(); // family can't manage money
    expect(fam.openRequests).toBeUndefined();
    const mgr = (await farmCards(manager))!;
    expect(mgr.rentToVerify).toBe(0);
    expect(mgr.openRequests).toBe(0);
    expect(mgr.team).toBe(true);
  });
});
