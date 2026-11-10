/**
 * Builds and sends per-user "what's due" digests (email + push). Called on an
 * hourly cron tick; each user receives their digest at their configured hour.
 */
import 'server-only';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getDashboard, type DashboardBuckets } from '@/lib/data/dashboard';
import { getPrefs } from '@/lib/data/prefs';
import { sendMail, emailConfigured } from './email';
import { digestEmail } from './templates';
import { sendPushToUser, pushConfigured } from './push';
import { capsFor } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { livestockAlerts } from '@/lib/data/livestock';
import { grazingAdvice, landAlerts } from '@/lib/data/land';
import { lowStockItems, supplyRunways } from '@/lib/data/inventory';
import { runwayLabel } from '@/lib/domain/supplies';

/** The digest's animal lines, built once per tick and shown to people who can see animals. */
export async function animalDigestLines(today = todayISO()): Promise<string[]> {
  const a = await livestockAlerts(today, 7);
  const lines: string[] = [];
  if (a.eggs) lines.push(`${a.eggs.thisWeek} eggs in the last 7 days${a.eggs.pct != null ? ` (${a.eggs.pct >= 0 ? '+' : ''}${a.eggs.pct}% on the week before)` : ''}`);
  for (const b of a.births) lines.push(`${b.dam ?? b.groupName} due around ${fmtDate(b.dueOn)}`);
  for (const h of a.hatches) lines.push(`${h.label}: ${fmtDate(h.date)}`);
  for (const w of a.withdrawals) {
    const parts = [w.milkUntil && `milk/eggs until ${fmtDate(w.milkUntil)}`, w.meatUntil && `meat until ${fmtDate(w.meatUntil)}`].filter(Boolean);
    lines.push(`${w.groupName}: withhold ${parts.join(', ')} (${w.what})`);
  }
  return lines;
}

/** Supplies about to run out at the current rate, or already under their reorder point. */
export async function supplyDigestLines(): Promise<string[]> {
  const [low, runways] = await Promise.all([lowStockItems(), supplyRunways()]);
  return low.map((i) => {
    const left = runwayLabel(runways.get(i.id) ?? null);
    return `${i.name}: ${i.qty} ${i.unit} on hand${left ? `, ${left}` : ''}`;
  });
}

/** The digest's garden & pasture lines. */
export async function landDigestLines(today = todayISO()): Promise<string[]> {
  const l = await landAlerts(today, 3);
  return [
    ...l.ready.map((p) => `${p.crop} ready ${p.ready <= today ? 'now' : `around ${fmtDate(p.ready)}`} — ${p.unitName}`),
    ...l.toSow.map((p) => `Sow ${p.crop} in ${p.unitName}${p.sownOn > today ? ` on ${fmtDate(p.sownOn)}` : ''}`),
    ...l.sprays.map((x) => `${x.unitName}: no harvest until ${fmtDate(x.until)} (${x.what})`),
    ...(await grazingAdvice(today)).filter((g) => g.over > 0).map((g) => `${g.groupName} have been on ${g.unitName} ${g.daysHere} days${g.next ? ` — ${g.next.name} is ready` : ''}`),
  ];
}

/** Runs one hourly tick: sends digests to users whose hour + prefs match. */
export async function runDigestTick(now = new Date()): Promise<{ sent: number }> {
  if (!emailConfigured() && !pushConfigured()) return { sent: 0 };
  const hour = now.getHours();
  const isMonday = now.getDay() === 1;
  // Deactivated people, and anyone whose access has ended, get nothing.
  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.active, true), or(isNull(users.accessExpiresAt), gt(users.accessExpiresAt, now.getTime()))));

  let sent = 0;
  let animals: string[] | null = null;
  let land: string[] | null = null;
  let supplies: string[] | null = null;
  for (const u of allUsers) {
    const prefs = await getPrefs(u.id);
    if (prefs.digestHour !== hour) continue;
    const wantsEmail = prefs.email === 'daily' || (prefs.email === 'weekly' && isMonday);
    if (!wantsEmail && !prefs.push) continue;

    // Built with their real permissions, switches included — the digest shows
    // exactly what their own Today screen would.
    const caps = await capsFor(u.id, u.role);
    const b = await getDashboard({ ...u, caps }, 'mine');
    const total = b.overdue.length + b.today.length + b.upcoming.length;
    const animalLines = can({ role: u.role, caps }, 'animals.view') ? (animals ??= await animalDigestLines()) : [];
    const landLines = can({ role: u.role, caps }, 'land.view') ? (land ??= await landDigestLines()) : [];
    const supplyLines = can({ role: u.role, caps }, 'supplies.manage') ? (supplies ??= await supplyDigestLines()) : [];
    if (total === 0 && !animalLines.length && !landLines.length && !supplyLines.length) continue;

    if (wantsEmail && emailConfigured() && u.email) {
      const subject = `Farm Tracker · ${b.overdue.length} overdue, ${b.today.length} due today`;
      if (await sendMail(u.email, subject, digestEmail(u.name, b, { animals: animalLines, land: landLines, supplies: supplyLines }))) sent++;
    }
    if (prefs.push && pushConfigured()) {
      const dueNow = b.overdue.length + b.today.length;
      if (dueNow > 0) {
        await sendPushToUser(u.id, {
          title: 'Farm Tracker',
          body: `${b.overdue.length} overdue · ${b.today.length} due today`,
          url: '/',
        });
      }
    }
  }
  return { sent };
}
