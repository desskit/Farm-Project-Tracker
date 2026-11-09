/** Every maintenance item with its current status (date- or meter-based), for alerts and the calendar. */
import 'server-only';
import { db } from '@/db';
import { assets, maintenanceItems, meterReadings } from '@/db/schema';
import { maintenanceStatus, type MaintStatus } from '@/lib/domain/maintenance';

export type UpkeepNow = { id: string; name: string; assetId: string; assetName: string; status: MaintStatus };

export async function upkeepWithStatus(): Promise<UpkeepNow[]> {
  const [items, assetRows, readings] = await Promise.all([
    db.select().from(maintenanceItems),
    db.select({ id: assets.id, name: assets.name, meterUnit: assets.meterUnit }).from(assets),
    db.select({ assetId: meterReadings.assetId, reading: meterReadings.reading }).from(meterReadings),
  ]);
  const latest = new Map<string, number>();
  for (const r of readings) if ((latest.get(r.assetId) ?? -Infinity) < r.reading) latest.set(r.assetId, r.reading);
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  return items.map((m) => {
    const a = assetById.get(m.assetId);
    return {
      id: m.id,
      name: m.name,
      assetId: m.assetId,
      assetName: a?.name ?? '',
      status: maintenanceStatus(m, { latestReading: latest.get(m.assetId) ?? null, meterUnit: a?.meterUnit ?? null }),
    };
  });
}
