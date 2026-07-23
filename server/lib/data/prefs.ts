/** Per-user notification preferences. */
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { notificationPrefs } from '@/db/schema';

export type Prefs = { email: 'off' | 'daily' | 'weekly'; push: boolean; digestHour: number };
const DEFAULT: Prefs = { email: 'daily', push: true, digestHour: 6 };

export async function getPrefs(userId: string): Promise<Prefs> {
  const rows = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).limit(1);
  const r = rows[0];
  return r ? { email: r.email, push: r.push, digestHour: r.digestHour } : { ...DEFAULT };
}

export async function setPrefs(userId: string, data: Partial<Prefs>): Promise<void> {
  const current = await getPrefs(userId);
  const next: Prefs = {
    email: data.email ?? current.email,
    push: data.push ?? current.push,
    digestHour: data.digestHour ?? current.digestHour,
  };
  const exists = await db.select({ userId: notificationPrefs.userId }).from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).limit(1);
  if (exists.length) await db.update(notificationPrefs).set(next).where(eq(notificationPrefs.userId, userId));
  else await db.insert(notificationPrefs).values({ userId, ...next });
}
