import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

const url = process.env.DATABASE_URL || 'file:./data/app.db';

// libsql opens the file eagerly, so make sure its parent directory exists first
// (the Docker /data volume normally exists, but this keeps local/CI runs safe).
if (url.startsWith('file:')) {
  mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
}

// A single shared client per process. Next.js can re-evaluate modules in dev,
// so cache it on globalThis to avoid opening multiple handles to the file.
const globalForDb = globalThis as unknown as { __fptClient?: ReturnType<typeof createClient> };

export const client = globalForDb.__fptClient ?? createClient({ url });
if (process.env.NODE_ENV !== 'production') globalForDb.__fptClient = client;

export const db = drizzle(client, { schema });
export { schema };
