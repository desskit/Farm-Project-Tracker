/**
 * Chore data-access layer — ported from js/store.js's chore functions
 * (listChores, choreById, addChore, updateChore, completeChore, deleteChore,
 * choreCompletionsFor, choreStreak, claimItem/releaseItem, sendBackChore).
 *
 * Role checks live here (not just in the API routes) so any future caller —
 * another route, a cron job — gets the same guarantees the prototype's
 * store.js gave every UI call site.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { chores, choreCompletions, choreSupplies, inventory, users } from '@/db/schema';
import type { ChoreLinkType, Schedule, SentBack } from '@/db/schema';
import { uid } from '@/lib/ids';
import { nextOccurrenceAfter } from '@/lib/domain/recurrence';
import { todayISO, addDays } from '@/lib/domain/dates';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import {
  addChoreAssignee,
  choreAssigneeIds,
  choreAssigneeIdsFor,
  removeChoreAssignee,
  setChoreAssignees,
} from './assignees';
import { stopTimersFor } from './timers';
import { publishChange } from '@/lib/realtime/bus';
import { DataError } from './errors';
import { pushAssigned, pushClaimed, pushSentBack, pushToPeople } from '@/lib/notify/events';
import { currentTurn, nextTurn } from '@/lib/domain/rotation';
import { can } from '@/lib/domain/permissions';
import { canSeeWork } from '@/lib/domain/scope';
import { assertOwnUpload } from './attachment-access';
import { drawWhatsThere, returnSupplies } from './consumption';
import type { SupplyRef } from './inventory';

/** A chore plus the people on it (from chore_assignees). */
export type ChoreRow = typeof chores.$inferSelect & { assigneeIds: string[] };
export type ChoreCompletionRow = typeof choreCompletions.$inferSelect;


/** Active chores `viewer` can see (lib/domain/scope). */
export async function listChores(viewer: SessionUser): Promise<ChoreRow[]> {
  const rows = await db.select().from(chores).where(eq(chores.done, false));
  const assignees = await choreAssigneeIdsFor(rows.map((r) => r.id));
  return rows
    .map((r) => ({ ...r, assigneeIds: assignees[r.id] ?? [] }))
    .filter((c) => canSeeWork(viewer, c))
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));
}

export async function choreById(id: string): Promise<ChoreRow | null> {
  const rows = await db.select().from(chores).where(eq(chores.id, id)).limit(1);
  if (!rows[0]) return null;
  return { ...rows[0], assigneeIds: await choreAssigneeIds(id) };
}

/** The chore if `viewer` can see it, else null (callers answer 404). */
export async function choreForViewer(viewer: SessionUser, id: string): Promise<ChoreRow | null> {
  const c = await choreById(id);
  return c && canSeeWork(viewer, c) ? c : null;
}

export type ChoreInput = {
  name: string;
  schedule: Schedule;
  catchUp?: 'mustCatchUp' | 'skipToNext';
  assigneeIds?: string[];
  nextDue?: string;
  requirePhoto?: boolean;
  open?: boolean;
  steps?: string[];
  /** Care tied to an animal group etc.; set when created from that page. */
  link?: { type: ChoreLinkType; id: string } | null;
  /** Supplies used every time it's done ("2 scoops of layer feed"). */
  supplies?: { inventoryId: string; qty: number }[];
  /** Take turns between the people on it. */
  rotate?: boolean;
};

async function turners(choreId: string) {
  const ids = await choreAssigneeIds(choreId);
  return ids.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
}

/** Keep `turn_user_id` valid after the people on a chore (or its rotate switch) change. */
async function syncTurn(choreId: string): Promise<void> {
  const [c] = await db.select({ rotate: chores.rotate, turn: chores.turnUserId }).from(chores).where(eq(chores.id, choreId)).limit(1);
  if (!c) return;
  const want = c.rotate ? currentTurn(await turners(choreId), c.turn) : null;
  if (want !== c.turn) await db.update(chores).set({ turnUserId: want }).where(eq(chores.id, choreId));
}

/** After a rotating chore is done or skipped: hand it to the next person and tell them. */
async function passTurn(actor: SessionUser, chore: ChoreRow): Promise<void> {
  if (!chore.rotate) return;
  const next = nextTurn(await turners(chore.id), chore.turnUserId ?? actor.id);
  await db.update(chores).set({ turnUserId: next }).where(eq(chores.id, chore.id));
  if (next && next !== chore.turnUserId) await pushToPeople([next], { title: 'Your turn', body: chore.name, url: `/chores/${chore.id}` }, actor.id);
}

export type ChoreSupply = { inventoryId: string; qty: number; name: string; unit: string; onHand: number };

/** What a chore takes off the shelf each time it's done. */
export async function choreSuppliesFor(choreId: string): Promise<ChoreSupply[]> {
  const rows = await db
    .select({ inventoryId: choreSupplies.inventoryId, qty: choreSupplies.qty, name: inventory.name, unit: inventory.unit, onHand: inventory.qty })
    .from(choreSupplies)
    .innerJoin(inventory, eq(inventory.id, choreSupplies.inventoryId))
    .where(eq(choreSupplies.choreId, choreId));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Replace a chore's supply list. Unknown supplies and zero amounts are dropped; repeats are added up. */
async function setChoreSupplies(choreId: string, list: { inventoryId: string; qty: number }[]): Promise<void> {
  const want = new Map<string, number>();
  for (const x of list) if (x.qty > 0) want.set(x.inventoryId, (want.get(x.inventoryId) ?? 0) + x.qty);
  const known = want.size ? await db.select({ id: inventory.id }).from(inventory).where(inArray(inventory.id, [...want.keys()])) : [];
  const rows = known.map((k) => ({ choreId, inventoryId: k.id, qty: want.get(k.id)! }));
  const del = db.delete(choreSupplies).where(eq(choreSupplies.choreId, choreId));
  if (rows.length) await db.batch([del, db.insert(choreSupplies).values(rows)]);
  else await del;
}

/** What a chore's supply use is charged to: its herd if it's a care chore, else the chore itself. */
function supplyRef(chore: Pick<ChoreRow, 'id' | 'linkType' | 'linkId'>): SupplyRef {
  return chore.linkType === 'animal_group' && chore.linkId ? { type: 'animal_group', id: chore.linkId } : { type: 'chore', id: chore.id };
}

export async function addChore(user: SessionUser, data: ChoreInput): Promise<ChoreRow> {
  if (!can(user, 'work.manage')) throw new DataError('Only managers and admins can add chores.', 403);
  const id = uid('c');
  await db.insert(chores).values({
    id,
    name: data.name.trim(),
    schedule: data.schedule,
    catchUp: data.catchUp || 'skipToNext',
    nextDue: data.nextDue || todayISO(),
    requirePhoto: !!data.requirePhoto,
    open: !!data.open,
    steps: Array.isArray(data.steps) ? data.steps.filter(Boolean) : [],
    linkType: data.link?.type ?? null,
    linkId: data.link?.id ?? null,
    rotate: !!data.rotate,
  });
  await setChoreAssignees(id, data.assigneeIds ?? []);
  await syncTurn(id);
  if (data.supplies?.length) await setChoreSupplies(id, data.supplies);
  await logActivity(user.id, `added chore "${data.name.trim()}"`, { href: `/chores/${id}` });
  await pushAssigned(user.id, data.assigneeIds ?? [], 'chore', data.name.trim(), `/chores/${id}`);
  return (await choreById(id))!;
}

export async function updateChore(user: SessionUser, id: string, data: Partial<ChoreInput>): Promise<ChoreRow> {
  if (!can(user, 'work.manage')) throw new DataError('Only managers and admins can edit chores.', 403);
  const chore = await choreById(id);
  if (!chore) throw new DataError('No such chore.', 404);

  const patch: Partial<typeof chores.$inferInsert> = {};
  if (data.name != null && data.name.trim()) patch.name = data.name.trim();
  if (data.schedule) patch.schedule = data.schedule;
  if (data.catchUp) patch.catchUp = data.catchUp;
  if (data.nextDue) patch.nextDue = data.nextDue;
  patch.requirePhoto = !!data.requirePhoto;
  patch.open = !!data.open;
  if (Array.isArray(data.steps)) patch.steps = data.steps.filter(Boolean);
  if (data.rotate !== undefined) patch.rotate = !!data.rotate;

  await db.update(chores).set(patch).where(eq(chores.id, id));
  if (Array.isArray(data.supplies)) await setChoreSupplies(id, data.supplies);
  if (Array.isArray(data.assigneeIds)) {
    // Only ping people who weren't already on it — re-saving a form shouldn't
    // re-notify everyone.
    const added = data.assigneeIds.filter((u) => !chore.assigneeIds.includes(u));
    await setChoreAssignees(id, data.assigneeIds);
    await pushAssigned(user.id, added, 'chore', patch.name ?? chore.name, `/chores/${id}`);
  }
  await syncTurn(id);
  publishChange('chore');
  return (await choreById(id))!;
}

export async function deleteChore(user: SessionUser, id: string): Promise<void> {
  if (!can(user, 'work.manage')) throw new DataError('Only managers and admins can delete chores.', 403);
  await db.delete(chores).where(eq(chores.id, id)); // completions cascade via FK
  publishChange('chore');
}

export async function choreCompletionsFor(choreId: string): Promise<ChoreCompletionRow[]> {
  const rows = await db.select().from(choreCompletions).where(eq(choreCompletions.choreId, choreId));
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Consecutive-day streak (meaningful for daily chores): counts back from
 * today, or yesterday so an as-yet-undone today doesn't break the run.
 */
export async function choreStreak(choreId: string): Promise<number> {
  const rows = await db
    .select({ date: choreCompletions.date })
    .from(choreCompletions)
    .where(eq(choreCompletions.choreId, choreId));
  const days = new Set(rows.map((r) => r.date));
  let d = todayISO();
  if (!days.has(d)) d = addDays(d, -1);
  let streak = 0;
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export async function completeChore(
  user: SessionUser,
  id: string,
  notes?: string,
  photoId?: string | null,
): Promise<void> {
  await assertOwnUpload(user, photoId);
  const chore = await choreForViewer(user, id);
  if (!chore) throw new DataError('No such chore.', 404);
  if (chore.requirePhoto && !photoId) {
    throw new DataError('This chore requires a photo to complete.', 400);
  }
  const today = todayISO();
  // One-time chores don't roll forward — they're marked done and drop off
  // lists. Recurring ones move to their next occurrence.
  const advance =
    chore.schedule.type === 'once'
      ? { done: true, sentBack: null }
      : {
          nextDue:
            chore.catchUp === 'mustCatchUp'
              ? nextOccurrenceAfter(chore.schedule, chore.nextDue)
              : nextOccurrenceAfter(chore.schedule, today),
          sentBack: null,
        };
  // Recording the completion and moving the due date are one change: done
  // separately, a failure in between leaves a chore that's logged as done
  // but still shows as due (and gets done twice).
  const completionId = uid('cc');
  await db.batch([
    db.insert(choreCompletions).values({
      id: completionId,
      choreId: id,
      completedBy: user.id,
      date: today,
      notes: notes || '',
      photoId: photoId || null,
    }),
    db.update(chores).set(advance).where(eq(chores.id, id)),
  ]);
  await stopTimersFor('chore', id); // completing the work stops any running clock
  await logActivity(user.id, `completed chore "${chore.name}"`, { href: `/chores/${id}` });
  await passTurn(user, chore);

  // Take what the chore uses off the shelf. Never a reason to refuse the
  // chore — the animals were fed whatever the app thinks is in the bin — so a
  // short shelf is drawn to zero and flagged instead.
  const uses = await db.select({ inventoryId: choreSupplies.inventoryId, qty: choreSupplies.qty }).from(choreSupplies).where(eq(choreSupplies.choreId, id));
  if (uses.length) {
    const { drawn, short } = await drawWhatsThere(user, uses, `Chore: ${chore.name}`, supplyRef(chore));
    if (drawn.length) await db.update(choreCompletions).set({ suppliesUsed: drawn }).where(eq(choreCompletions.id, completionId));
    if (short.length) {
      await logActivity(user.id, `"${chore.name}" needed more than was on the shelf: ${short.map((x) => `${x.missing} ${x.unit} of ${x.name}`).join(', ')} — recount or restock`, { href: '/more/supplies' });
    }
  }
}

/** Who may move a chore's date: someone on it, or a manager. */
async function choreToReschedule(user: SessionUser, id: string): Promise<ChoreRow> {
  const chore = await choreForViewer(user, id);
  if (!chore) throw new DataError('No such chore.', 404);
  if (chore.done) throw new DataError('This chore is already done.', 400);
  if (!chore.assigneeIds.includes(user.id) && !can(user, 'work.manage')) throw new DataError('Only someone on the chore or a manager can do that.', 403);
  return chore;
}

/** Skip this occurrence of a repeating chore: no completion is logged, the next one comes due. */
export async function skipChore(user: SessionUser, id: string, note?: string): Promise<string> {
  const chore = await choreToReschedule(user, id);
  if (chore.schedule.type === 'once') throw new DataError('A one-off chore can’t be skipped — snooze it or delete it.', 400);
  const nextDue = nextOccurrenceAfter(chore.schedule, chore.nextDue);
  await db.update(chores).set({ nextDue, sentBack: null }).where(eq(chores.id, id));
  await passTurn(user, chore);
  await logActivity(user.id, `skipped chore "${chore.name}" (${chore.nextDue})${note?.trim() ? ` — ${note.trim()}` : ''}`, { href: `/chores/${id}` });
  publishChange('chore');
  return nextDue;
}

/** Push a chore to a later day (at most 60 days out). Its repeat pattern carries on from there. */
export async function snoozeChore(user: SessionUser, id: string, until: string): Promise<void> {
  const chore = await choreToReschedule(user, id);
  const today = todayISO();
  if (until <= today) throw new DataError('Pick a day after today.', 400);
  if (until > addDays(today, 60)) throw new DataError('Snooze up to 60 days; edit the chore to change it for longer.', 400);
  await db.update(chores).set({ nextDue: until }).where(eq(chores.id, id));
  await logActivity(user.id, `snoozed chore "${chore.name}" to ${until}`, { href: `/chores/${id}` });
  publishChange('chore');
}

export async function claimChore(user: SessionUser, id: string): Promise<void> {
  const chore = await choreForViewer(user, id);
  if (!chore) throw new DataError('No such chore.', 404);
  if (!can(user, 'work.claim')) throw new DataError('You can’t pick up open work.', 403);
  if (!chore.open) throw new DataError('This chore is not open to claim.', 400);
  if (chore.assigneeIds.includes(user.id)) throw new DataError('You are already on this chore.', 400);
  await addChoreAssignee(id, user.id);
  await syncTurn(id);
  await pushClaimed(user.id, user.name, chore.assigneeIds, chore.name, `/chores/${id}`);
  publishChange('chore');
}

export async function releaseChore(user: SessionUser, id: string): Promise<void> {
  const chore = await choreForViewer(user, id);
  if (!chore) throw new DataError('No such chore.', 404);
  if (!chore.open) throw new DataError('This item is not an open item.', 400);
  if (chore.assigneeIds.includes(user.id)) {
    // Stepping off yourself — anyone else on the chore stays.
    await removeChoreAssignee(id, user.id);
  } else if (can(user, 'work.manage')) {
    // A manager clearing an open chore takes everyone off it.
    await setChoreAssignees(id, []);
  } else {
    throw new DataError('Only someone on the chore or a manager can release it.', 403);
  }
  await syncTurn(id);
  publishChange('chore');
}

/** Undoes a chore completion and flags the chore "sent back" for redo. */
export async function sendBackChoreCompletion(user: SessionUser, completionId: string, reason?: string): Promise<void> {
  if (!can(user, 'work.manage')) throw new DataError('Only managers and admins can send work back.', 403);
  const rows = await db.select().from(choreCompletions).where(eq(choreCompletions.id, completionId)).limit(1);
  const comp = rows[0];
  if (!comp) throw new DataError('No such completion.', 404);

  await db.delete(choreCompletions).where(eq(choreCompletions.id, completionId));

  const chore = await choreById(comp.choreId);
  // It wasn't done after all: what it took off the shelf goes back.
  await returnSupplies(user, comp.suppliesUsed, `Sent back: ${chore?.name ?? 'chore'}`, chore ? supplyRef(chore) : null);
  if (chore) {
    const today = todayISO();
    const sentBack: SentBack = { by: user.id, at: Date.now(), reason: reason || '', worker: comp.completedBy };
    const patch: Partial<typeof chores.$inferInsert> = { sentBack, done: false };
    if (chore.nextDue > today) patch.nextDue = today;
    await db.update(chores).set(patch).where(eq(chores.id, chore.id));
    await logActivity(user.id, `sent back chore "${chore.name}"`, { href: `/chores/${chore.id}` });
    await pushSentBack(user.id, comp.completedBy, chore.name, `/chores/${chore.id}`, reason);
  }
}
