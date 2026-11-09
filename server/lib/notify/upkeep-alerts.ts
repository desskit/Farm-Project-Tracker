/**
 * Daily push when upkeep comes due. Each item's due point (a date, or a meter
 * reading) is announced once: the job remembers what it already sent, so a
 * restart or a second run the same day can't repeat it, and the next due
 * point (after a service) is announced fresh.
 */
import 'server-only';
import { getSetting, setSetting } from '@/lib/data/settings';
import { recipientsWith } from '@/lib/data/recipients';
import { upkeepWithStatus } from '@/lib/data/upkeep-status';
import { pushUpkeepDue } from './events';

const KEY = 'upkeep-alerts-sent';

export async function runUpkeepAlerts(): Promise<{ announced: number }> {
  const items = await upkeepWithStatus();
  const sent = (await getSetting<Record<string, string>>(KEY)) ?? {};
  const next: Record<string, string> = {};
  const fresh: typeof items = [];
  for (const it of items) {
    if (it.status.bucket !== 'overdue' && it.status.bucket !== 'today') continue;
    const point = it.status.mode === 'date' ? it.status.dueDate : String(it.status.due);
    next[it.id] = point;
    if (sent[it.id] !== point) fresh.push(it);
  }
  // Items no longer due drop out, so their next due point is announced later.
  await setSetting(KEY, next);
  if (fresh.length) {
    const ids = (await recipientsWith('work.manage')).map((r) => r.id);
    await pushUpkeepDue(ids, fresh.map((f) => `${f.name}${f.assetName ? ` (${f.assetName})` : ''}`));
  }
  return { announced: fresh.length };
}
