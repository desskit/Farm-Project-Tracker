/**
 * Builds and sends per-user "what's due" digests (email + push). Called on an
 * hourly cron tick; each user receives their digest at their configured hour.
 */
import 'server-only';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getDashboard, type DashboardBuckets } from '@/lib/data/dashboard';
import { getPrefs } from '@/lib/data/prefs';
import { sendMail, emailConfigured } from './email';
import { sendPushToUser, pushConfigured } from './push';
import { fmtDate } from '@/lib/domain/dates';

function digestHtml(name: string, b: DashboardBuckets): string {
  const section = (title: string, items: DashboardBuckets['overdue']) =>
    items.length
      ? `<h3 style="margin:16px 0 6px">${title}</h3><ul style="margin:0;padding-left:18px">${items
          .map((i) => `<li>${i.title} <span style="color:#6b7269">— ${i.subtitle} (due ${fmtDate(i.dueDate)})</span></li>`)
          .join('')}</ul>`
      : '';
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c221e">
      <p>Morning, ${name}. Here's what's on your plate:</p>
      ${section('⚠️ Overdue', b.overdue)}
      ${section('Due today', b.today)}
      ${section('Coming up (7 days)', b.upcoming)}
      <p style="color:#6b7269;font-size:13px;margin-top:20px">— Farm Project Tracker</p>
    </div>`;
}

/** Runs one hourly tick: sends digests to users whose hour + prefs match. */
export async function runDigestTick(now = new Date()): Promise<{ sent: number }> {
  if (!emailConfigured() && !pushConfigured()) return { sent: 0 };
  const hour = now.getHours();
  const isMonday = now.getDay() === 1;
  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users);

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
      if (await sendMail(u.email, subject, digestHtml(u.name, b))) sent++;
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
