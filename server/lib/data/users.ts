import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, notificationPrefs, rentCharges, timeEntries } from '@/db/schema';
import type { Role } from '@/db/schema';
import { uid } from '@/lib/ids';
import { createInvite } from '@/lib/auth/invites';
import { DataError } from './errors';

export type PersonRow = { id: string; name: string; email: string; role: Role; pending: boolean };

export async function listUsers(): Promise<PersonRow[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, passwordHash: users.passwordHash })
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

async function assertNotLastAdmin(targetId: string, action: string) {
  const target = await db.select({ role: users.role }).from(users).where(eq(users.id, targetId)).limit(1);
  if (target[0]?.role !== 'admin') return;
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
  if (admins.length <= 1) throw new DataError(`Cannot ${action} the last remaining admin.`, 400);
}

export async function updateUserRole(targetId: string, role: Role): Promise<void> {
  if (role !== 'admin') await assertNotLastAdmin(targetId, 'demote');
  await db.update(users).set({ role }).where(eq(users.id, targetId));
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
        `Removing this person will permanently delete ${lost}. Their completed chores, service logs, and notes are kept. Confirm to proceed.`,
        409,
      );
    }
  }

  await db.delete(users).where(eq(users.id, targetId));
}
