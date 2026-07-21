/**
 * Applies generated Drizzle migrations to the configured database.
 * Run after `npm run db:generate`. Safe to run repeatedly (idempotent).
 */
import 'dotenv/config';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { db } from './index';

async function main() {
  const url = process.env.DATABASE_URL || 'file:./data/app.db';
  if (url.startsWith('file:')) {
    const p = url.slice('file:'.length);
    mkdirSync(dirname(p), { recursive: true });
  }
  await migrate(db, { migrationsFolder: './db/migrations' });
  // eslint-disable-next-line no-console
  console.log('Migrations applied.');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
