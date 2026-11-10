/**
 * Daily check for papers about to run out: insurance, registrations,
 * warranties filed on equipment, and tenants' paperwork (renter's insurance,
 * a lease copy with an end date). Each is announced once a month out, once a
 * week out and once after it lapses.
 *  - equipment papers → whoever manages the work;
 *  - rental papers → whoever manages rentals, and the renter.
 */
import 'server-only';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { assetDocs, assets, rentDocs, users } from '@/db/schema';
import { recipientsWith } from '@/lib/data/recipients';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { renewalStage } from '@/lib/domain/rentals';
import { pushToPeople } from './events';
import { shouldSendStage } from './staged-reminders';

const say = (stage: 'month' | 'week' | 'expired', date: string) =>
  stage === 'expired' ? `expired ${fmtDate(date)}` : `expires ${fmtDate(date)}`;

export async function runRenewalReminders(today = todayISO(), push = pushToPeople): Promise<{ sent: number }> {
  let sent = 0;
  const [aDocs, rDocs] = await Promise.all([
    db.select({ d: assetDocs, asset: assets.name }).from(assetDocs).innerJoin(assets, eq(assets.id, assetDocs.assetId)).where(isNotNull(assetDocs.expiresOn)),
    db.select({ d: rentDocs, renter: users.name }).from(rentDocs).innerJoin(users, eq(users.id, rentDocs.userId)).where(isNotNull(rentDocs.expiresOn)),
  ]);

  const farm = aDocs.length ? (await recipientsWith('work.manage')).map((r) => r.id) : [];
  for (const { d, asset } of aDocs) {
    const stage = renewalStage(d.expiresOn, today);
    if (!stage || !shouldSendStage(stage, d.reminderStage, null, today)) continue;
    await push(farm, { title: stage === 'expired' ? 'Paper expired' : 'Renewal coming up', body: `${asset}: ${d.name} ${say(stage, d.expiresOn!)}.`, url: `/maintenance/${d.assetId}` });
    await db.update(assetDocs).set({ reminderStage: stage }).where(eq(assetDocs.id, d.id));
    sent++;
  }

  const rentals = rDocs.length ? (await recipientsWith('rentals.manage')).map((r) => r.id) : [];
  for (const { d, renter } of rDocs) {
    const stage = renewalStage(d.expiresOn, today);
    if (!stage || !shouldSendStage(stage, d.reminderStage, null, today)) continue;
    await push(rentals, { title: stage === 'expired' ? 'Tenant paper expired' : 'Tenant paper expiring', body: `${renter}: ${d.name} ${say(stage, d.expiresOn!)}.`, url: '/more/rent' });
    await push([d.userId], { title: stage === 'expired' ? 'A document has expired' : 'A document expires soon', body: `${d.name} ${say(stage, d.expiresOn!)}. Please send an updated copy.`, url: '/more/rent' });
    await db.update(rentDocs).set({ reminderStage: stage }).where(eq(rentDocs.id, d.id));
    sent++;
  }
  return { sent };
}
