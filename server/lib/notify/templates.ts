/**
 * Email bodies. Every interpolation of user-supplied text (names, chore titles)
 * goes through escapeHtml; the surrounding markup is trusted.
 */
import 'server-only';
import { escapeHtml, emailLayout, emailButton, publicUrl } from './email';
import { fmtDate } from '@/lib/domain/dates';
import type { DashboardBuckets } from '@/lib/data/dashboard';
import { audienceOf, can, type Role } from '@/lib/domain/permissions';

export type InviteEmailInput = {
  /** The new person's name and sign-in email. */
  name: string;
  email: string;
  role: Role;
  inviterName: string;
  /** Their personal set-up link. */
  url: string;
  /** Where the app lives, for bookmarking. */
  siteUrl?: string | null;
  /** When the link stops working (epoch ms). */
  linkExpires?: number | null;
  /** Guests: when their access ends (epoch ms). */
  accessEnds?: number | null;
  /** A fresh link to replace one that expired or never arrived. */
  resend?: boolean;
};

const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** What this person will be able to do, from what their role allows. Plain sentences. */
export function inviteAbilities(role: Role): string[] {
  const s = { role };
  if (!can(s, 'farm.view')) {
    return [
      'See what rent is due, and tap “I paid” once you’ve paid it',
      'Find your lease, receipts and other documents in one place',
      ...(can(s, 'requests.create') ? ['Send a repair request (with a photo if it helps) and follow it until it’s fixed'] : []),
      'See notices from the farm and visits planned for your home',
      ...(can(s, 'vault.use') ? ['Look up shared codes, like the gate or the Wi-Fi'] : []),
    ];
  }
  // Running the place comes first for people who do; then the day-to-day.
  const out: string[] = [];
  if (can(s, 'people.manage')) out.push('Invite people and choose what each person can see');
  if (can(s, 'work.manage')) out.push('Set up chores and projects, and share them out');
  if (can(s, 'finance.view')) out.push('Keep track of rent, sales and spending');
  if (can(s, 'work.do')) out.push('See your jobs for the day on the Today screen, and tap Done when they’re finished');
  if (can(s, 'work.claim')) out.push('Pick up open jobs that nobody has claimed yet');
  if (can(s, 'animals.log') || can(s, 'land.log')) out.push('Log eggs, milk, animal care, planting and harvests as you go');
  if (can(s, 'supplies.use')) out.push('Note the feed and supplies you use, so we know when to restock');
  if (can(s, 'work.do')) out.push('Log the hours you work, and see your pay if you’re paid by the hour');
  if (can(s, 'vault.use')) out.push('Look up shared codes, like the gate or the Wi-Fi');
  return out.slice(0, 7);
}

/**
 * The invite (or a resent invite): a warm hello, what the app is for them,
 * one big button to set a password, what they'll be able to do, and a few
 * tips for getting it onto their phone. Worded for the farm crew, guests
 * (with their end date) or renters (the tenant portal).
 */
export function inviteEmail(i: InviteEmailInput): { subject: string; html: string } {
  const kind = audienceOf(i.role);
  const first = escapeHtml(i.name.trim().split(/\s+/)[0] || i.name);
  const inviter = escapeHtml(i.inviterName);
  const appName = kind === 'renter' ? 'tenant portal' : 'farm app';
  const what = kind === 'renter'
    ? 'the farm’s tenant portal, where you can keep track of your rent, your lease and documents, and ask for repairs'
    : 'the farm’s app, where we keep track of the day’s chores, the animals and land, equipment upkeep and projects, so everyone knows what needs doing and what’s already done';
  const subject = i.resend
    ? `Your new link to set up the ${appName}`
    : kind === 'renter' ? `${i.inviterName} set up your tenant portal` : `${i.inviterName} invited you to the farm app`;

  const intro = i.resend
    ? `<p>Here’s a fresh link to set up your account on ${what}.</p>
       <p>${inviter} sent it because the first one expired or didn’t arrive. Any earlier link no longer works, so please use this one.</p>`
    : `<p>Welcome! ${inviter} has added you to ${what}.</p>
       <p>It only takes a minute to get started: choose a password, and you’re in.</p>`;
  const expires = i.linkExpires ? ` This link works until ${escapeHtml(day(i.linkExpires))}.` : ' This link works for 7 days.';
  const guest = kind === 'guest' && i.accessEnds
    ? `<p>Your access runs until <strong>${escapeHtml(new Date(i.accessEnds).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}</strong>.</p>`
    : '';
  const site = i.siteUrl ? escapeHtml(i.siteUrl) : null;
  const abilities = inviteAbilities(i.role);
  const h = 'font-size:15px;margin:22px 0 6px';
  const muted = 'color:#6b7269;font-size:13px';

  const html = emailLayout(`
    <p>Hi ${first},</p>
    ${intro}
    ${guest}
    ${emailButton('Set your password', i.url)}
    <p style="${muted}">You’ll sign in with your email address, <strong>${escapeHtml(i.email)}</strong>.${expires}</p>

    ${abilities.length ? `<p style="${h}"><strong>What you can do</strong></p>
    <ul style="margin:0;padding-left:20px">${abilities.map((a) => `<li style="margin:4px 0">${escapeHtml(a)}</li>`).join('')}</ul>` : ''}

    <p style="${h}"><strong>Getting set up on your phone</strong></p>
    <ul style="margin:0;padding-left:20px">
      <li style="margin:4px 0"><strong>Put it on your home screen</strong> so it opens like an app.
        On an iPhone, open the link in Safari, tap the Share button, then “Add to Home Screen”.
        On Android, in Chrome, tap the ⋮ menu, then “Add to Home screen” or “Install app”.</li>
      <li style="margin:4px 0"><strong>Turn on notifications</strong> under More → Notifications, to get a nudge when ${kind === 'renter' ? 'rent is coming due or a repair is updated' : 'something is due or someone needs you'}.
        (On an iPhone, add it to your home screen first.)</li>
      <li style="margin:4px 0"><strong>Easier to read:</strong> under More → Account → Appearance you can make the text bigger, switch to a simpler layout with big buttons, or turn on high contrast.</li>
    </ul>
    ${site ? `<p>After today, you’ll find it at <a href="${site}" style="color:#2f6f4f">${site}</a>. Worth a bookmark.</p>` : ''}

    <p>If anything doesn’t work, or you have a question, just ask ${inviter}.</p>
    <p>See you there!</p>`,
  `You’re getting this because ${inviter} added you to the farm’s ${appName}. If you weren’t expecting it, you can ignore this email; nothing happens until a password is set.`);
  return { subject, html };
}

export function resetEmail(name: string, url: string): string {
  return emailLayout(`
    <p>Hi ${escapeHtml(name)},</p>
    <p>Someone asked to reset the password for your Farm Project Tracker account. Choose a new one here:</p>
    ${emailButton('Reset your password', url)}
    <p style="color:#6b7269;font-size:13px">This link expires in 7 days. If you didn't request this, you can ignore
    this email — your password won't change.</p>`);
}

/** Animal lines for the digest (births due, withdrawals, eggs) — plain strings, escaped here. */
export type DigestExtras = { animals?: string[]; land?: string[]; supplies?: string[] };

export function digestEmail(name: string, b: DashboardBuckets, extras: DigestExtras = {}): string {
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
    ${section('Coming up (7 days)', b.upcoming)}
    ${extras.supplies?.length ? `<h3 style="margin:16px 0 6px;font-size:15px">Supplies to reorder</h3><ul style="margin:0;padding-left:18px">${extras.supplies.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}
    ${extras.land?.length ? `<h3 style="margin:16px 0 6px;font-size:15px">Garden &amp; land</h3><ul style="margin:0;padding-left:18px">${extras.land.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}
    ${extras.animals?.length ? `<h3 style="margin:16px 0 6px;font-size:15px">Animals</h3><ul style="margin:0;padding-left:18px">${extras.animals.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}`);
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
