/**
 * Data-layer test helpers: a migrated temp database (see setup-env.ts) plus
 * small factories. Import from a test file and call `await useTestDb()` at
 * the top level or in beforeAll.
 */
import path from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { db, client } from '@/db';
import * as schema from '@/db/schema';
import type { Role } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';

let migrated = false;

export async function useTestDb() {
  if (!migrated) {
    await migrate(db, { migrationsFolder: path.resolve(__dirname, '../db/migrations') });
    migrated = true;
  }
  return { db, client, schema };
}

let seq = 0;
/** Inserts a user and returns the session-shaped object data functions take. */
export async function makeUser(role: Role = 'worker', name?: string): Promise<SessionUser> {
  seq++;
  const u = { id: `u_t${seq}`, name: name ?? `${role}${seq}`, email: `${role}${seq}@test.local`, role };
  await db.insert(schema.users).values(u);
  return u;
}
