/**
 * The "subscribe from your phone's calendar" feed. Calendar apps can't sign
 * in, so each person gets one secret link; only its hash is stored. The feed
 * shows exactly what that person's own Calendar screen would (their
 * permissions, switches included), and stops if they're deactivated, their
 * access has ended, or they reset the link.
 */
import 'server-only';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { calendarTokens, users } from '@/db/schema';
import { capsFor, type SessionUser } from '@/lib/auth/session';
import { hashToken } from '@/lib/auth/tokens';
import { addDays, todayISO } from '@/lib/domain/dates';
import { toICal } from '@/lib/domain/ical';
import { calendarItems } from './calendar';

const KIND_LABEL: Record<string, string> = { chore: 'Chore', maintenance: 'Upkeep', task: 'Task', rent: 'Rent', animals: 'Animals', land: 'Land', papers: 'Papers' };

/** Makes (or replaces) someone's link and returns the raw token — shown once. */
export async function resetCalendarToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString('hex');
  await db.insert(calendarTokens).values({ userId, tokenHash: hashToken(token) })
    .onConflictDoUpdate({ target: calendarTokens.userId, set: { tokenHash: hashToken(token), createdAt: Date.now() } });
  return token;
}

export async function hasCalendarToken(userId: string): Promise<boolean> {
  return (await db.select({ u: calendarTokens.userId }).from(calendarTokens).where(eq(calendarTokens.userId, userId)).limit(1)).length > 0;
}

export async function removeCalendarToken(userId: string): Promise<void> {
  await db.delete(calendarTokens).where(eq(calendarTokens.userId, userId));
}

/** The person a feed token belongs to, with their real permissions; null if the link is dead. */
export async function userForCalendarToken(token: string, now = Date.now()): Promise<SessionUser | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const rows = await db.select({ u: users }).from(calendarTokens).innerJoin(users, eq(users.id, calendarTokens.userId)).where(eq(calendarTokens.tokenHash, hashToken(token))).limit(1);
  const u = rows[0]?.u;
  if (!u || !u.active || (u.accessExpiresAt != null && u.accessExpiresAt <= now)) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, caps: await capsFor(u.id, u.role) };
}

/** The .ics text for one person: a week back and three months ahead. */
export async function calendarFeedFor(viewer: SessionUser, origin: string, today = todayISO()): Promise<string> {
  const items = await calendarItems(viewer, addDays(today, -7), addDays(today, 90));
  const host = new URL(origin).host;
  return toICal(
    items.map((i) => ({ id: `${i.kind}-${i.id}`, date: i.date, title: i.title, url: `${origin}${i.href}`, category: KIND_LABEL[i.kind] ?? i.kind })),
    { name: 'Farm', host },
  );
}
