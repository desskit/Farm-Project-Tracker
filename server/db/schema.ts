/**
 * Drizzle schema for the Farm Project Tracker (SQLite / libsql).
 *
 * Ported from the prototype's runtime state shapes (js/store.js `seed()`), with
 * server-phase additions: real auth (users.email/passwordHash), sessions,
 * invites, attachments (files on disk), and push subscriptions.
 *
 * Conventions:
 *  - ids are text (nanoid-style), mirroring the prototype's `uid()` prefixes.
 *  - "date" columns are ISO date-only strings ("YYYY-MM-DD"), as in the prototype.
 *  - "ts"/timestamp columns are epoch milliseconds (integer).
 *  - JSON-shaped fields (schedule, steps, sentBack) use text with { mode: 'json' }.
 */
import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export type Role = 'admin' | 'manager' | 'worker';

export type Schedule = {
  type: 'daily' | 'everyNDays' | 'weekly' | 'monthly';
  n?: number;
  weekdays?: number[];
  day?: number;
  season?: { start: string; end: string };
};

export type SentBack = { by: string; at: number; reason: string; worker: string | null } | null;

const now = sql`(unixepoch() * 1000)`;

/* ---------------- auth ---------------- */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'), // null until the invite is accepted
  role: text('role').$type<Role>().notNull().default('worker'),
  createdAt: integer('created_at').notNull().default(now),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // opaque session token
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull().default(now),
  expiresAt: integer('expires_at').notNull(),
});

export const invites = sqliteTable('invites', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
});

/**
 * Login throttle — one row per throttle key (e.g. "email:foo@bar" or an IP).
 * Counts recent failures within a window; a lockout stamps `locked_until`.
 * Rows are pruned by the nightly cleanup job.
 */
export const authThrottle = sqliteTable('auth_throttle', {
  key: text('key').primaryKey(),
  failures: integer('failures').notNull().default(0),
  firstFailedAt: integer('first_failed_at').notNull(),
  lockedUntil: integer('locked_until'),
});

/* ---------------- attachments (files on disk) ---------------- */
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  path: text('path').notNull(), // relative to UPLOAD_DIR
  mime: text('mime').notNull(),
  size: integer('size').notNull().default(0),
  uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
});

/* ---------------- chores ---------------- */
export const chores = sqliteTable('chores', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  schedule: text('schedule', { mode: 'json' }).$type<Schedule>().notNull(),
  catchUp: text('catch_up').$type<'mustCatchUp' | 'skipToNext'>().notNull().default('skipToNext'),
  assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  nextDue: text('next_due').notNull(),
  requirePhoto: integer('require_photo', { mode: 'boolean' }).notNull().default(false),
  open: integer('open', { mode: 'boolean' }).notNull().default(false),
  steps: text('steps', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  sentBack: text('sent_back', { mode: 'json' }).$type<SentBack>(),
});

export const choreCompletions = sqliteTable('chore_completions', {
  id: text('id').primaryKey(),
  choreId: text('chore_id').notNull().references(() => chores.id, { onDelete: 'cascade' }),
  completedBy: text('completed_by').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  notes: text('notes').notNull().default(''),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
});

/* ---------------- assets & maintenance ---------------- */
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default('Equipment'),
  meterUnit: text('meter_unit'), // 'hours' | 'miles' | null
  notes: text('notes').notNull().default(''),
});

export const meterReadings = sqliteTable('meter_readings', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  reading: real('reading').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
});

export const maintenanceItems = sqliteTable('maintenance_items', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  intervalType: text('interval_type').$type<'calendar' | 'usage'>().notNull(),
  intervalValue: real('interval_value').notNull(),
  intervalUnit: text('interval_unit').$type<'months' | 'days'>(),
  lastDoneDate: text('last_done_date'),
  lastDoneReading: real('last_done_reading'),
  dueAtReading: real('due_at_reading'),
  nextDueDate: text('next_due_date'),
  requirePhoto: integer('require_photo', { mode: 'boolean' }).notNull().default(false),
  sentBack: text('sent_back', { mode: 'json' }).$type<SentBack>(),
});

export const maintenanceLogs = sqliteTable('maintenance_logs', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull().references(() => maintenanceItems.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  reading: real('reading'),
  notes: text('notes').notNull().default(''),
  cost: real('cost').notNull().default(0),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
});

/* ---------------- projects & tasks ---------------- */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').$type<'idea' | 'planned' | 'in_progress' | 'on_hold' | 'done'>().notNull().default('idea'),
  targetDate: text('target_date'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
});

export const projectTasks = sqliteTable('project_tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  dueDate: text('due_date'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  doneBy: text('done_by').references(() => users.id, { onDelete: 'set null' }),
  doneAt: text('done_at'),
  donePhotoId: text('done_photo_id').references(() => attachments.id, { onDelete: 'set null' }),
  sort: integer('sort').notNull().default(0),
  requirePhoto: integer('require_photo', { mode: 'boolean' }).notNull().default(false),
  open: integer('open', { mode: 'boolean' }).notNull().default(false),
  sentBack: text('sent_back', { mode: 'json' }).$type<SentBack>(),
});

/* ---------------- inventory ---------------- */
export const inventory = sqliteTable('inventory', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default('Supplies'),
  unit: text('unit').notNull().default('count'),
  qty: real('qty').notNull().default(0),
  reorderAt: real('reorder_at').notNull().default(0),
  notes: text('notes').notNull().default(''),
});

export const inventoryLog = sqliteTable('inventory_log', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull().references(() => inventory.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  delta: real('delta').notNull(),
  reason: text('reason').notNull().default(''),
  date: text('date').notNull(),
});

/* ---------------- time tracking ---------------- */
export const timeEntries = sqliteTable('time_entries', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<'chore' | 'task' | 'maintenance'>().notNull(),
  refId: text('ref_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  start: integer('start').notNull(),
  end: integer('end'),
  seconds: integer('seconds').notNull().default(0),
});

/* ---------------- notes ---------------- */
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  parentType: text('parent_type').$type<'project' | 'task' | 'asset'>().notNull(),
  parentId: text('parent_id').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  ts: integer('ts').notNull().default(now),
  body: text('body').notNull().default(''),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
});

/* ---------------- rent ---------------- */
export const rentAssignments = sqliteTable('rent_assignments', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  dueDay: integer('due_day').notNull().default(1),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const rentCharges = sqliteTable('rent_charges', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  month: text('month').notNull(), // YYYY-MM
  amount: real('amount').notNull(),
  dueDate: text('due_date').notNull(),
  status: text('status').$type<'unpaid' | 'marked' | 'verified'>().notNull().default('unpaid'),
  markedAt: text('marked_at'),
  markedBy: text('marked_by').references(() => users.id, { onDelete: 'set null' }),
  verifiedAt: text('verified_at'),
  verifiedBy: text('verified_by').references(() => users.id, { onDelete: 'set null' }),
  note: text('note').notNull().default(''),
});

/* ---------------- notifications & misc ---------------- */
export const notificationPrefs = sqliteTable('notification_prefs', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').$type<'off' | 'daily' | 'weekly'>().notNull().default('daily'),
  push: integer('push', { mode: 'boolean' }).notNull().default(true),
  digestHour: integer('digest_hour').notNull().default(6),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  keys: text('keys', { mode: 'json' }).$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: integer('created_at').notNull().default(now),
});

export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(),
  ts: integer('ts').notNull().default(now),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  text: text('text').notNull(),
});

// Singleton key/value settings (e.g. weather cache). One row per key.
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
});
