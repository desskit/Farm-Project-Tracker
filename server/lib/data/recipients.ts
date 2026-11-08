/**
 * Who should hear about something: everyone currently able to sign in whose
 * permissions include `cap`, with their personal switches applied. Every
 * notification audience goes through here, so a person's access and their
 * notifications can't drift apart.
 */
import 'server-only';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { userCaps, users } from '@/db/schema';
import { resolveCaps, type Cap } from '@/lib/domain/permissions';
import type { Role } from '@/db/schema';

export type Recipient = { id: string; name: string; email: string; role: Role };

export async function recipientsWith(cap: Cap): Promise<Recipient[]> {
  const now = Date.now();
  const people = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.active, true), or(isNull(users.accessExpiresAt), gt(users.accessExpiresAt, now))));
  const overrides = await db.select().from(userCaps);
  return people.filter((p) =>
    resolveCaps(p.role, overrides.filter((o) => o.userId === p.id)).includes(cap),
  );
}
