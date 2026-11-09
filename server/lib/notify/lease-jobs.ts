/**
 * Daily lease housekeeping: add late fees that have come due, and tell the
 * people who manage rentals when a lease is nearing (or past) its end — once
 * per stage, so it never nags.
 */
import 'server-only';
import { applyLateFees, leaseReminderText, leaseRemindersDue } from '@/lib/data/rentals';
import { recipientsWith } from '@/lib/data/recipients';
import { todayISO } from '@/lib/domain/dates';
import { emailConfigured, emailLayout, escapeHtml, sendMail } from './email';
import { pushConfigured, sendPushToUser } from './push';

export async function runLeaseJobs(today = todayISO()): Promise<{ lateFees: number; reminders: number }> {
  const lateFees = await applyLateFees(today);
  const due = await leaseRemindersDue(today);
  if (due.length) {
    const lines = due.map(leaseReminderText);
    const managers = await recipientsWith('rentals.manage');
    for (const m of managers) {
      if (pushConfigured()) {
        await sendPushToUser(m.id, { title: due.length === 1 ? 'Lease ending' : `${due.length} leases need attention`, body: lines[0], url: due.length === 1 ? `/more/rentals/${due[0].unitId}` : '/more/rentals' }).catch(() => undefined);
      }
      if (emailConfigured() && m.email) {
        await sendMail(m.email, 'Farm Tracker · leases', emailLayout(`<p>Lease dates coming up:</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`)).catch(() => false);
      }
    }
  }
  return { lateFees, reminders: due.length };
}
