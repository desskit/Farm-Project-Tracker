import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, notificationPrefs } from '@/db/schema';
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

export async function removeUser(targetId: string, actingUserId: string): Promise<void> {
  if (targetId === actingUserId) throw new DataError('You cannot remove your own account.', 400);
  await assertNotLastAdmin(targetId, 'remove');
  await db.delete(users).where(eq(users.id, targetId));
}
