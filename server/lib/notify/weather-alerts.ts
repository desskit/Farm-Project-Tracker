/**
 * Pushes the forecast's alerts to the people each one matters to, once per
 * alert per day it's about:
 *  - frost  → people who see the land, when something is growing (named);
 *  - heat   → people who see the animals, when there are any;
 *  - rain and fire danger → whoever manages the work.
 * Runs after each forecast refresh, daytime only.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { animalGroups, landUnits, plantings } from '@/db/schema';
import { getSetting, setSetting } from '@/lib/data/settings';
import { recipientsWith } from '@/lib/data/recipients';
import { currentWeatherAlerts } from '@/lib/data/weather';
import { todayISO } from '@/lib/domain/dates';
import type { WeatherAlert } from '@/lib/domain/weather-alerts';
import { pushToPeople } from './events';

const KEY = 'weather-alerts-sent';

export async function runWeatherAlerts(today = todayISO(), alerts?: WeatherAlert[]): Promise<{ sent: number }> {
  const list = alerts ?? (await currentWeatherAlerts());
  const sent = (await getSetting<Record<string, true>>(KEY)) ?? {};
  // Forget alerts about days that have passed.
  const keep: Record<string, true> = {};
  for (const k of Object.keys(sent)) if (k.split('|')[1] >= today) keep[k] = true;

  let count = 0;
  for (const a of list) {
    const key = `${a.kind}|${a.date}`;
    if (keep[key]) continue;
    let ids: string[] = [];
    let body = a.detail;
    let url = '/more/weather';
    if (a.kind === 'frost') {
      const growing = await db.select({ crop: plantings.crop, unit: landUnits.name }).from(plantings).innerJoin(landUnits, eq(landUnits.id, plantings.unitId)).where(eq(plantings.status, 'growing'));
      if (growing.length) {
        ids = (await recipientsWith('land.view')).map((r) => r.id);
        const names = [...new Set(growing.map((g) => `${g.crop} (${g.unit})`))];
        body = `${a.detail} Cover what's tender: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` +${names.length - 4} more` : ''}.`;
        url = '/farm/land';
      }
    } else if (a.kind === 'heat') {
      const groups = await db.select({ id: animalGroups.id }).from(animalGroups).where(eq(animalGroups.active, true)).limit(1);
      if (groups.length) {
        ids = (await recipientsWith('animals.view')).map((r) => r.id);
        body = `${a.detail} Check water and shade for the animals.`;
        url = '/farm/animals';
      }
    } else {
      ids = (await recipientsWith('work.manage')).map((r) => r.id);
    }
    keep[key] = true; // decided either way: don't re-evaluate this alert every three hours
    if (!ids.length) continue;
    await pushToPeople(ids, { title: a.title, body, url });
    count++;
  }
  await setSetting(KEY, keep);
  return { sent: count };
}
