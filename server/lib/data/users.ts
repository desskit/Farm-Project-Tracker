import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, notificationPrefs, rentCharges, timeEntries, sessions, pushSubscriptions } from '@/db/schema';
import type { Role } from '@/db/schema';
import { uid } from '@/lib/ids';
import { createInvite } from '@/lib/auth/invites';
import { DataError } from './errors';

export type PersonRow = { id: string; name: string; email: string; role: Role; pending: boolean; active: boolean };

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
    })
    .from(users)
    .orderBy(users.name);
  return rows.map(({ passwordHash, ...rest }) => ({ ...rest, pending: !passwordHash }));
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
  await db.update(users).set({ role }).where(eq(users.id, targetId));
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
 * kept (those columns null out), but rent charges and logged time cascade away
 * with the account — so when a person has either, we refuse the first attempt
 * and report exactly what would be lost. The caller re-sends with force once
 * the admin has confirmed.
 */
export async function removeUser(
  targetId: string,
  actingUserId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (targetId === actingUserId) throw new DataError('You cannot remove your own account.', 400);
  await assertNotLastAdmin(targetId, 'remove');

  if (!opts.force) {
    const [charges, entries] = await Promise.all([
      db.select({ id: rentCharges.id }).from(rentCharges).where(eq(rentCharges.userId, targetId)),
      db.select({ id: timeEntries.id }).from(timeEntries).where(eq(timeEntries.userId, targetId)),
    ]);
    if (charges.length || entries.length) {
      const lost = [
        charges.length ? `${charges.length} rent charge${charges.length === 1 ? '' : 's'}` : null,
        entries.length ? `${entries.length} logged time entr${entries.length === 1 ? 'y' : 'ies'}` : null,
      ]
        .filter(Boolean)
        .join(' and ');
      throw new DataError(
        `Removing this person will permanently delete ${lost}. Deactivating them instead keeps every record and still blocks their access. Confirm only if you really want the data gone.`,
        409,
      );
    }
  }

  await db.delete(users).where(eq(users.id, targetId));
}
