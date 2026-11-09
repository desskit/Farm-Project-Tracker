/**
 * Password & code vault. Every rule lives here:
 *  - who can see an entry is the owner's choice (private / groups / farm /
 *    everyone); private means private — admins can't open it;
 *  - only the owner edits; admins can delete (e.g. a departed person's);
 *  - secrets are decrypted only on an explicit reveal, and every reveal is
 *    logged with who and when;
 *  - groups are managed by admins (people.manage).
 */
import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  users, vaultAccessLog, vaultEntries, vaultEntryGroups, vaultGroupMembers, vaultGroups, type VaultVisibility,
} from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { uid } from '@/lib/ids';
import { decrypt, encrypt } from '@/lib/vault/crypto';
import { logActivity } from './activity';
import { DataError } from './errors';

export const VISIBILITIES: VaultVisibility[] = ['private', 'groups', 'farm', 'everyone'];

export type VaultEntryView = {
  id: string;
  title: string;
  url: string;
  username: string;
  hasNotes: boolean;
  visibility: VaultVisibility;
  groupIds: string[];
  ownerId: string | null;
  ownerName: string;
  mine: boolean;
  updatedAt: number;
};

type EntryRow = typeof vaultEntries.$inferSelect;

async function myGroupIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ g: vaultGroupMembers.groupId }).from(vaultGroupMembers).where(eq(vaultGroupMembers.userId, userId));
  return new Set(rows.map((r) => r.g));
}

/** The one visibility rule. */
export function canSeeEntry(viewer: SessionUser, e: Pick<EntryRow, 'ownerId' | 'visibility'>, entryGroups: string[], viewerGroups: Set<string>): boolean {
  if (!can(viewer, 'vault.use') || viewer.previewBy) return false;
  if (e.ownerId === viewer.id) return true;
  switch (e.visibility) {
    case 'everyone': return true;
    case 'farm': return can(viewer, 'farm.view');
    case 'groups': return entryGroups.some((g) => viewerGroups.has(g));
    default: return false; // private
  }
}

async function groupsByEntry(ids: string[]): Promise<Record<string, string[]>> {
  if (!ids.length) return {};
  const rows = await db.select().from(vaultEntryGroups).where(inArray(vaultEntryGroups.entryId, ids));
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.entryId] ??= []).push(r.groupId);
  return out;
}

async function loadVisible(viewer: SessionUser, id: string): Promise<{ e: EntryRow; groups: string[] }> {
  const e = (await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).limit(1))[0];
  const groups = e ? (await groupsByEntry([id]))[id] ?? [] : [];
  if (!e || !canSeeEntry(viewer, e, groups, await myGroupIds(viewer.id))) throw new DataError('No such entry.', 404);
  return { e, groups };
}

async function log(entryId: string | null, entryTitle: string, userId: string, action: 'reveal' | 'create' | 'update' | 'delete') {
  await db.insert(vaultAccessLog).values({ id: uid('vl'), entryId, entryTitle, userId, action, ts: Date.now() });
}

/** Everything this person can see, without the secrets themselves. */
export async function listVault(viewer: SessionUser): Promise<VaultEntryView[]> {
  // Previewing as someone must not expose their private entries' names.
  if (!can(viewer, 'vault.use') || viewer.previewBy) return [];
  const [rows, mine, names] = await Promise.all([
    db.select().from(vaultEntries).orderBy(vaultEntries.title),
    myGroupIds(viewer.id),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const groups = await groupsByEntry(rows.map((r) => r.id));
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  return rows
    .filter((e) => canSeeEntry(viewer, e, groups[e.id] ?? [], mine))
    .map((e) => ({
      id: e.id,
      title: e.title,
      url: e.url,
      username: decrypt(e.usernameEnc),
      hasNotes: !!e.notesEnc,
      visibility: e.visibility,
      groupIds: groups[e.id] ?? [],
      ownerId: e.ownerId,
      ownerName: (e.ownerId && nameById.get(e.ownerId)) || 'Former member',
      mine: e.ownerId === viewer.id,
      updatedAt: e.updatedAt,
    }));
}

/** Decrypts the secret (and notes) for someone allowed to see the entry, and logs it. */
export async function revealEntry(viewer: SessionUser, id: string): Promise<{ secret: string; notes: string }> {
  const { e } = await loadVisible(viewer, id);
  await log(e.id, e.title, viewer.id, 'reveal');
  return { secret: decrypt(e.secretEnc), notes: decrypt(e.notesEnc) };
}

export type EntryInput = {
  title: string;
  url?: string;
  username?: string;
  /** Required on create; on update, blank keeps the current one. */
  secret?: string;
  notes?: string;
  visibility: VaultVisibility;
  groupIds?: string[];
};

async function checkSharing(data: EntryInput): Promise<string[]> {
  if (!VISIBILITIES.includes(data.visibility)) throw new DataError('Choose who can see it.', 400);
  if (data.visibility !== 'groups') return [];
  const ids = [...new Set(data.groupIds ?? [])];
  if (!ids.length) throw new DataError('Pick at least one group to share with.', 400);
  const found = await db.select({ id: vaultGroups.id }).from(vaultGroups).where(inArray(vaultGroups.id, ids));
  if (found.length !== ids.length) throw new DataError('One of those groups no longer exists.', 400);
  return ids;
}

export async function createEntry(viewer: SessionUser, data: EntryInput): Promise<string> {
  if (!can(viewer, 'vault.create')) throw new DataError('You can view shared passwords but not add your own.', 403);
  const title = data.title.trim();
  if (!title) throw new DataError('Give it a name.', 400);
  if (!data.secret) throw new DataError('Enter the password or code.', 400);
  const groupIds = await checkSharing(data);
  const id = uid('vx');
  await db.batch([
    db.insert(vaultEntries).values({
      id, ownerId: viewer.id, title, url: (data.url ?? '').trim(),
      usernameEnc: encrypt((data.username ?? '').trim()), secretEnc: encrypt(data.secret), notesEnc: encrypt((data.notes ?? '').trim()),
      visibility: data.visibility,
    }),
    ...groupIds.map((g) => db.insert(vaultEntryGroups).values({ entryId: id, groupId: g })),
  ]);
  await log(id, title, viewer.id, 'create');
  return id;
}

export async function updateEntry(viewer: SessionUser, id: string, data: EntryInput): Promise<void> {
  const e = (await db.select().from(vaultEntries).where(eq(vaultEntries.id, id)).limit(1))[0];
  if (!e || e.ownerId !== viewer.id || !can(viewer, 'vault.create')) throw new DataError('Only the person who added it can change it.', 403);
  const title = data.title.trim();
  if (!title) throw new DataError('Give it a name.', 400);
  const groupIds = await checkSharing(data);
  await db.batch([
    db.update(vaultEntries).set({
      title, url: (data.url ?? '').trim(), usernameEnc: encrypt((data.username ?? '').trim()), notesEnc: encrypt((data.notes ?? '').trim()),
      ...(data.secret ? { secretEnc: encrypt(data.secret) } : {}),
      visibility: data.visibility, updatedAt: Date.now(),
    }).where(eq(vaultEntries.id, id)),
    db.delete(vaultEntryGroups).where(eq(vaultEntryGroups.entryId, id)),
    ...groupIds.map((g) => db.insert(vaultEntryGroups).values({ entryId: id, groupId: g })),
  ]);
  await log(id, title, viewer.id, 'update');
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

/** Who opened an entry and when: for its owner and admins. */
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
  // Entries shared only with this group become visible to their owner only.
  await db.delete(vaultGroups).where(eq(vaultGroups.id, id));
  await logActivity(viewer.id, 'deleted a sharing group', { audience: 'people.manage' });
}
