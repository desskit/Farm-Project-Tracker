/**
 * Builds and sends per-user "what's due" digests (email + push). Called on an
 * hourly cron tick; each user receives their digest at their configured hour.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getDashboard, type DashboardBuckets } from '@/lib/data/dashboard';
import { getPrefs } from '@/lib/data/prefs';
import { sendMail, emailConfigured } from './email';
import { digestEmail } from './templates';
import { sendPushToUser, pushConfigured } from './push';

/** Runs one hourly tick: sends digests to users whose hour + prefs match. */
export async function runDigestTick(now = new Date()): Promise<{ sent: number }> {
  if (!emailConfigured() && !pushConfigured()) return { sent: 0 };
  const hour = now.getHours();
  const isMonday = now.getDay() === 1;
  // Deactivated people get no digests or push.
  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.active, true));

  let sent = 0;
  for (const u of allUsers) {
    const prefs = await getPrefs(u.id);
    if (prefs.digestHour !== hour) continue;
    const wantsEmail = prefs.email === 'daily' || (prefs.email === 'weekly' && isMonday);
    if (!wantsEmail && !prefs.push) continue;

    const b = await getDashboard(u, 'mine');
    const total = b.overdue.length + b.today.length + b.upcoming.length;
    if (total === 0) continue;

    if (wantsEmail && emailConfigured() && u.email) {
      const subject = `Farm Tracker · ${b.overdue.length} overdue, ${b.today.length} due today`;
      if (await sendMail(u.email, subject, digestEmail(u.name, b))) sent++;
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
