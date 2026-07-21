/**
 * Seeds a fresh database with the demo farm data (ported from js/store.js
 * `seed()`), plus a real admin account from env (SEED_ADMIN_*). Idempotent:
 * skips if any users already exist. Run after `npm run db:migrate`.
 */
import 'dotenv/config';
import { db } from './index';
import * as s from './schema';
import { uid } from '../lib/ids';
import { hashPassword } from '../lib/auth/password';
import { addDays, todayISO, shiftMonthKey } from '../lib/domain/dates';

async function main() {
  const existing = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (existing.length) {
    // eslint-disable-next-line no-console
    console.log('Users already exist — skipping seed.');
    return;
  }

  const T = todayISO();
  const mk = T.slice(0, 7);
  const lastMk = shiftMonthKey(mk, -1);

  const adminName = process.env.SEED_ADMIN_NAME || 'Dale';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'changeme';

  // Users: admin has a password; the rest are "invited" (no password yet).
  const uDale = 'u_dale', uMorgan = 'u_morgan', uSam = 'u_sam', uJamie = 'u_jamie';
  await db.insert(s.users).values([
    { id: uDale, name: adminName, email: adminEmail, role: 'admin', passwordHash: await hashPassword(adminPassword) },
    { id: uMorgan, name: 'Morgan', email: 'morgan@example.com', role: 'manager' },
    { id: uSam, name: 'Sam', email: 'sam@example.com', role: 'worker' },
    { id: uJamie, name: 'Jamie', email: 'jamie@example.com', role: 'worker' },
  ]);
  await db.insert(s.notificationPrefs).values(
    [uDale, uMorgan, uSam, uJamie].map((id) => ({ userId: id })),
  );

  await db.insert(s.chores).values([
    { id: 'c_feed', name: 'Feed the chickens', schedule: { type: 'daily' }, catchUp: 'mustCatchUp', assignedTo: uSam, nextDue: addDays(T, -1) },
    { id: 'c_muck', name: 'Muck out the stalls', schedule: { type: 'daily' }, catchUp: 'skipToNext', assignedTo: uJamie, nextDue: T, requirePhoto: true },
    { id: 'c_troughs', name: 'Check water troughs', schedule: { type: 'daily' }, catchUp: 'mustCatchUp', nextDue: T, open: true },
    { id: 'c_water', name: 'Water the greenhouse', schedule: { type: 'everyNDays', n: 2 }, catchUp: 'skipToNext', assignedTo: uSam, nextDue: addDays(T, 1) },
    { id: 'c_cattle', name: 'Move cattle to fresh paddock', schedule: { type: 'weekly', weekdays: [1, 4] }, catchUp: 'skipToNext', assignedTo: uMorgan, nextDue: addDays(T, 2) },
    { id: 'c_mow', name: 'Mow the orchard', schedule: { type: 'weekly', weekdays: [6], season: { start: '05-01', end: '09-30' } }, catchUp: 'skipToNext', assignedTo: uJamie, nextDue: addDays(T, 4) },
    { id: 'c_lockup', name: 'Evening barn lockup', schedule: { type: 'daily' }, catchUp: 'mustCatchUp', nextDue: T, open: true, steps: ['Lock the coop run', 'Shut off the yard water', 'Lights out in the barn', 'Latch the main gate'] },
  ]);

  await db.insert(s.choreCompletions).values([
    { id: uid('cc'), choreId: 'c_feed', completedBy: uSam, date: addDays(T, -1) },
    { id: uid('cc'), choreId: 'c_feed', completedBy: uSam, date: addDays(T, -2) },
    { id: uid('cc'), choreId: 'c_feed', completedBy: uSam, date: addDays(T, -3) },
    { id: uid('cc'), choreId: 'c_water', completedBy: uSam, date: addDays(T, -2), notes: 'Greenhouse watered' },
    { id: uid('cc'), choreId: 'c_muck', completedBy: uJamie, date: addDays(T, -1) },
    { id: uid('cc'), choreId: 'c_muck', completedBy: uJamie, date: addDays(T, -2) },
    { id: uid('cc'), choreId: 'c_troughs', completedBy: uJamie, date: addDays(T, -2) },
    { id: uid('cc'), choreId: 'c_cattle', completedBy: uMorgan, date: addDays(T, -3) },
  ]);

  await db.insert(s.assets).values([
    { id: 'a_tractor', name: 'Kubota L2501 tractor', category: 'Equipment', meterUnit: 'hours' },
    { id: 'a_truck', name: 'Ford F-250', category: 'Vehicle', meterUnit: 'miles' },
    { id: 'a_well', name: 'Well pump', category: 'Infrastructure' },
    { id: 'a_coop', name: 'Chicken coop', category: 'Structure' },
  ]);
  await db.insert(s.meterReadings).values([
    { id: uid('mr'), assetId: 'a_tractor', reading: 512, userId: uMorgan, date: addDays(T, -3) },
    { id: uid('mr'), assetId: 'a_truck', reading: 84230, userId: uSam, date: addDays(T, -2) },
  ]);
  await db.insert(s.maintenanceItems).values([
    { id: 'm_oil', assetId: 'a_tractor', name: 'Engine oil & filter', intervalType: 'usage', intervalValue: 50, lastDoneDate: addDays(T, -30), lastDoneReading: 470, dueAtReading: 520, requirePhoto: true },
    { id: 'm_grease', assetId: 'a_tractor', name: 'Grease all fittings', intervalType: 'calendar', intervalValue: 1, intervalUnit: 'months', lastDoneDate: addDays(T, -40), nextDueDate: addDays(T, -10) },
    { id: 'm_truckoil', assetId: 'a_truck', name: 'Oil change', intervalType: 'usage', intervalValue: 3000, lastDoneDate: addDays(T, -60), lastDoneReading: 81500, dueAtReading: 84500 },
    { id: 'm_well', assetId: 'a_well', name: 'Pressure & seal inspection', intervalType: 'calendar', intervalValue: 6, intervalUnit: 'months', lastDoneDate: addDays(T, -170), nextDueDate: addDays(T, 10) },
  ]);
  await db.insert(s.maintenanceLogs).values([
    { id: uid('ml'), itemId: 'm_truckoil', userId: uSam, date: addDays(T, -5), reading: 82000, notes: 'Oil + filter', cost: 62 },
    { id: uid('ml'), itemId: 'm_grease', userId: uJamie, date: addDays(T, -8), notes: 'Greased all zerks', cost: 0 },
  ]);

  await db.insert(s.projects).values([
    { id: 'p_shed', name: 'Build run-in shed for horses', description: 'A 12x24 three-sided run-in shed on the south pasture for weather shelter.', status: 'in_progress', targetDate: addDays(T, 45), createdBy: uMorgan },
    { id: 'p_fence', name: 'Fence the north pasture', description: 'Run new woven-wire fence around the north 6 acres, with a gate by the lane.', status: 'planned', targetDate: addDays(T, 90), createdBy: uMorgan },
    { id: 'p_irrig', name: 'Overhaul greenhouse irrigation', description: 'Replace hand-watering with a timed drip system.', status: 'idea', createdBy: uMorgan },
  ]);
  await db.insert(s.projectTasks).values([
    { id: uid('t'), projectId: 'p_shed', title: 'Pour concrete footings', assignedTo: uJamie, dueDate: addDays(T, -5), done: true, doneBy: uJamie, doneAt: addDays(T, -4), sort: 0 },
    { id: uid('t'), projectId: 'p_shed', title: 'Frame the three walls', description: 'Pressure-treated posts, 2x6 girts.', assignedTo: uSam, dueDate: addDays(T, 3), sort: 1 },
    { id: uid('t'), projectId: 'p_shed', title: 'Install the roof', assignedTo: uJamie, dueDate: addDays(T, 12), sort: 2, requirePhoto: true },
    { id: uid('t'), projectId: 'p_shed', title: 'Hang the gate & trim', description: 'Anyone can grab this one.', dueDate: addDays(T, 14), sort: 3, open: true },
    { id: uid('t'), projectId: 'p_fence', title: 'Walk the line & mark corners', assignedTo: uMorgan, dueDate: addDays(T, 5), sort: 0 },
    { id: uid('t'), projectId: 'p_fence', title: 'Clear brush along the fence line', dueDate: addDays(T, 6), sort: 1, open: true },
  ]);
  await db.insert(s.notes).values([
    { id: uid('n'), parentType: 'project', parentId: 'p_shed', userId: uJamie, date: addDays(T, -4), ts: Date.now() - 86400000 * 4, body: 'Footings poured and cured — ready for framing.' },
  ]);

  await db.insert(s.inventory).values([
    { id: 'inv_feed', name: 'Layer feed', category: 'Feed', unit: 'bags', qty: 6, reorderAt: 4, notes: '50 lb bags' },
    { id: 'inv_shavings', name: 'Pine shavings', category: 'Bedding', unit: 'bales', qty: 3, reorderAt: 5 },
    { id: 'inv_diesel', name: 'Off-road diesel', category: 'Fuel', unit: 'gal', qty: 22, reorderAt: 20, notes: 'tractor + generator' },
    { id: 'inv_filter', name: 'Tractor oil filters', category: 'Parts', unit: 'count', qty: 1, reorderAt: 2, notes: 'Kubota HH164-32430' },
  ]);

  await db.insert(s.rentAssignments).values([
    { userId: uSam, amount: 500, dueDay: 1, active: true },
    { userId: uJamie, amount: 450, dueDay: 1, active: true },
  ]);
  await db.insert(s.rentCharges).values([
    { id: uid('rc'), userId: uSam, month: lastMk, amount: 500, dueDate: `${lastMk}-01`, status: 'verified', markedAt: `${lastMk}-01`, markedBy: uSam, verifiedAt: `${lastMk}-02`, verifiedBy: uMorgan },
    { id: uid('rc'), userId: uJamie, month: lastMk, amount: 450, dueDate: `${lastMk}-01`, status: 'verified', markedAt: `${lastMk}-03`, markedBy: uJamie, verifiedAt: `${lastMk}-03`, verifiedBy: uMorgan },
    { id: uid('rc'), userId: uSam, month: mk, amount: 500, dueDate: `${mk}-01`, status: 'marked', markedAt: T, markedBy: uSam, note: 'Left cash in the office' },
    { id: uid('rc'), userId: uJamie, month: mk, amount: 450, dueDate: `${mk}-01`, status: 'unpaid' },
  ]);

  await db.insert(s.activity).values([
    { id: uid('act'), ts: Date.now() - 86400000 * 4, userId: uJamie, text: 'completed task "Pour concrete footings" on Build run-in shed' },
    { id: uid('act'), ts: Date.now() - 86400000 * 2, userId: uMorgan, text: 'created project "Fence the north pasture"' },
  ]);

  // eslint-disable-next-line no-console
  console.log(`Seeded demo data. Admin: ${adminEmail}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
