/** Skip/snooze chores; repeating project tasks. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { addChore, skipChore, snoozeChore } from '@/lib/data/chores';
import { addTask, toggleTask } from '@/lib/data/projects';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

describe('skip and snooze', () => {
  it('skips one occurrence without logging it done, and snoozes within limits', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    const other = await makeUser('worker');
    const c = await addChore(mgr, { name: 'Feed', schedule: { type: 'daily' }, nextDue: T, assigneeIds: [crew.id] });
    expect(await skipChore(crew, c.id)).toBe(addDays(T, 1));
    expect(await db.select().from(schema.choreCompletions).where(eq(schema.choreCompletions.choreId, c.id))).toHaveLength(0);
    await expect(skipChore(other, c.id)).rejects.toThrow(/No such chore/); // not theirs, not visible
    await snoozeChore(crew, c.id, addDays(T, 5));
    expect((await db.select().from(schema.chores).where(eq(schema.chores.id, c.id)))[0].nextDue).toBe(addDays(T, 5));
    await expect(snoozeChore(crew, c.id, T)).rejects.toThrow(/after today/);
    await expect(snoozeChore(crew, c.id, addDays(T, 90))).rejects.toThrow(/60 days/);
    const once = await addChore(mgr, { name: 'Fix gate', schedule: { type: 'once' }, nextDue: T });
    await expect(skipChore(mgr, once.id)).rejects.toThrow(/one-off/);
  });
});

describe('repeating tasks', () => {
  it('adds the next one when done, with the same people, and takes it back on undo', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    await db.insert(schema.projects).values({ id: 'p-rep', name: 'Orchard' });
    const t = await addTask(mgr, 'p-rep', { title: 'Check traps', dueDate: addDays(T, 2), assigneeIds: [crew.id], repeat: { every: 2, unit: 'weeks' } });
    await toggleTask(crew, t.id);
    const tasks = await db.select().from(schema.projectTasks).where(eq(schema.projectTasks.projectId, 'p-rep'));
    expect(tasks).toHaveLength(2);
    const next = tasks.find((x) => x.id !== t.id)!;
    expect([next.done, next.dueDate, next.repeat]).toEqual([false, addDays(T, 16), { every: 2, unit: 'weeks' }]);
    expect((await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, next.id))).map((a) => a.userId)).toEqual([crew.id]);
    await toggleTask(crew, t.id); // undo
    expect(await db.select().from(schema.projectTasks).where(eq(schema.projectTasks.projectId, 'p-rep'))).toHaveLength(1);
    // Done late: the next one is set from today, not in the past.
    const late = await addTask(mgr, 'p-rep', { title: 'Mow', dueDate: addDays(T, -20), repeat: { every: 1, unit: 'weeks' } });
    await toggleTask(mgr, late.id);
    const nl = (await db.select().from(schema.projectTasks).where(eq(schema.projectTasks.title, 'Mow'))).find((x) => !x.done)!;
    expect(nl.dueDate).toBe(addDays(T, 7));
  });
});
