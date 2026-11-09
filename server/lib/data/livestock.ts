/**
 * Livestock: groups (herds, flocks, pens), optional individual records,
 * events (treatments, births, sales…), breeding and daily production.
 *
 * Rules that hold everywhere:
 *  - A group's head count only changes through an event, and each event
 *    stores the change it made, so deleting it can put the count back.
 *  - Head count never goes below zero or below its living individual records.
 *  - Reading needs animals.view; logging animals.log; buying, selling,
 *    setting up and breeding animals.manage.
 */
import { and, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '@/db';
import {
  animalEvents, animalGroups, animals, breedings, chores, inventory, productionLogs, users,
  type AnimalGroupKind, type AnimalSex, type BreedingStatus, type ProductKind,
} from '@/db/schema';
import { uid } from '@/lib/ids';
import { addDays, todayISO } from '@/lib/domain/dates';
import { can, type Cap } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import {
  COUNT_SIGN, EVENT_LABEL, SPECIES, expectedDue, isSpecies, weekTrend, withdrawalUntil,
  type AnimalEventType, type Species,
} from '@/lib/domain/livestock';
import { publishChange } from '@/lib/realtime/bus';
import { logActivity } from './activity';
import { checkSupplies, consumeSupplies } from './consumption';
import { DataError } from './errors';

export type GroupRow = typeof animalGroups.$inferSelect;
export type AnimalRow = typeof animals.$inferSelect;
export type BreedingRow = typeof breedings.$inferSelect;

async function runBatch(ops: BatchItem<'sqlite'>[]) {
  if (ops.length) await db.batch(ops as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

function need(user: SessionUser, cap: Cap, what: string) {
  if (!can(user, cap)) throw new DataError(`You can’t ${what}.`, 403);
}
const animalLabel = (a: Pick<AnimalRow, 'name' | 'tag'>) => a.name || (a.tag ? `#${a.tag}` : 'an animal');
const href = (groupId: string) => `/farm/animals/${groupId}`;

async function groupOr404(id: string): Promise<GroupRow> {
  const [g] = await db.select().from(animalGroups).where(eq(animalGroups.id, id)).limit(1);
  if (!g) throw new DataError('No such group.', 404);
  return g;
}
async function liveIndividuals(groupId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(animals).where(and(eq(animals.groupId, groupId), eq(animals.status, 'active')));
  return Number(r?.n ?? 0);
}

/* ---------------- reading ---------------- */

export type GroupSummary = GroupRow & {
  speciesLabel: string;
  individuals: number;
  production: { kind: ProductKind; thisWeek: number; lastWeek: number; pct: number | null; today: number }[];
  withholdUntil: { meat: string | null; milk: string | null };
  nextDue: string | null;
};

export async function listGroups(opts: { includeInactive?: boolean } = {}): Promise<GroupSummary[]> {
  const today = todayISO();
  const groups = (await db.select().from(animalGroups)).filter((g) => opts.includeInactive || g.active);
  if (!groups.length) return [];
  const ids = groups.map((g) => g.id);
  const [ind, prod, wd, due] = await Promise.all([
    db.select({ groupId: animals.groupId, n: sql<number>`count(*)` }).from(animals).where(and(inArray(animals.groupId, ids), eq(animals.status, 'active'))).groupBy(animals.groupId),
    db.select({ groupId: productionLogs.groupId, kind: productionLogs.kind, date: productionLogs.date, amount: sql<number>`sum(${productionLogs.amount})` })
      .from(productionLogs).where(and(inArray(productionLogs.groupId, ids), gte(productionLogs.date, addDays(today, -13))))
      .groupBy(productionLogs.groupId, productionLogs.kind, productionLogs.date),
    activeWithdrawals(today),
    db.select().from(breedings).where(and(inArray(breedings.groupId, ids), inArray(breedings.status, ['bred', 'confirmed']))),
  ]);
  const indBy = new Map(ind.map((r) => [r.groupId, Number(r.n)]));
  return groups
    .map((g) => {
      const kinds = [...new Set(prod.filter((p) => p.groupId === g.id).map((p) => p.kind))];
      const production = kinds.map((kind) => {
        const daily = prod.filter((p) => p.groupId === g.id && p.kind === kind).map((p) => ({ date: p.date, amount: Number(p.amount) }));
        return { kind, ...weekTrend(daily, today), today: daily.filter((d) => d.date === today).reduce((a, d) => a + d.amount, 0) };
      });
      const mine = wd.filter((w) => w.groupId === g.id);
      const latest = (k: 'meatUntil' | 'milkUntil') => mine.map((w) => w[k]).filter((d): d is string => !!d && d > today).sort().pop() ?? null;
      const dues = due.filter((b) => b.groupId === g.id && b.dueOn).map((b) => b.dueOn!).sort();
      return {
        ...g,
        speciesLabel: isSpecies(g.species) ? SPECIES[g.species].label : g.species,
        individuals: indBy.get(g.id) ?? 0,
        production,
        withholdUntil: { meat: latest('meatUntil'), milk: latest('milkUntil') },
        nextDue: dues[0] ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function activeWithdrawals(today: string) {
  return db
    .select({ id: animalEvents.id, groupId: animalEvents.groupId, animalId: animalEvents.animalId, meatUntil: animalEvents.meatUntil, milkUntil: animalEvents.milkUntil, notes: animalEvents.notes, invName: inventory.name })
    .from(animalEvents)
    .leftJoin(inventory, eq(inventory.id, animalEvents.inventoryId))
    .where(or(sql`${animalEvents.meatUntil} > ${today}`, sql`${animalEvents.milkUntil} > ${today}`));
}

export type EventView = typeof animalEvents.$inferSelect & { userName: string | null; animalName: string | null; supplyName: string | null; supplyUnit: string | null };

export async function groupDetail(id: string) {
  const group = await groupOr404(id);
  const since = addDays(todayISO(), -29);
  const [members, events, production, breeds, care] = await Promise.all([
    db.select().from(animals).where(eq(animals.groupId, id)),
    db.select({ e: animalEvents, userName: users.name, animalName: animals.name, animalTag: animals.tag, supplyName: inventory.name, supplyUnit: inventory.unit })
      .from(animalEvents)
      .leftJoin(users, eq(users.id, animalEvents.userId))
      .leftJoin(animals, eq(animals.id, animalEvents.animalId))
      .leftJoin(inventory, eq(inventory.id, animalEvents.inventoryId))
      .where(eq(animalEvents.groupId, id))
      .orderBy(desc(animalEvents.date), desc(animalEvents.createdAt))
      .limit(60),
    db.select({ kind: productionLogs.kind, date: productionLogs.date, amount: sql<number>`sum(${productionLogs.amount})` })
      .from(productionLogs).where(and(eq(productionLogs.groupId, id), gte(productionLogs.date, since)))
      .groupBy(productionLogs.kind, productionLogs.date),
    db.select().from(breedings).where(eq(breedings.groupId, id)).orderBy(desc(breedings.bredOn)),
    db.select({ id: chores.id, name: chores.name, nextDue: chores.nextDue, done: chores.done }).from(chores).where(and(eq(chores.linkType, 'animal_group'), eq(chores.linkId, id))),
  ]);
  const byId = new Map(members.map((a) => [a.id, a]));
  return {
    group,
    species: (isSpecies(group.species) ? group.species : 'other') as Species,
    animals: members.sort((a, b) => (a.status === b.status ? animalLabel(a).localeCompare(animalLabel(b)) : a.status === 'active' ? -1 : 1)),
    events: events.map((r): EventView => ({
      ...r.e,
      userName: r.userName,
      animalName: r.e.animalId ? animalLabel({ name: r.animalName ?? '', tag: r.animalTag ?? '' }) : null,
      supplyName: r.supplyName,
      supplyUnit: r.supplyUnit,
    })),
    production: production.map((p) => ({ kind: p.kind, date: p.date, amount: Number(p.amount) })),
    breedings: breeds.map((b) => ({ ...b, damName: b.damId && byId.get(b.damId) ? animalLabel(byId.get(b.damId)!) : null })),
    care: care.filter((c) => !c.done),
  };
}

/** What Today, the digest and the calendar show about animals. */
export async function livestockAlerts(from = todayISO(), days = 14) {
  const until = addDays(from, days);
  const groups = await db.select({ id: animalGroups.id, name: animalGroups.name }).from(animalGroups).where(eq(animalGroups.active, true));
  if (!groups.length) return { births: [], withdrawals: [], eggs: null };
  const name = new Map(groups.map((g) => [g.id, g.name]));
  const [due, wd, eggs] = await Promise.all([
    db.select({ b: breedings, damName: animals.name, damTag: animals.tag }).from(breedings).leftJoin(animals, eq(animals.id, breedings.damId))
      .where(and(inArray(breedings.status, ['bred', 'confirmed']), lte(breedings.dueOn, until), gte(breedings.dueOn, addDays(from, -7)))),
    activeWithdrawals(from),
    db.select({ date: productionLogs.date, amount: sql<number>`sum(${productionLogs.amount})` }).from(productionLogs)
      .where(and(eq(productionLogs.kind, 'eggs'), gte(productionLogs.date, addDays(from, -13)))).groupBy(productionLogs.date),
  ]);
  return {
    births: due
      .filter((r) => name.has(r.b.groupId))
      .map((r) => ({ id: r.b.id, groupId: r.b.groupId, groupName: name.get(r.b.groupId)!, dam: r.b.damId ? animalLabel({ name: r.damName ?? '', tag: r.damTag ?? '' }) : null, dueOn: r.b.dueOn! }))
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
    withdrawals: wd
      .filter((w) => name.has(w.groupId))
      .map((w) => ({ id: w.id, groupId: w.groupId, groupName: name.get(w.groupId)!, what: w.invName || w.notes || 'Treatment', meatUntil: w.meatUntil && w.meatUntil > from ? w.meatUntil : null, milkUntil: w.milkUntil && w.milkUntil > from ? w.milkUntil : null })),
    eggs: eggs.length ? { ...weekTrend(eggs.map((e) => ({ date: e.date, amount: Number(e.amount) })), from), today: Number(eggs.find((e) => e.date === from)?.amount ?? 0) } : null,
  };
}

/* ---------------- groups & animals ---------------- */

export type GroupInput = { name: string; species: string; kind?: AnimalGroupKind; headCount?: number; location?: string; notes?: string };

export async function createGroup(user: SessionUser, d: GroupInput): Promise<string> {
  need(user, 'animals.manage', 'add animals');
  if (!isSpecies(d.species)) throw new DataError('Pick a kind of animal.', 400);
  const id = uid('ag');
  await db.insert(animalGroups).values({
    id, name: d.name.trim(), species: d.species, kind: d.kind ?? SPECIES[d.species].group as AnimalGroupKind,
    headCount: Math.max(0, Math.floor(d.headCount ?? 0)), location: d.location?.trim() ?? '', notes: d.notes ?? '',
  });
  await logActivity(user.id, `added ${d.name.trim()} (${d.headCount ?? 0} ${SPECIES[d.species].label.toLowerCase()})`, { href: href(id), audience: 'animals.view' });
  publishChange('animals');
  return id;
}

export async function updateGroup(user: SessionUser, id: string, d: Partial<GroupInput> & { active?: boolean }): Promise<void> {
  need(user, 'animals.manage', 'change animal groups');
  const g = await groupOr404(id);
  const patch: Partial<typeof animalGroups.$inferInsert> = {};
  if (d.name?.trim()) patch.name = d.name.trim();
  if (d.kind) patch.kind = d.kind;
  if (d.location !== undefined) patch.location = d.location.trim();
  if (d.notes !== undefined) patch.notes = d.notes;
  if (d.active !== undefined) patch.active = d.active;
  const ops: BatchItem<'sqlite'>[] = [];
  // A recount is an event too, so the history explains every change.
  if (d.headCount !== undefined && Math.floor(d.headCount) !== g.headCount) {
    const n = Math.floor(d.headCount);
    if (n < (await liveIndividuals(id))) throw new DataError('That’s fewer than the animals listed in this group — mark some sold or dead first.', 400);
    ops.push(db.insert(animalEvents).values({ id: uid('ae'), groupId: id, type: 'note', date: todayISO(), countDelta: n - g.headCount, notes: `Recounted: ${g.headCount} → ${n}`, userId: user.id }));
    patch.headCount = n;
  }
  if (Object.keys(patch).length) ops.push(db.update(animalGroups).set(patch).where(eq(animalGroups.id, id)));
  if (!ops.length) return;
  await runBatch(ops);
  publishChange('animals');
}

export type AnimalInput = { tag?: string; name?: string; sex?: AnimalSex; breed?: string; birthDate?: string | null; damId?: string | null; sireId?: string | null; notes?: string };

/**
 * Give one animal its own record. `arrived` says whether it's already counted
 * in the group ('existing'), or just born / bought (which adds one).
 */
export async function addAnimal(user: SessionUser, groupId: string, d: AnimalInput & { arrived?: 'existing' | 'born' | 'bought' }): Promise<string> {
  need(user, 'animals.manage', 'add animals');
  const g = await groupOr404(groupId);
  if (!d.name?.trim() && !d.tag?.trim()) throw new DataError('Give it a name or a tag.', 400);
  const id = uid('an');
  const arrived = d.arrived ?? 'existing';
  const live = await liveIndividuals(groupId);
  const add = arrived === 'existing' ? Math.max(0, live + 1 - g.headCount) : 1;
  const today = todayISO();
  const ops: BatchItem<'sqlite'>[] = [
    db.insert(animals).values({
      id, groupId, tag: d.tag?.trim() ?? '', name: d.name?.trim() ?? '', sex: d.sex ?? 'unknown', breed: d.breed?.trim() ?? '',
      birthDate: d.birthDate || (arrived === 'born' ? today : null), damId: d.damId || null, sireId: d.sireId || null, notes: d.notes ?? '',
    }),
  ];
  if (add) {
    ops.push(
      db.insert(animalEvents).values({ id: uid('ae'), groupId, animalId: id, type: arrived === 'bought' ? 'purchase' : arrived === 'born' ? 'birth' : 'note', date: today, countDelta: add, notes: arrived === 'existing' ? 'Head count raised to match the animals listed' : '', userId: user.id }),
      db.update(animalGroups).set({ headCount: sql`${animalGroups.headCount} + ${add}` }).where(eq(animalGroups.id, groupId)),
    );
  }
  await runBatch(ops);
  await logActivity(user.id, `added ${animalLabel({ name: d.name ?? '', tag: d.tag ?? '' })} to ${g.name}`, { href: href(groupId), audience: 'animals.view' });
  publishChange('animals');
  return id;
}

export async function updateAnimal(user: SessionUser, id: string, d: AnimalInput & { groupId?: string }): Promise<void> {
  need(user, 'animals.manage', 'change animal records');
  const [a] = await db.select().from(animals).where(eq(animals.id, id)).limit(1);
  if (!a) throw new DataError('No such animal.', 404);
  const patch: Partial<typeof animals.$inferInsert> = {};
  if (d.tag !== undefined) patch.tag = d.tag.trim();
  if (d.name !== undefined) patch.name = d.name.trim();
  if (d.sex) patch.sex = d.sex;
  if (d.breed !== undefined) patch.breed = d.breed.trim();
  if (d.birthDate !== undefined) patch.birthDate = d.birthDate || null;
  if (d.damId !== undefined) patch.damId = d.damId || null;
  if (d.sireId !== undefined) patch.sireId = d.sireId || null;
  if (d.notes !== undefined) patch.notes = d.notes;
  if (patch.name === '' && (patch.tag ?? a.tag) === '') throw new DataError('Give it a name or a tag.', 400);
  const ops: BatchItem<'sqlite'>[] = [];
  // Moving a living animal moves one head from one group to the other.
  if (d.groupId && d.groupId !== a.groupId) {
    const to = await groupOr404(d.groupId);
    patch.groupId = to.id;
    if (a.status === 'active') {
      const from = await groupOr404(a.groupId);
      const today = todayISO();
      ops.push(
        db.update(animalGroups).set({ headCount: sql`max(0, ${animalGroups.headCount} - 1)` }).where(eq(animalGroups.id, from.id)),
        db.update(animalGroups).set({ headCount: sql`${animalGroups.headCount} + 1` }).where(eq(animalGroups.id, to.id)),
        db.insert(animalEvents).values({ id: uid('ae'), groupId: from.id, animalId: null, type: 'note', date: today, countDelta: -1, notes: `${animalLabel(a)} moved to ${to.name}`, userId: user.id }),
        db.insert(animalEvents).values({ id: uid('ae'), groupId: to.id, animalId: id, type: 'note', date: today, countDelta: 1, notes: `Moved in from ${from.name}`, userId: user.id }),
      );
    }
  }
  if (Object.keys(patch).length) ops.unshift(db.update(animals).set(patch).where(eq(animals.id, id)));
  await runBatch(ops);
  publishChange('animals');
}

/* ---------------- logging ---------------- */

export async function logProduction(user: SessionUser, groupId: string, d: { kind: ProductKind; amount: number; date?: string; notes?: string }): Promise<string> {
  need(user, 'animals.log', 'log animals');
  const g = await groupOr404(groupId);
  if (!(d.amount > 0)) throw new DataError('Enter how many.', 400);
  const date = d.date || todayISO();
  if (date > todayISO()) throw new DataError('That date hasn’t happened yet.', 400);
  const id = uid('pl');
  await db.insert(productionLogs).values({ id, groupId, kind: d.kind, date, amount: d.amount, notes: d.notes ?? '', userId: user.id });
  await logActivity(user.id, `logged ${d.amount} ${d.kind === 'eggs' ? 'eggs' : `lb ${d.kind}`} from ${g.name}`, { href: href(groupId), audience: 'animals.view' });
  publishChange('animals');
  return id;
}

export type EventInput = {
  type: AnimalEventType;
  date?: string;
  animalId?: string | null;
  count?: number;
  inventoryId?: string | null;
  qtyUsed?: number | null;
  weight?: number | null;
  cost?: number | null;
  meatDays?: number | null;
  milkDays?: number | null;
  breedingId?: string | null;
  notes?: string;
};

export async function logEvent(user: SessionUser, groupId: string, d: EventInput): Promise<string> {
  need(user, d.type === 'sale' || d.type === 'purchase' ? 'animals.manage' : 'animals.log', d.type === 'sale' ? 'record sales' : d.type === 'purchase' ? 'record purchases' : 'log animals');
  const g = await groupOr404(groupId);
  const today = todayISO();
  const date = d.date || today;
  if (date > today) throw new DataError('That date hasn’t happened yet.', 400);

  let animal: AnimalRow | null = null;
  if (d.animalId) {
    [animal] = await db.select().from(animals).where(eq(animals.id, d.animalId)).limit(1);
    if (!animal || animal.groupId !== groupId) throw new DataError('That animal isn’t in this group.', 400);
    if (animal.status !== 'active') throw new DataError(`${animalLabel(animal)} is already marked ${animal.status}.`, 400);
  }
  // A birth's animal is the mother; the count is how many were born.
  const perAnimal = animal && d.type !== 'birth';
  const count = perAnimal ? 1 : Math.max(1, Math.floor(d.count ?? 1));
  const delta = COUNT_SIGN[d.type] * count;
  if (g.headCount + delta < 0) throw new DataError(`There are only ${g.headCount} in ${g.name}.`, 400);
  if (delta < 0 && !animal && g.headCount + delta < (await liveIndividuals(groupId))) {
    throw new DataError('Some of these have their own records — pick which animal it was.', 400);
  }
  if (d.type === 'weight' && !(d.weight && d.weight > 0)) throw new DataError('Enter the weight.', 400);

  const usesSupply = (d.type === 'treatment' || d.type === 'vaccination') && d.inventoryId && (d.qtyUsed ?? 0) > 0;
  const supplies = usesSupply ? await checkSupplies([{ inventoryId: d.inventoryId!, qty: d.qtyUsed! }]) : new Map();
  const supply = d.inventoryId ? supplies.get(d.inventoryId) ?? (await db.select().from(inventory).where(eq(inventory.id, d.inventoryId)).limit(1))[0] : undefined;
  const meatDays = d.meatDays ?? supply?.meatWithdrawalDays ?? null;
  const milkDays = d.milkDays ?? supply?.milkWithdrawalDays ?? null;
  const treat = d.type === 'treatment' || d.type === 'vaccination';

  let breeding: BreedingRow | undefined;
  if (d.type === 'birth' && d.breedingId) {
    [breeding] = await db.select().from(breedings).where(and(eq(breedings.id, d.breedingId), eq(breedings.groupId, groupId))).limit(1);
    if (!breeding) throw new DataError('No such breeding in this group.', 400);
  }

  const id = uid('ae');
  const ops: BatchItem<'sqlite'>[] = [
    db.insert(animalEvents).values({
      id, groupId, animalId: animal?.id ?? null, type: d.type, date, countDelta: delta,
      inventoryId: supply?.id ?? null, qtyUsed: usesSupply ? d.qtyUsed! : null,
      weight: d.type === 'weight' ? d.weight! : null, cost: d.cost ?? null,
      meatUntil: treat ? withdrawalUntil(date, meatDays) : null, milkUntil: treat ? withdrawalUntil(date, milkDays) : null,
      notes: d.notes?.trim() ?? '', userId: user.id,
    }),
  ];
  if (delta) ops.push(db.update(animalGroups).set({ headCount: sql`${animalGroups.headCount} + ${delta}` }).where(eq(animalGroups.id, groupId)));
  if (animal && (d.type === 'death' || d.type === 'sale')) ops.push(db.update(animals).set({ status: d.type === 'death' ? 'dead' : 'sold' }).where(eq(animals.id, animal.id)));
  if (breeding) ops.push(db.update(breedings).set({ status: 'born' }).where(eq(breedings.id, breeding.id)));
  await runBatch(ops);
  if (usesSupply) await consumeSupplies(user, [{ inventoryId: d.inventoryId!, qty: d.qtyUsed! }], `${EVENT_LABEL[d.type]}: ${g.name}`);

  const who = animal ? animalLabel(animal) : g.name;
  const what = d.type === 'birth' ? `${count} born in ${g.name}` : d.type === 'death' || d.type === 'sale' || d.type === 'purchase' ? `${EVENT_LABEL[d.type].toLowerCase()} — ${animal ? who : `${count} from ${g.name}`}` : `${EVENT_LABEL[d.type].toLowerCase()} for ${who}`;
  await logActivity(user.id, `logged ${what}`, { href: href(groupId), audience: d.type === 'sale' || d.cost ? 'finance.view' : 'animals.view' });
  publishChange('animals');
  return id;
}

/** Undo a mistaken entry: puts the head count and the animal's status back. Supplies aren't restocked. */
export async function deleteEvent(user: SessionUser, id: string): Promise<void> {
  need(user, 'animals.manage', 'remove animal records');
  const [e] = await db.select().from(animalEvents).where(eq(animalEvents.id, id)).limit(1);
  if (!e) throw new DataError('No such entry.', 404);
  const g = await groupOr404(e.groupId);
  if (g.headCount - e.countDelta < 0) throw new DataError('Removing this would leave a negative head count.', 400);
  const ops: BatchItem<'sqlite'>[] = [db.delete(animalEvents).where(eq(animalEvents.id, id))];
  if (e.countDelta) ops.push(db.update(animalGroups).set({ headCount: sql`${animalGroups.headCount} - ${e.countDelta}` }).where(eq(animalGroups.id, e.groupId)));
  if (e.animalId && (e.type === 'death' || e.type === 'sale')) ops.push(db.update(animals).set({ status: 'active' }).where(eq(animals.id, e.animalId)));
  await runBatch(ops);
  publishChange('animals');
}

/* ---------------- breeding ---------------- */

export async function addBreeding(user: SessionUser, groupId: string, d: { damId?: string | null; sire?: string; bredOn: string; notes?: string }): Promise<string> {
  need(user, 'animals.manage', 'plan breeding');
  const g = await groupOr404(groupId);
  if (d.damId) {
    const [a] = await db.select().from(animals).where(eq(animals.id, d.damId)).limit(1);
    if (!a || a.groupId !== groupId) throw new DataError('That animal isn’t in this group.', 400);
  }
  const id = uid('br');
  await db.insert(breedings).values({
    id, groupId, damId: d.damId || null, sire: d.sire?.trim() ?? '', bredOn: d.bredOn,
    dueOn: expectedDue(isSpecies(g.species) ? g.species : 'other', d.bredOn), notes: d.notes ?? '', userId: user.id,
  });
  publishChange('animals');
  return id;
}

export async function setBreedingStatus(user: SessionUser, id: string, status: BreedingStatus, dueOn?: string): Promise<void> {
  need(user, 'animals.manage', 'update breeding');
  const [b] = await db.select().from(breedings).where(eq(breedings.id, id)).limit(1);
  if (!b) throw new DataError('No such breeding.', 404);
  await db.update(breedings).set({ status, ...(dueOn ? { dueOn } : {}) }).where(eq(breedings.id, id));
  publishChange('animals');
}

export async function deleteBreeding(user: SessionUser, id: string): Promise<void> {
  need(user, 'animals.manage', 'update breeding');
  await db.delete(breedings).where(eq(breedings.id, id));
  publishChange('animals');
}
