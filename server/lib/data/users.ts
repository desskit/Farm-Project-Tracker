import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, notificationPrefs, rentCharges, timeEntries, sessions, pushSubscriptions, userCaps } from '@/db/schema';
import type { Role } from '@/db/schema';
import { uid } from '@/lib/ids';
import { createInvite } from '@/lib/auth/invites';
import { purgeRentDocsFor, rentDocCountFor } from './rent-docs';
import { DataError } from './errors';
import { logActivity } from './activity';
import { CAP_LABEL, ROLE_LABEL, toggleable, type Cap } from '@/lib/domain/permissions';

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  pending: boolean;
  active: boolean;
  /** Epoch ms after which they can't sign in, or null. */
  accessExpiresAt: number | null;
  /** Per-person switches (only those their role allows are honoured). */
  overrides: { cap: string; allow: boolean }[];
};

/**
 * Everyone, including deactivated people — callers need the full set to resolve
 * names on historical records. Use the `active` flag to decide who can still be
 * assigned new work.
 */
export async function listUsers(): Promise<PersonRow[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      passwordHash: users.passwordHash,
      active: users.active,
      accessExpiresAt: users.accessExpiresAt,
    })
    .from(users)
    .orderBy(users.name);
  const caps = await db.select({ userId: userCaps.userId, cap: userCaps.cap, allow: userCaps.allow }).from(userCaps);
  return rows.map(({ passwordHash, ...rest }) => ({
    ...rest,
    pending: !passwordHash,
    overrides: caps.filter((c) => c.userId === rest.id).map(({ cap, allow }) => ({ cap, allow })),
  }));
}

/** Creates a person (no password yet) and mints an invite token for them. */
export async function createUserWithInvite(data: { name: string; email: string; role: Role }) {
  const email = data.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new DataError('A person with that email already exists.', 409);

  const id = uid('u');
  await db.insert(users).values({ id, name: data.name.trim(), email, role: data.role });
  await db.insert(notificationPrefs).values({ userId: id });
  const invite = await createInvite(id);
  return { id, inviteToken: invite.token };
}

/**
 * Guards against locking the farm out of its own admin tools. Only *active*
 * admins count — a deactivated admin can't sign in, so they can't be the one
 * remaining administrator.
 */
async function assertNotLastAdmin(targetId: string, action: string) {
  const target = await db.select({ role: users.role, active: users.active }).from(users).where(eq(users.id, targetId)).limit(1);
  if (target[0]?.role !== 'admin' || !target[0]?.active) return;
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.active, true)));
  if (admins.length <= 1) throw new DataError(`Cannot ${action} the last remaining admin.`, 400);
}

export async function updateUserRole(targetId: string, role: Role): Promise<void> {
  if (role !== 'admin') await assertNotLastAdmin(targetId, 'demote');
  // Admins never have an end date (see setAccessExpiry).
  await db.update(users).set(role === 'admin' ? { role, accessExpiresAt: null } : { role }).where(eq(users.id, targetId));
}

/**
 * Turns one of a person's switchable permissions on or off, or (allow = null)
 * back to their role's default. Only capabilities their role marks as
 * switchable can be set — crew can be given "manage work", never "admin".
 */
export async function setUserCap(actorId: string, targetId: string, cap: Cap, allow: boolean | null): Promise<void> {
  const target = await db.select({ name: users.name, role: users.role }).from(users).where(eq(users.id, targetId)).limit(1);
  if (!target[0]) throw new DataError('No such person.', 404);
  if (!toggleable(target[0].role).includes(cap)) {
    throw new DataError(`${ROLE_LABEL[target[0].role]} can't have that switched.`, 400);
  }
  if (allow === null) {
    await db.delete(userCaps).where(and(eq(userCaps.userId, targetId), eq(userCaps.cap, cap)));
  } else {
    await db
      .insert(userCaps)
      .values({ userId: targetId, cap, allow, setBy: actorId, setAt: Date.now() })
      .onConflictDoUpdate({ target: [userCaps.userId, userCaps.cap], set: { allow, setBy: actorId, setAt: Date.now() } });
  }
  await logActivity(
    actorId,
    `${allow === null ? 'reset' : allow ? 'allowed' : 'removed'} “${CAP_LABEL[cap]}” for ${target[0].name}`, { audience: 'people.manage', href: '/people' });
}

/**
 * Sets (or clears, with null) the moment someone's access ends. Meant for
 * guests and seasonal help; admins can't have one, so the farm can't be
 * locked out by a date passing. Ending it in the past signs them out now.
 */
export async function setAccessExpiry(actorId: string, targetId: string, expiresAt: number | null): Promise<void> {
  if (targetId === actorId && expiresAt !== null) throw new DataError('You can’t set an end date on your own access.', 400);
  const target = await db.select({ name: users.name, role: users.role }).from(users).where(eq(users.id, targetId)).limit(1);
  if (!target[0]) throw new DataError('No such person.', 404);
  if (target[0].role === 'admin' && expiresAt !== null) throw new DataError('Admins can’t have an end date.', 400);
  await db.update(users).set({ accessExpiresAt: expiresAt }).where(eq(users.id, targetId));
  if (expiresAt !== null && expiresAt <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.userId, targetId));
  }
  await logActivity(
    actorId,
    expiresAt === null ? `removed the end date on ${target[0].name}'s access` : `set ${target[0].name}'s access to end ${new Date(expiresAt).toLocaleDateString()}`, { audience: 'people.manage', href: '/people' });
}

/**
 * Switches an account off: they can't sign in, existing sessions stop working
 * immediately, and they're no longer offered for new assignments — but every
 * completion, service log, note, rent charge, and time entry stays intact.
 * This is the safe alternative to removeUser().
 */
export async function deactivateUser(targetId: string, actingUserId: string): Promise<void> {
  if (targetId === actingUserId) throw new DataError('You cannot deactivate your own account.', 400);
  await assertNotLastAdmin(targetId, 'deactivate');
  await db.update(users).set({ active: false, deactivatedAt: Date.now() }).where(eq(users.id, targetId));
  // Drop their sessions so nothing lingers server-side.
  await db.delete(sessions).where(eq(sessions.userId, targetId));
  // Stop sending them digests and push while they're switched off.
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, targetId));
}

/** Turns a deactivated account back on. They sign in with their old password. */
export async function reactivateUser(targetId: string): Promise<void> {
  await db.update(users).set({ active: true, deactivatedAt: null }).where(eq(users.id, targetId));
}

/**
 * Removes a person. Chore completions, service logs, notes, and activity are
 * kept (those columns null out), but rent charges, logged time, and rental
 * paperwork go with the account — so when a person has any of those, we refuse
 * the first attempt and report exactly what would be lost. The caller re-sends
 * with force once the admin has confirmed.
 */
export async function removeUser(
  targetId: string,
  actingUserId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (targetId === actingUserId) throw new DataError('You cannot remove your own account.', 400);
  await assertNotLastAdmin(targetId, 'remove');

  if (!opts.force) {
    const [charges, entries, docCount] = await Promise.all([
      db.select({ id: rentCharges.id }).from(rentCharges).where(eq(rentCharges.userId, targetId)),
      db.select({ id: timeEntries.id }).from(timeEntries).where(eq(timeEntries.userId, targetId)),
      rentDocCountFor(targetId),
    ]);
    if (charges.length || entries.length || docCount) {
      const lost = [
        charges.length ? `${charges.length} rent charge${charges.length === 1 ? '' : 's'}` : null,
        entries.length ? `${entries.length} logged time entr${entries.length === 1 ? 'y' : 'ies'}` : null,
        docCount ? `${docCount} rental document${docCount === 1 ? '' : 's'} (lease, deposit receipt, etc.)` : null,
      ]
        .filter(Boolean)
        .join(', ');
      throw new DataError(
        `Removing this person will permanently delete ${lost}. Deactivating them instead keeps every record and still blocks their access. Confirm only if you really want the data gone.`,
        409,
      );
    }
  }

  // Delete the paperwork and its files first: the cascade would drop the rows
  // but leave the files readable, since the access check works off those rows.
  await purgeRentDocsFor(targetId);
  await db.delete(users).where(eq(users.id, targetId));
}
