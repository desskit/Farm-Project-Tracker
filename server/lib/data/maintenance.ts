/**
 * Assets & maintenance data-access layer — ported from js/store.js's asset /
 * meter-reading / maintenance functions. Role checks live here.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { assets, meterReadings, maintenanceItems, maintenanceLogs } from '@/db/schema';
import type { SentBack } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO, addDays, addMonths } from '@/lib/domain/dates';
import { maintenanceStatus, type MaintStatus } from '@/lib/domain/maintenance';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { DataError } from './errors';

export type AssetRow = typeof assets.$inferSelect;
export type ReadingRow = typeof meterReadings.$inferSelect;
export type MaintItemRow = typeof maintenanceItems.$inferSelect;
export type MaintLogRow = typeof maintenanceLogs.$inferSelect;

function isManager(u: SessionUser): boolean {
  return u.role === 'manager' || u.role === 'admin';
}

/* ---------------- assets ---------------- */
export async function listAssets(): Promise<AssetRow[]> {
  return db.select().from(assets).orderBy(assets.name);
}
export async function assetById(id: string): Promise<AssetRow | null> {
  const rows = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function addAsset(user: SessionUser, data: { name: string; category?: string; meterUnit?: string | null; notes?: string }): Promise<AssetRow> {
  if (!isManager(user)) throw new DataError('Only managers and admins can add assets.', 403);
  const id = uid('a');
  await db.insert(assets).values({
    id,
    name: data.name.trim(),
    category: data.category || 'Equipment',
    meterUnit: data.meterUnit || null,
    notes: data.notes || '',
  });
  return (await assetById(id))!;
}
export async function updateAsset(user: SessionUser, id: string, data: { name?: string; category?: string; notes?: string }): Promise<AssetRow> {
  if (!isManager(user)) throw new DataError('Only managers and admins can edit assets.', 403);
  const a = await assetById(id);
  if (!a) throw new DataError('No such asset.', 404);
  const patch: Partial<typeof assets.$inferInsert> = { notes: data.notes || '' };
  if (data.name != null && data.name.trim()) patch.name = data.name.trim();
  if (data.category != null) patch.category = data.category || 'Equipment';
  await db.update(assets).set(patch).where(eq(assets.id, id));
  return (await assetById(id))!;
}
export async function deleteAsset(user: SessionUser, id: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can delete assets.', 403);
  await db.delete(assets).where(eq(assets.id, id)); // items/logs/readings cascade via FK
}

/* ---------------- meter readings ---------------- */
export async function readingsFor(assetId: string): Promise<ReadingRow[]> {
  const rows = await db.select().from(meterReadings).where(eq(meterReadings.assetId, assetId));
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}
export async function latestReading(assetId: string): Promise<number | null> {
  const rows = await db.select({ reading: meterReadings.reading }).from(meterReadings).where(eq(meterReadings.assetId, assetId));
  if (!rows.length) return null;
  return rows.reduce((m, r) => (r.reading > m ? r.reading : m), rows[0].reading);
}
export async function addReading(user: SessionUser, assetId: string, reading: number, date?: string): Promise<void> {
  const a = await assetById(assetId);
  if (!a || !a.meterUnit) throw new DataError('This asset has no meter.', 400);
  if (!isFinite(reading) || reading < 0) throw new DataError('Enter a valid reading.', 400);
  const prev = await latestReading(assetId);
  if (prev != null && reading < prev) throw new DataError(`Reading is below the latest (${prev} ${a.meterUnit}).`, 400);
  await db.insert(meterReadings).values({ id: uid('mr'), assetId, reading, userId: user.id, date: date || todayISO() });
}

/* ---------------- maintenance items ---------------- */
export async function listMaintenance(): Promise<MaintItemRow[]> {
  return db.select().from(maintenanceItems);
}
export async function maintenanceForAsset(assetId: string): Promise<MaintItemRow[]> {
  return db.select().from(maintenanceItems).where(eq(maintenanceItems.assetId, assetId));
}
export async function maintenanceById(id: string): Promise<MaintItemRow | null> {
  const rows = await db.select().from(maintenanceItems).where(eq(maintenanceItems.id, id)).limit(1);
  return rows[0] ?? null;
}

export type MaintInput = {
  assetId: string;
  name: string;
  intervalType: 'calendar' | 'usage';
  intervalValue: number;
  intervalUnit?: 'months' | 'days';
  requirePhoto?: boolean;
};

export async function addMaintenance(user: SessionUser, data: MaintInput): Promise<MaintItemRow> {
  if (!isManager(user)) throw new DataError('Only managers and admins can add maintenance items.', 403);
  const today = todayISO();
  const id = uid('m');
  const unit = data.intervalUnit || 'months';
  const values: typeof maintenanceItems.$inferInsert = {
    id,
    assetId: data.assetId,
    name: data.name.trim(),
    intervalType: data.intervalType,
    intervalValue: data.intervalValue,
    intervalUnit: unit,
    lastDoneDate: today,
    requirePhoto: !!data.requirePhoto,
  };
  if (data.intervalType === 'calendar') {
    values.nextDueDate = unit === 'days' ? addDays(today, data.intervalValue) : addMonths(today, data.intervalValue);
  } else {
    const cur = await latestReading(data.assetId);
    values.lastDoneReading = cur ?? 0;
    values.dueAtReading = (cur ?? 0) + data.intervalValue;
  }
  await db.insert(maintenanceItems).values(values);
  const asset = await assetById(data.assetId);
  await logActivity(user.id, `added maintenance "${data.name.trim()}"${asset ? ` on ${asset.name}` : ''}`);
  return (await maintenanceById(id))!;
}

export async function updateMaintenance(
  user: SessionUser,
  id: string,
  data: { name?: string; intervalValue?: number; intervalUnit?: 'months' | 'days'; requirePhoto?: boolean },
): Promise<MaintItemRow> {
  if (!isManager(user)) throw new DataError('Only managers and admins can edit maintenance items.', 403);
  const item = await maintenanceById(id);
  if (!item) throw new DataError('No such item.', 404);
  const patch: Partial<typeof maintenanceItems.$inferInsert> = { requirePhoto: !!data.requirePhoto };
  if (data.name != null && data.name.trim()) patch.name = data.name.trim();
  const v = Number(data.intervalValue);
  const intervalValue = isFinite(v) && v > 0 ? v : item.intervalValue;
  patch.intervalValue = intervalValue;
  if (item.intervalType === 'calendar') {
    const unit = data.intervalUnit || item.intervalUnit || 'months';
    patch.intervalUnit = unit;
    patch.nextDueDate = unit === 'days' ? addDays(item.lastDoneDate ?? todayISO(), intervalValue) : addMonths(item.lastDoneDate ?? todayISO(), intervalValue);
  } else {
    patch.dueAtReading = (item.lastDoneReading ?? 0) + intervalValue;
  }
  await db.update(maintenanceItems).set(patch).where(eq(maintenanceItems.id, id));
  return (await maintenanceById(id))!;
}

export async function deleteMaintenance(user: SessionUser, id: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can delete maintenance items.', 403);
  await db.delete(maintenanceItems).where(eq(maintenanceItems.id, id)); // logs cascade
}

/* ---------------- service logs ---------------- */
export async function maintenanceLogsFor(itemId: string): Promise<MaintLogRow[]> {
  const rows = await db.select().from(maintenanceLogs).where(eq(maintenanceLogs.itemId, itemId));
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}
export async function itemCostTotal(itemId: string): Promise<number> {
  const rows = await db.select({ cost: maintenanceLogs.cost }).from(maintenanceLogs).where(eq(maintenanceLogs.itemId, itemId));
  return rows.reduce((s, l) => s + (l.cost || 0), 0);
}
export async function assetCostTotal(assetId: string): Promise<number> {
  const items = await maintenanceForAsset(assetId);
  if (!items.length) return 0;
  const rows = await db.select({ cost: maintenanceLogs.cost }).from(maintenanceLogs).where(inArray(maintenanceLogs.itemId, items.map((i) => i.id)));
  return rows.reduce((s, l) => s + (l.cost || 0), 0);
}

export async function logService(
  user: SessionUser,
  itemId: string,
  data: { date?: string; reading?: number | null; notes?: string; cost?: number | null; photoId?: string | null },
): Promise<void> {
  const item = await maintenanceById(itemId);
  if (!item) throw new DataError('No such item.', 404);
  if (item.requirePhoto && !data.photoId) throw new DataError('This item requires a photo of the completed work.', 400);
  const date = data.date || todayISO();
  const reading = data.reading == null ? null : Number(data.reading);
  await db.insert(maintenanceLogs).values({
    id: uid('ml'),
    itemId,
    userId: user.id,
    date,
    reading,
    notes: data.notes || '',
    cost: data.cost ? Number(data.cost) : 0,
    photoId: data.photoId || null,
  });
  const asset = await assetById(item.assetId);
  if (reading != null && asset?.meterUnit) {
    await db.insert(meterReadings).values({ id: uid('mr'), assetId: item.assetId, reading, userId: user.id, date });
  }
  const patch: Partial<typeof maintenanceItems.$inferInsert> = { lastDoneDate: date, sentBack: null };
  if (item.intervalType === 'calendar') {
    patch.nextDueDate = item.intervalUnit === 'days' ? addDays(date, item.intervalValue) : addMonths(date, item.intervalValue);
  } else {
    const lastDoneReading = reading != null ? reading : item.lastDoneReading ?? 0;
    patch.lastDoneReading = lastDoneReading;
    patch.dueAtReading = lastDoneReading + item.intervalValue;
  }
  await db.update(maintenanceItems).set(patch).where(eq(maintenanceItems.id, itemId));
  await logActivity(user.id, `logged "${item.name}"${asset ? ` on ${asset.name}` : ''}`);
}

export async function sendBackService(user: SessionUser, logId: string, reason?: string): Promise<void> {
  if (!isManager(user)) throw new DataError('Only managers and admins can send work back.', 403);
  const rows = await db.select().from(maintenanceLogs).where(eq(maintenanceLogs.id, logId)).limit(1);
  const log = rows[0];
  if (!log) throw new DataError('No such service log.', 404);
  const item = await maintenanceById(log.itemId);
  await db.delete(maintenanceLogs).where(eq(maintenanceLogs.id, logId));
  if (item) {
    const patch: Partial<typeof maintenanceItems.$inferInsert> = {};
    if (item.intervalType === 'calendar') {
      patch.nextDueDate = todayISO();
    } else {
      const cur = await latestReading(item.assetId);
      patch.dueAtReading = cur != null ? cur : item.lastDoneReading ?? 0;
    }
    patch.sentBack = { by: user.id, at: Date.now(), reason: reason || '', worker: log.userId } as SentBack;
    await db.update(maintenanceItems).set(patch).where(eq(maintenanceItems.id, item.id));
  }
}

/* ---------------- status (with reading lookups) ---------------- */
export type MaintWithStatus = MaintItemRow & { status: MaintStatus };

export async function maintenanceForAssetWithStatus(assetId: string): Promise<MaintWithStatus[]> {
  const [items, asset, latest] = await Promise.all([maintenanceForAsset(assetId), assetById(assetId), latestReading(assetId)]);
  return items.map((item) => ({
    ...item,
    status: maintenanceStatus(item, { latestReading: latest, meterUnit: asset?.meterUnit ?? null }),
  }));
}

export type AssetSummary = AssetRow & { itemCount: number; overdue: number; soon: number };

/** Asset list with a rolled-up maintenance status for the Upkeep overview. */
export async function listAssetsWithStatus(): Promise<AssetSummary[]> {
  const [assetRows, items, readings] = await Promise.all([
    listAssets(),
    listMaintenance(),
    db.select({ assetId: meterReadings.assetId, reading: meterReadings.reading }).from(meterReadings),
  ]);
  const latestByAsset = new Map<string, number>();
  for (const r of readings) {
    const cur = latestByAsset.get(r.assetId);
    if (cur == null || r.reading > cur) latestByAsset.set(r.assetId, r.reading);
  }
  const meterByAsset = new Map(assetRows.map((a) => [a.id, a.meterUnit]));

  return assetRows.map((a) => {
    const mine = items.filter((m) => m.assetId === a.id);
    let overdue = 0;
    let soon = 0;
    for (const m of mine) {
      const st = maintenanceStatus(m, { latestReading: latestByAsset.get(a.id) ?? null, meterUnit: meterByAsset.get(a.id) ?? null });
      if (st.bucket === 'overdue') overdue++;
      else if (st.bucket === 'today' || st.bucket === 'upcoming') soon++;
    }
    return { ...a, itemCount: mine.length, overdue, soon };
  });
}
