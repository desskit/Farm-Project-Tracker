/**
 * Email bodies. Every interpolation of user-supplied text (names, chore titles)
 * goes through escapeHtml; the surrounding markup is trusted.
 */
import 'server-only';
import { escapeHtml, emailLayout, emailButton, publicUrl } from './email';
import { fmtDate } from '@/lib/domain/dates';
import type { DashboardBuckets } from '@/lib/data/dashboard';

export function inviteEmail(name: string, inviterName: string, url: string): string {
  return emailLayout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>${escapeHtml(inviterName)} has added you to the farm's Project Tracker — the app the crew uses for chores,
    equipment upkeep, and projects. Set your password to get started:</p>
    ${emailButton('Set your password', url)}
    <p style="color:#6b7269;font-size:13px">This link expires in 7 days. If it stops working, ask an admin to resend it.</p>`);
}

export function resetEmail(name: string, url: string): string {
  return emailLayout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>Someone asked to reset the password for your Farm Project Tracker account. Choose a new one here:</p>
    ${emailButton('Reset your password', url)}
    <p style="color:#6b7269;font-size:13px">This link expires in 7 days. If you didn't request this, you can ignore
    this email — your password won't change.</p>`);
}

export function digestEmail(name: string, b: DashboardBuckets): string {
  const section = (title: string, items: DashboardBuckets['overdue']) =>
    items.length
      ? `<h3 style="margin:16px 0 6px;font-size:15px">${title}</h3><ul style="margin:0;padding-left:18px">${items
          .map(
            (i) =>
              `<li>${escapeHtml(i.title)} <span style="color:#6b7269">— ${escapeHtml(i.subtitle)} (due ${escapeHtml(fmtDate(i.dueDate))})</span></li>`,
          )
          .join('')}</ul>`
      : '';
  return emailLayout(`
    <p>Morning, ${escapeHtml(name)}. Here's what's on your plate:</p>
    ${section('⚠️ Overdue', b.overdue)}
    ${section('Due today', b.today)}
    ${section('Coming up (7 days)', b.upcoming)}`);
}

export function testEmail(name: string): string {
  return emailLayout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>This is a test message from your Farm Project Tracker. If you're reading it, SMTP is configured correctly and
    invites, password resets, and digests will all send.</p>`);
}

/** The "Open rent" button, omitted entirely when PUBLIC_URL isn't configured. */
function rentLink(): string {
  const base = publicUrl();
  return base ? emailButton('Open rent', `${base}/more/rent`) : '';
}

/**
 * A single renter's rent reminder. `body` is composed by the reminder job so
 * the phrasing stays identical between the push and the email.
 */
export function rentReminderEmail(name: string, body: string, overdue: boolean): string {
  return emailLayout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p style="font-size:17px;font-weight:600${overdue ? ';color:#c0392b' : ''}">${escapeHtml(body)}</p>
    <p>You can mark it paid in the tracker once you've sent it — a manager confirms it from there.</p>
    ${rentLink()}
    <p style="color:#6b7269;font-size:13px">Reminders stop as soon as the charge is marked paid. You can turn them
    off under More → Notifications.</p>`);
}

/** Manager-facing summary of everything still outstanding. */
export function rentOverdueDigestEmail(
  name: string,
  rows: { name: string; amountLabel: string; dueDate: string }[],
): string {
  const list = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 0">${escapeHtml(r.name)}</td>
         <td style="padding:6px 0;color:#6b7269">due ${escapeHtml(fmtDate(r.dueDate))}</td>
         <td style="padding:6px 0;text-align:right;font-weight:700">${escapeHtml(r.amountLabel)}</td></tr>`,
    )
    .join('');
  return emailLayout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>${rows.length} rent charge${rows.length === 1 ? ' is' : 's are'} still outstanding:</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">${list}</table>
    ${rentLink()}`);
}
