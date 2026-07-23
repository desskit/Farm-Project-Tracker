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
  // Nightly auth housekeeping (03:20) — prune expired sessions/invites/throttle.
  cron.schedule('20 3 * * *', () => {
    cleanupAuthTables().catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[cron] auth cleanup failed', e);
    });
  });
  // eslint-disable-next-line no-console
  console.log('[cron] schedules started (hourly digest, nightly cleanup)');
}
