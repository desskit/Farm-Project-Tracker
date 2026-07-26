/**
 * Rent reminders — the one recurring obligation in the app that nothing was
 * nudging anyone about. A charge just sat there until somebody thought to
 * open the rent page.
 *
 * Runs once a day. Each unpaid charge moves through at most three reminders:
 *
 *   upcoming  LEAD_DAYS before the due date ("rent is due Friday")
 *   due       on the due date
 *   overdue   after it, repeating weekly rather than daily
 *
 * `reminderStage` / `reminderSentOn` on the charge record what's already gone
 * out, so a restart, a second app instance, or a manual run can't re-nag. A
 * charge the renter has marked paid stops reminding them — chasing someone
 * who has already paid is worse than not reminding at all — and managers get
 * a single summary of what's overdue rather than one message per renter.
 */
import 'server-only';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { rentCharges, users } from '@/db/schema';
import { ensureRentCharges } from '@/lib/data/rent';
import { getPrefs } from '@/lib/data/prefs';
import { todayISO, diffDays, fmtDate, monthLabel } from '@/lib/domain/dates';
import { sendMail, emailConfigured } from './email';
import { rentReminderEmail, rentOverdueDigestEmail } from './templates';
import { sendPushToUser, pushConfigured } from './push';

/** How many days ahead the first heads-up goes out. */
const LEAD_DAYS = 3;
/** Once overdue, how often to repeat. */
const OVERDUE_REPEAT_DAYS = 7;

export type ReminderStage = 'upcoming' | 'due' | 'overdue';
export type RentReminderResult = { notified: number; managersNotified: number };

/**
 * How reminders actually go out. Injectable so the scheduling rules can be
 * exercised without a live SMTP server or push service standing behind them.
 */
export type ReminderChannels = {
  emailReady: () => boolean;
  pushReady: () => boolean;
  sendEmail: (to: string, subject: string, html: string) => Promise<boolean>;
  sendPush: (userId: string, payload: { title: string; body: string; url?: string }) => Promise<void>;
};

const liveChannels: ReminderChannels = {
  emailReady: emailConfigured,
  pushReady: pushConfigured,
  sendEmail: sendMail,
  sendPush: sendPushToUser,
};

/** Which reminder (if any) today's date calls for on a charge due `dueDate`. */
export function stageFor(dueDate: string, today: string): ReminderStage | null {
  const daysUntil = diffDays(dueDate, today);
  if (daysUntil < 0) return 'overdue';
  if (daysUntil === 0) return 'due';
  if (daysUntil <= LEAD_DAYS) return 'upcoming';
  return null;
}

/**
 * Whether a reminder should actually be sent, given what already has been.
 * Each stage fires once; overdue repeats on a weekly cadence so a long-unpaid
 * charge keeps surfacing without becoming daily noise.
 */
export function shouldSend(
  stage: ReminderStage,
  lastStage: ReminderStage | null,
  lastSentOn: string | null,
  today: string,
): boolean {
  if (stage !== lastStage) return true;
  if (stage !== 'overdue') return false;
  if (!lastSentOn) return true;
  return diffDays(today, lastSentOn) >= OVERDUE_REPEAT_DAYS;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function bodyFor(stage: ReminderStage, amount: number, dueDate: string, today: string): string {
  const amt = money(amount);
  if (stage === 'due') return `${amt} is due today.`;
  if (stage === 'upcoming') return `${amt} is due ${fmtDate(dueDate)}.`;
  const late = Math.abs(diffDays(dueDate, today));
  return `${amt} was due ${fmtDate(dueDate)} — ${late} day${late === 1 ? '' : 's'} ago.`;
}

function subjectFor(stage: ReminderStage, month: string): string {
  if (stage === 'due') return `Rent due today · ${monthLabel(month)}`;
  if (stage === 'upcoming') return `Rent due soon · ${monthLabel(month)}`;
  return `Rent overdue · ${monthLabel(month)}`;
}

/**
 * One daily pass. Safe to call more than once a day: anything already sent
 * for the current stage is skipped.
 */
export async function runRentReminders(
  today = todayISO(),
  ch: ReminderChannels = liveChannels,
): Promise<RentReminderResult> {
  const result: RentReminderResult = { notified: 0, managersNotified: 0 };
  if (!ch.emailReady() && !ch.pushReady()) return result;

  // Make sure this month's charges exist before deciding what to remind about.
  await ensureRentCharges();

  const charges = await db.select().from(rentCharges).where(ne(rentCharges.status, 'verified'));
  if (!charges.length) return result;

  const people = await db.select({ id: users.id, name: users.name, email: users.email, active: users.active }).from(users);
  const byId = new Map(people.map((p) => [p.id, p]));
  const overdueForManagers: { name: string; amount: number; dueDate: string }[] = [];

  for (const c of charges) {
    const stage = stageFor(c.dueDate, today);
    if (!stage) continue;

    const person = byId.get(c.userId);
    // A charge whose renter has left the farm is the manager's problem, not
    // something to keep mailing into the void.
    const renterReachable = !!person && person.active;

    if (stage === 'overdue' && person) {
      overdueForManagers.push({ name: person.name, amount: c.amount, dueDate: c.dueDate });
    }

    // Someone who has already marked it paid shouldn't be chased; the charge
    // is now waiting on a manager to verify, which the summary below covers.
    if (c.status !== 'unpaid' || !renterReachable) continue;
    if (!shouldSend(stage, c.reminderStage, c.reminderSentOn, today)) continue;

    const prefs = await getPrefs(c.userId);
    const body = bodyFor(stage, c.amount, c.dueDate, today);
    let delivered = false;

    if (prefs.eventPush && ch.pushReady()) {
      await ch.sendPush(c.userId, {
        title: stage === 'overdue' ? 'Rent overdue' : 'Rent reminder',
        body,
        url: '/more/rent',
      });
      delivered = true;
    }
    if (prefs.email !== 'off' && ch.emailReady() && person.email) {
      const html = rentReminderEmail(person.name, body, stage === 'overdue');
      if (await ch.sendEmail(person.email, subjectFor(stage, c.month), html)) delivered = true;
    }

    // Only record the reminder if something actually went out, so a channel
    // being down doesn't silently burn the stage.
    if (delivered) {
      await db
        .update(rentCharges)
        .set({ reminderStage: stage, reminderSentOn: today })
        .where(eq(rentCharges.id, c.id));
      result.notified++;
    }
  }

  result.managersNotified = await notifyManagers(overdueForManagers, today, ch);
  return result;
}

/**
 * Tells managers what's outstanding — one message listing everything overdue,
 * not one per charge. Sent on the same weekly cadence as the overdue nudge so
 * the two stay in step.
 */
async function notifyManagers(
  overdue: { name: string; amount: number; dueDate: string }[],
  today: string,
  ch: ReminderChannels,
): Promise<number> {
  if (!overdue.length) return 0;
  // Weekly: anchored to the day of the week so it lands predictably.
  const isDigestDay = new Date(`${today}T00:00:00`).getDay() === 1; // Monday
  if (!isDigestDay) return 0;

  const managers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.active, true));
  const total = overdue.reduce((sum, o) => sum + o.amount, 0);
  let sent = 0;

  for (const m of managers) {
    if (m.role !== 'manager' && m.role !== 'admin') continue;
    const prefs = await getPrefs(m.id);
    if (prefs.eventPush && ch.pushReady()) {
      await ch.sendPush(m.id, {
        title: 'Rent outstanding',
        body: `${overdue.length} charge${overdue.length === 1 ? '' : 's'} overdue · ${money(total)}`,
        url: '/more/rent',
      });
      sent++;
    }
    if (prefs.email !== 'off' && ch.emailReady() && m.email) {
      const rows = overdue.map((o) => ({ ...o, amountLabel: money(o.amount) }));
      if (await ch.sendEmail(m.email, `Rent outstanding · ${money(total)}`, rentOverdueDigestEmail(m.name, rows))) sent++;
    }
  }
  return sent;
}
