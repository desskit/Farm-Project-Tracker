/** Simple key/value settings store (weather cache, etc.). */
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { settings } from '@/db/schema';

export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return (rows[0]?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const existing = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).limit(1);
  if (existing.length) await db.update(settings).set({ value }).where(eq(settings.key, key));
  else await db.insert(settings).values({ key, value });
}
