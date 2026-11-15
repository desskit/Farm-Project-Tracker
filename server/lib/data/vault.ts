/**
 * Password & code vault. Every rule lives here:
 *  - who can see an entry is its owner's share list (people, groups, roles,
 *    the whole farm, or everyone), each line view-only or able to edit, and
 *    each optionally ending after a date. Shared with nobody means private:
 *    admins can't open it either;
 *  - the owner and people with edit access change the contents; only the
 *    owner changes who it's shared with; admins can delete (e.g. a departed
 *    person's);
 *  - secrets are decrypted only on an explicit reveal, and every reveal and
 *    change is logged with who and when;
 *  - groups are managed by admins (people.manage).
 */
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { users, vaultAccessLog, vaultEntries, vaultGroupMembers, vaultGroups, vaultShares } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { can, ROLE_LABEL, ROLES, type Role } from '@/lib/domain/permissions';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { accessFor, accessUntil, canGrantEdit, dedupeShares, isExpired, type Access, type Share, type ShareType, type Viewer } from '@/lib/domain/vault-sharing';
import { uid } from '@/lib/ids';
import { decrypt, encrypt } from '@/lib/vault/crypto';
import { pushToPeople } from '@/lib/notify/events';
import { logActivity } from './activity';
import { DataError } from './errors';
import { recipientsWith } from './recipients';

export type ShareView = Share & { id: string; label: string; expired: boolean };

export type VaultEntryView = {
  id: string;
  title: string;
  url: string;
  username: string;
  hasNotes: boolean;
  ownerId: string | null;
  ownerName: string;
  mine: boolean;
  access: Access;
  /** For people it's shared with: the last day they can open it (null = no end). */
  until: string | null;
  /** The share list, for the owner only (others don't see who else has it). */
  shares: ShareView[];
  /** "Only me", "Laura, Crew +2": the owner's one-line summary. */
  summary: string;
  updatedAt: number;
};

type EntryRow = typeof vaultEntries.$inferSelect;
type ShareRow = typeof vaultShares.$inferSelect;

const toShare = (r: ShareRow): Share => ({ type: r.targetType, target: r.targetId, canEdit: r.canEdit, expiresOn: r.expiresOn });

async function viewerOf(user: SessionUser): Promise<Viewer> {
  const rows = await db.select({ g: vaultGroupMembers.groupId }).from(vaultGroupMembers).where(eq(vaultGroupMembers.userId, user.id));
  return { id: user.id, role: user.role, onFarm: can(user, 'farm.view'), groups: new Set(rows.map((r) => r.g)) };
}

async function sharesByEntry(ids: string[]): Promise<Record<string, ShareRow[]>> {
  if (!ids.length) return {};
  const rows = await db.select().from(vaultShares).where(inArray(vaultShares.entryId, ids));
  const out: Record<string, ShareRow[]> = {};
  for (const r of rows) (out[r.entryId] ??= []).push(r);
  return out;
}

function accessOf(viewer: SessionUser, v: Viewer, e: Pick<EntryRow, 'ownerId'>, shares: ShareRow[], today: string): Access | null {
  if (!can(viewer, 'vault.use') || viewer.previewBy) return null;
  return accessFor(e.ownerId, shares.map(toShare), v, today);
}

async function loadFor(viewer: SessionUser, id: string): Promise<{ e: EntryRow; shares: ShareRow[]; access: Access }> {
  const e = (await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).limit(1))[0];
  const shares = e ? (await sharesByEntry([id]))[id] ?? [] : [];
  const access = e ? accessOf(viewer, await viewerOf(viewer), e, shares, todayISO()) : null;
  if (!e || !access) throw new DataError('No such entry.', 404);
  return { e, shares, access };
}

async function log(entryId: string | null, entryTitle: string, userId: string, action: 'reveal' | 'create' | 'update' | 'delete') {
  await db.insert(vaultAccessLog).values({ id: uid('vl'), entryId, entryTitle, userId, action, ts: Date.now() });
}

/** Names for share lines: people, groups and roles. */
async function shareLabels(): Promise<(r: Pick<ShareRow, 'targetType' | 'targetId'>) => string> {
  const [people, groups] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    db.select({ id: vaultGroups.id, name: vaultGroups.name }).from(vaultGroups),
  ]);
  const person = new Map(people.map((p) => [p.id, p.name]));
  const group = new Map(groups.map((g) => [g.id, g.name]));
  return (r) => {
    switch (r.targetType) {
      case 'user': return person.get(r.targetId) ?? 'Former member';
      case 'group': return `${group.get(r.targetId) ?? 'Deleted group'} (group)`;
      case 'role': return `Everyone who’s ${ROLE_LABEL[r.targetId as Role] ?? r.targetId}`;
      case 'farm': return 'Everyone on the farm';
      case 'everyone': return 'Everyone, renters too';
      default: return 'Someone';
    }
  };
}

/** A short "who has it" line for the owner's list: "Only me", "Laura, Crew +2". */
export function shareSummary(shares: Pick<ShareView, 'label' | 'expired'>[]): string {
  const live = shares.filter((x) => !x.expired);
  if (!live.length) return shares.length ? 'Only me (shares ended)' : 'Only me';
  const names = live.map((x) => x.label.replace(/ \(group\)$/, ''));
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/** Everything this person can see, without the secrets themselves. */
export async function listVault(viewer: SessionUser): Promise<VaultEntryView[]> {
  // Previewing as someone must not expose their private entries' names.
  if (!can(viewer, 'vault.use') || viewer.previewBy) return [];
  const today = todayISO();
  const [rows, v, names, label] = await Promise.all([
    db.select().from(vaultEntries).orderBy(vaultEntries.title),
    viewerOf(viewer),
    db.select({ id: users.id, name: users.name }).from(users),
    shareLabels(),
  ]);
  const shares = await sharesByEntry(rows.map((r) => r.id));
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  const out: VaultEntryView[] = [];
  for (const e of rows) {
    const list = shares[e.id] ?? [];
    const access = accessOf(viewer, v, e, list, today);
    if (!access) continue;
    const mineShares: ShareView[] = access === 'owner'
      ? list.map((r) => ({ ...toShare(r), id: r.id, label: label(r), expired: isExpired(toShare(r), today) }))
        .sort((a, b) => Number(a.expired) - Number(b.expired) || a.label.localeCompare(b.label))
      : [];
    out.push({
      id: e.id,
      title: e.title,
      url: e.url,
      username: decrypt(e.usernameEnc),
      hasNotes: !!e.notesEnc,
      ownerId: e.ownerId,
      ownerName: (e.ownerId && nameById.get(e.ownerId)) || 'Former member',
      mine: access === 'owner',
      access,
      until: access === 'owner' ? null : accessUntil(list.map(toShare), v, today),
      shares: mineShares,
      summary: access === 'owner' ? shareSummary(mineShares) : '',
      updatedAt: e.updatedAt,
    });
  }
  return out;
}

/** Decrypts the secret (and notes) for someone allowed to see the entry, and logs it. */
export async function revealEntry(viewer: SessionUser, id: string): Promise<{ secret: string; notes: string }> {
  const { e } = await loadFor(viewer, id);
  await log(e.id, e.title, viewer.id, 'reveal');
  return { secret: decrypt(e.secretEnc), notes: decrypt(e.notesEnc) };
}

export type ShareInput = { type: ShareType; target?: string; canEdit?: boolean; expiresOn?: string | null };

export type EntryInput = {
  title: string;
  url?: string;
  username?: string;
  /** Required on create; on update, blank keeps the current one. */
  secret?: string;
  notes?: string;
  /** Who it's shared with. Only the owner's list counts; empty = private. Left out on update = unchanged. */
  shares?: ShareInput[];
};

export const MAX_SHARES = 50;

/** Checks a share list against who and what exists. */
async function checkShares(owner: SessionUser, input: ShareInput[]): Promise<Share[]> {
  if (input.length > MAX_SHARES) throw new DataError(`That’s more than ${MAX_SHARES} share lines.`, 400);
  const list = dedupeShares(input.map((x) => ({ type: x.type, target: x.target ?? '', canEdit: !!x.canEdit, expiresOn: x.expiresOn || null })))
    .filter((x) => !(x.type === 'user' && x.target === owner.id));
  const people = list.some((x) => x.type === 'user') ? new Set((await recipientsWith('vault.use')).map((p) => p.id)) : new Set<string>();
  const groupIds = list.filter((x) => x.type === 'group').map((x) => x.target);
  const groups = groupIds.length ? new Set((await db.select({ id: vaultGroups.id }).from(vaultGroups).where(inArray(vaultGroups.id, groupIds))).map((g) => g.id)) : new Set<string>();
  for (const x of list) {
    if (x.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(x.expiresOn)) throw new DataError('Check the end date.', 400);
    if (x.type === 'user' && !people.has(x.target)) throw new DataError('One of those people can’t use passwords (or has left).', 400);
    if (x.type === 'group' && !groups.has(x.target)) throw new DataError('One of those groups no longer exists.', 400);
    if (x.type === 'role' && !(ROLES as readonly string[]).includes(x.target)) throw new DataError('Pick a role to share with.', 400);
  }
  return list;
}

const shareRows = (entryId: string, list: Share[]) =>
  list.map((x) => db.insert(vaultShares).values({ id: uid('vs'), entryId, targetType: x.type, targetId: x.target, canEdit: x.canEdit && canGrantEdit(x.type), expiresOn: x.expiresOn }));

/** Tell people newly named on an entry. Groups, roles and the whole farm are not pinged. */
async function announce(owner: SessionUser, title: string, before: Share[], after: Share[]) {
  const had = new Set(before.filter((x) => x.type === 'user').map((x) => x.target));
  const added = after.filter((x) => x.type === 'user' && !had.has(x.target));
  for (const x of added) {
    const what = x.canEdit ? 'can view and edit it' : 'can view it';
    await pushToPeople([x.target], { title: 'A password was shared with you', body: `${owner.name} shared “${title}”. You ${what}${x.expiresOn ? ` until ${fmtDate(x.expiresOn)}` : ''}.`, url: '/vault' }, owner.id);
  }
}

export async function createEntry(viewer: SessionUser, data: EntryInput): Promise<string> {
  if (!can(viewer, 'vault.create')) throw new DataError('You can view shared passwords but not add your own.', 403);
  const title = data.title.trim();
  if (!title) throw new DataError('Give it a name.', 400);
  if (!data.secret) throw new DataError('Enter the password or code.', 400);
  const shares = await checkShares(viewer, data.shares ?? []);
  const id = uid('vx');
  await db.batch([
    db.insert(vaultEntries).values({
      id, ownerId: viewer.id, title, url: (data.url ?? '').trim(),
      usernameEnc: encrypt((data.username ?? '').trim()), secretEnc: encrypt(data.secret), notesEnc: encrypt((data.notes ?? '').trim()),
      visibility: shares.length ? 'groups' : 'private',
    }),
    ...shareRows(id, shares),
  ]);
  await log(id, title, viewer.id, 'create');
  await announce(viewer, title, [], shares);
  return id;
}

/**
 * The owner changes anything; someone with edit access changes the name,
 * username, password, website and notes, but not who it's shared with.
 */
export async function updateEntry(viewer: SessionUser, id: string, data: EntryInput): Promise<void> {
  const found = await loadFor(viewer, id).catch(() => null);
  if (!found || found.access === 'view') throw new DataError('Only the person who added it, or someone they let edit it, can change it.', 403);
  const { e, access } = found;
  const title = data.title.trim();
  if (!title) throw new DataError('Give it a name.', 400);
  const owner = access === 'owner';
  const before = found.shares.map(toShare);
  const shares = owner && data.shares ? await checkShares(viewer, data.shares) : null;
  await db.batch([
    db.update(vaultEntries).set({
      title, url: (data.url ?? '').trim(), usernameEnc: encrypt((data.username ?? '').trim()), notesEnc: encrypt((data.notes ?? '').trim()),
      ...(data.secret ? { secretEnc: encrypt(data.secret) } : {}),
      ...(shares ? { visibility: shares.length ? 'groups' as const : 'private' as const } : {}),
      updatedAt: Date.now(),
    }).where(eq(vaultEntries.id, id)),
    ...(shares ? [db.delete(vaultShares).where(eq(vaultShares.entryId, id)), ...shareRows(id, shares)] : []),
  ]);
  await log(id, title, viewer.id, 'update');
  if (shares) await announce(viewer, title, before, shares);
  // The owner hears when someone else changes their entry.
  if (!owner && e.ownerId) await pushToPeople([e.ownerId], { title: 'Your password was changed', body: `${viewer.name} updated “${title}”.`, url: '/vault' }, viewer.id);
}

/** The owner, or an admin (who may remove an entry without being able to open it). */
export async function deleteEntry(viewer: SessionUser, id: string): Promise<void> {
  const e = (await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).limit(1))[0];
  if (!e) throw new DataError('No such entry.', 404);
  if (e.ownerId !== viewer.id && !can(viewer, 'people.manage')) throw new DataError('Only the person who added it, or an admin, can delete it.', 403);
  await db.delete(vaultEntries).where(eq(vaultEntries.id, id));
  await log(null, e.title, viewer.id, 'delete');
  if (e.ownerId !== viewer.id) await logActivity(viewer.id, `deleted a vault entry ("${e.title}")`, { audience: 'people.manage' });
}

/** Who opened or changed an entry and when: for its owner and admins. */
export async function accessLogFor(viewer: SessionUser, id: string): Promise<{ who: string; action: string; ts: number }[]> {
  const e = (await db.select({ ownerId: vaultEntries.ownerId }).from(vaultEntries).where(eq(vaultEntries.id, id)).limit(1))[0];
  if (!e || (e.ownerId !== viewer.id && !can(viewer, 'people.manage'))) throw new DataError('No such entry.', 404);
  const rows = await db
    .select({ who: users.name, action: vaultAccessLog.action, ts: vaultAccessLog.ts })
    .from(vaultAccessLog)
    .leftJoin(users, eq(users.id, vaultAccessLog.userId))
    .where(eq(vaultAccessLog.entryId, id))
    .orderBy(desc(vaultAccessLog.ts))
    .limit(50);
  return rows.map((r) => ({ ...r, who: r.who ?? 'Former member' }));
}

/** People an entry can be shared with (everyone who can use passwords). */
export async function vaultPeople(): Promise<{ id: string; name: string }[]> {
  return (await recipientsWith('vault.use')).map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------------- groups (admins) ---------------- */
export type VaultGroupView = { id: string; name: string; description: string; memberIds: string[] };

export async function listGroups(): Promise<VaultGroupView[]> {
  const [groups, members] = await Promise.all([db.select().from(vaultGroups).orderBy(vaultGroups.name), db.select().from(vaultGroupMembers)]);
  return groups.map((g) => ({ id: g.id, name: g.name, description: g.description, memberIds: members.filter((m) => m.groupId === g.id).map((m) => m.userId) }));
}

function assertGroupAdmin(viewer: SessionUser) {
  if (!can(viewer, 'people.manage')) throw new DataError('Only admins manage sharing groups.', 403);
}

export async function saveGroup(viewer: SessionUser, data: { id?: string; name: string; description?: string; memberIds: string[] }): Promise<string> {
  assertGroupAdmin(viewer);
  const name = data.name.trim();
  if (!name) throw new DataError('Give the group a name.', 400);
  const memberIds = [...new Set(data.memberIds)];
  const id = data.id ?? uid('vg');
  if (data.id) {
    const exists = await db.select({ id: vaultGroups.id }).from(vaultGroups).where(eq(vaultGroups.id, id)).limit(1);
    if (!exists.length) throw new DataError('No such group.', 404);
  }
  await db.batch([
    data.id
      ? db.update(vaultGroups).set({ name, description: (data.description ?? '').trim() }).where(eq(vaultGroups.id, id))
      : db.insert(vaultGroups).values({ id, name, description: (data.description ?? '').trim(), createdBy: viewer.id }),
    db.delete(vaultGroupMembers).where(eq(vaultGroupMembers.groupId, id)),
    ...memberIds.map((u) => db.insert(vaultGroupMembers).values({ groupId: id, userId: u })),
  ]);
  await logActivity(viewer.id, `${data.id ? 'updated' : 'created'} the sharing group "${name}"`, { audience: 'people.manage' });
  return id;
}

export async function deleteGroup(viewer: SessionUser, id: string): Promise<void> {
  assertGroupAdmin(viewer);
  // Share lines naming this group go with it; entries shared only with it become private.
  await db.batch([
    db.delete(vaultShares).where(and(eq(vaultShares.targetType, 'group'), eq(vaultShares.targetId, id))),
    db.delete(vaultGroups).where(eq(vaultGroups.id, id)),
  ]);
  await logActivity(viewer.id, 'deleted a sharing group', { audience: 'people.manage' });
}
