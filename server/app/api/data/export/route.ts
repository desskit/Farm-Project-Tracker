import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { db, schema } from '@/db';
import { errorResponse } from '@/lib/api/errors';
import { todayISO } from '@/lib/domain/dates';

/**
 * Full JSON backup of the farm data (admin only). Excludes auth secrets:
 * password hashes and session/invite tokens are never exported.
 */
export async function GET() {
  try {
    await requireAdmin();

    const users = (await db.select().from(schema.users)).map(({ passwordHash, ...u }) => u);
    const [
      chores,
      choreCompletions,
      assets,
      meterReadings,
      maintenanceItems,
      maintenanceLogs,
      projects,
      projectTasks,
      inventory,
      inventoryLog,
      notes,
      rentAssignments,
      rentCharges,
      notificationPrefs,
      activity,
      settings,
    ] = await Promise.all([
      db.select().from(schema.chores),
      db.select().from(schema.choreCompletions),
      db.select().from(schema.assets),
      db.select().from(schema.meterReadings),
      db.select().from(schema.maintenanceItems),
      db.select().from(schema.maintenanceLogs),
      db.select().from(schema.projects),
      db.select().from(schema.projectTasks),
      db.select().from(schema.inventory),
      db.select().from(schema.inventoryLog),
      db.select().from(schema.notes),
      db.select().from(schema.rentAssignments),
      db.select().from(schema.rentCharges),
      db.select().from(schema.notificationPrefs),
      db.select().from(schema.activity),
      db.select().from(schema.settings),
    ]);

    const backup = {
      exportedAt: new Date().toISOString(),
      version: 1,
      users,
      chores,
      choreCompletions,
      assets,
      meterReadings,
      maintenanceItems,
      maintenanceLogs,
      projects,
      projectTasks,
      inventory,
      inventoryLog,
      notes,
      rentAssignments,
      rentCharges,
      notificationPrefs,
      activity,
      settings,
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="farm-backup-${todayISO()}.json"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
