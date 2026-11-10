/**
 * In-process scheduler (node-cron), started once at boot. Fires the digest tick
 * at the top of every hour; runDigestTick decides who actually gets a digest
 * based on their configured hour + prefs. No-op when neither email nor push is
 * configured. Guarded so it only ever starts one schedule per process.
 */
import 'server-only';
import cron from 'node-cron';
import { runDigestTick } from './digest';
import { cleanupAuthTables } from '@/lib/auth/cleanup';
import { pruneOrphanAttachments } from '@/lib/data/attachment-access';
import { reconcileChoreDueDates } from '@/lib/data/reconcile';
import { runBackup } from '@/lib/backup';
import { runRentReminders } from './rent-reminders';
import { runUpkeepAlerts } from './upkeep-alerts';
import { runLeaseJobs } from './lease-jobs';
import { runWeatherAlerts } from './weather-alerts';
import { runRenewalReminders } from './renewals';
import { runBirthHooks } from './webhooks';
import { getWeather, refreshForecast } from '@/lib/data/weather';

const g = globalThis as unknown as { __fptCronStarted?: boolean };

export function startCron(): void {
  if (g.__fptCronStarted) return;
  g.__fptCronStarted = true;
  // Top of every hour.
  cron.schedule('0 * * * *', () => {
    runDigestTick().catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[cron] digest tick failed', e);
    });
  });
  // Just after midnight (local TZ): roll missed "skip to next" chores forward so
  // the board reads correctly when the crew wakes up.
  cron.schedule('15 0 * * *', () => {
    reconcileChoreDueDates()
      .then(({ rolled }) => {
        // eslint-disable-next-line no-console
        if (rolled) console.log(`[cron] reconciled ${rolled} chore due date(s)`);
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[cron] chore reconciliation failed', e);
      });
  });
  // Nightly auth housekeeping (03:20) — prune expired sessions/invites/throttle.
  cron.schedule('20 3 * * *', () => {
    pruneOrphanAttachments()
      .then((n) => n && console.log(`[cron] removed ${n} unattached upload(s)`))
      .catch((e) => console.error('[cron] upload cleanup failed', e));
    cleanupAuthTables().catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[cron] auth cleanup failed', e);
    });
  });
  // Nightly backup (02:40) — before auth cleanup, after chore reconciliation,
  // so it captures a settled database rather than racing either job.
  cron.schedule('40 2 * * *', () => {
    runBackup()
      .then((r) => {
        // eslint-disable-next-line no-console
        console.log(`[cron] backup complete: ${r.date}, ${(r.dbBytes / 1024).toFixed(0)} KB db, ${r.fileCount} files`);
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[cron] nightly backup failed', e);
      });
  });
  // Rent reminders, once a day at 07:00 local — early enough to act on, late
  // enough not to arrive overnight. The job records what it has already sent,
  // so a restart during the day can't re-nag anyone.
  // Papers about to run out (insurance, registrations, warranties): 07:20.
  cron.schedule('20 7 * * *', () => {
    runRenewalReminders()
      .then((r) => r.sent && console.log(`[cron] renewal reminders: ${r.sent}`))
      .catch((e) => console.error('[cron] renewal reminders failed', e));
  });
  // Births and hatches close at hand, for anything listening on a webhook: 07:30.
  cron.schedule('30 7 * * *', () => {
    runBirthHooks().catch((e) => console.error('[cron] birth webhooks failed', e));
  });
  // Late fees first, so the 07:00 reminders already include them.
  cron.schedule('50 6 * * *', () => {
    runLeaseJobs()
      .then((r) => (r.lateFees || r.reminders) && console.log(`[cron] leases: ${r.lateFees} late fee(s), ${r.reminders} reminder(s)`))
      .catch((e) => console.error('[cron] lease jobs failed', e));
  });
  cron.schedule('0 7 * * *', () => {
    runRentReminders()
      .then((r) => {
        // eslint-disable-next-line no-console
        if (r.notified || r.managersNotified) {
          console.log(`[cron] rent reminders: ${r.notified} renter(s), ${r.managersNotified} manager message(s)`);
        }
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[cron] rent reminders failed', e);
      });
  });
  // Upkeep coming due: one push to managers each morning (07:10), once per due point.
  cron.schedule('10 7 * * *', () => {
    runUpkeepAlerts()
      .then((r) => r.announced && console.log(`[cron] upkeep alerts: ${r.announced} item(s)`))
      .catch((e) => console.error('[cron] upkeep alerts failed', e));
  });
  // Keep the forecast fresh without anyone pressing refresh: every 3 hours.
  cron.schedule('25 */3 * * *', () => {
    getWeather()
      .then((w) => (w.lat != null ? refreshForecast() : null))
      .then((w) => {
        // Alerts go out in waking hours only; a 3 a.m. frost warning helps nobody.
        const h = new Date().getHours();
        return w && h >= 6 && h <= 21 ? runWeatherAlerts() : null;
      })
      .then((r) => r?.sent && console.log(`[cron] weather alerts: ${r.sent}`))
      .catch((e) => console.error('[cron] weather refresh failed', e));
  });
  // Catch up immediately at boot too, in case the server was off overnight.
  reconcileChoreDueDates().catch(() => {});
  // eslint-disable-next-line no-console
  console.log('[cron] schedules started (hourly digest, daily rent reminders, nightly reconcile + backup + cleanup)');
}
