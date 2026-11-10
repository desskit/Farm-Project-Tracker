/**
 * The "what's new" note each person sees once, and the admin's first-run
 * checklist, whose ticks come from the data rather than from being clicked.
 */
import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { animalGroups, chores, landUnits, users } from '@/db/schema';
import { can } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { WHATS_NEW, newsFor, type NewsEntry } from '@/lib/whats-new';
import { DataError } from './errors';
import { getSetting, setSetting } from './settings';

export async function newsForUser(user: SessionUser): Promise<NewsEntry | null> {
  const [row] = await db.select({ seen: users.newsSeen }).from(users).where(eq(users.id, user.id)).limit(1);
  return newsFor(row?.seen ?? '', (cap) => can(user, cap));
}

export async function markNewsSeen(user: SessionUser): Promise<void> {
  const latest = [...WHATS_NEW].sort((a, b) => b.id.localeCompare(a.id))[0];
  if (latest) await db.update(users).set({ newsSeen: latest.id }).where(eq(users.id, user.id));
}

export type SetupStep = { key: string; label: string; hint: string; href: string; done: boolean };
const DISMISSED_KEY = 'setup-dismissed';

async function count(table: typeof users | typeof chores | typeof animalGroups | typeof landUnits): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(table);
  return Number(r?.n ?? 0);
}

/** Null once everything is done or an admin has put the list away. */
export async function setupChecklist(user: SessionUser): Promise<SetupStep[] | null> {
  if (!can(user, 'system.admin')) return null;
  if (await getSetting<boolean>(DISMISSED_KEY)) return null;
  const [people, choreCount, groups, units, weather, frost, keySeen] = await Promise.all([
    count(users), count(chores), count(animalGroups), count(landUnits),
    getSetting<{ lat: number | null }>('weather'), getSetting<unknown>('frost-dates'), getSetting<boolean>('vault-key-viewed'),
  ]);
  const steps: SetupStep[] = [
    { key: 'location', label: 'Set the farm’s location', hint: 'For the forecast and frost, heat and fire alerts', href: '/more/weather', done: weather?.lat != null },
    { key: 'people', label: 'Invite your people', hint: 'Family, crew and tenants each see only what they should', href: '/people', done: people > 1 },
    { key: 'chores', label: 'Add the first chores', hint: 'Daily and weekly jobs, with who does them', href: '/chores', done: choreCount > 0 },
    { key: 'animals', label: 'Add your animals', hint: 'Flocks and herds, even a group of one', href: '/farm/animals', done: groups > 0 },
    { key: 'land', label: 'Lay out the land', hint: 'Garden and beds, pasture and paddocks', href: '/farm/land', done: units > 0 },
    { key: 'frost', label: 'Set your frost dates', hint: 'Builds the planting calendar', href: '/farm/land/calendar', done: !!frost },
    { key: 'key', label: 'Save the vault recovery key', hint: 'Without it, saved passwords can’t be restored from a backup', href: '/vault/groups', done: !!keySeen },
  ];
  return steps.every((s) => s.done) ? null : steps;
}

export async function dismissSetup(user: SessionUser): Promise<void> {
  if (!can(user, 'system.admin')) throw new DataError('Only an admin can do that.', 403);
  await setSetting(DISMISSED_KEY, true);
}
