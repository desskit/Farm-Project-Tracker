/**
 * The once-per-stage reminder rule shared by rent and leases: each stage is
 * sent once; the last stage may repeat on a slower cadence. Pure.
 */
import { diffDays } from '@/lib/domain/dates';

/** Whether to send `stage` now, given what was sent last and when. */
export function shouldSendStage<S extends string>(
  stage: S,
  lastStage: S | null,
  lastSentOn: string | null,
  today: string,
  repeat?: { stage: S; everyDays: number },
): boolean {
  if (stage !== lastStage) return true;
  if (!repeat || stage !== repeat.stage) return false;
  if (!lastSentOn) return true;
  return diffDays(today, lastSentOn) >= repeat.everyDays;
}
