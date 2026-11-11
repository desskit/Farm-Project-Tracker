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
import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { Role } from '../lib/domain/permissions';
export type { Role };

export type Schedule = {
  // 'once' is a one-time chore that does not repeat — it's marked done on completion.
  type: 'once' | 'daily' | 'everyNDays' | 'weekly' | 'monthly';
  n?: number;
  weekdays?: number[];
  day?: number;
  season?: { start: string; end: string };
};

export type ChoreLinkType = 'animal_group';
export type RenewalStage = 'month' | 'week' | 'expired';
export type SupplyRefType = 'animal_group' | 'land_unit' | 'asset' | 'chore';
/** A supply drawn somewhere: which, how much, and its name/unit at the time (for history). */
export type SupplyUseRecord = { inventoryId: string; qty: number; name?: string; unit?: string };
export type TaskRepeat = { every: number; unit: 'days' | 'weeks' | 'months' } | null;
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
  // Deactivated people keep all their history but cannot sign in and are not
  // offered for new assignments. Preferred over deleting, which would cascade
  // away their rent charges and logged time.
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  deactivatedAt: integer('deactivated_at'),
  // Guests (and anyone else given a time limit) stop being able to sign in
  // after this moment (epoch ms). Null = no end date.
  accessExpiresAt: integer('access_expires_at'),
  /** The newest "what's new" entry this person has dismissed (lib/whats-new.ts). */
  newsSeen: text('news_seen').notNull().default(''),
});

/**
 * Per-person switches on top of the role's defaults (lib/domain/permissions.ts).
 * Only capabilities the role marks as toggleable are honoured; anything else
 * stored here is ignored, so a role change can't leave a stray grant behind.
 */
export const userCaps = sqliteTable('user_caps', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cap: text('cap').notNull(),
  allow: integer('allow', { mode: 'boolean' }).notNull(),
  setBy: text('set_by').references(() => users.id, { onDelete: 'set null' }),
  setAt: integer('set_at').notNull().default(now),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.cap] }),
}));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // SHA-256 of the session cookie value (lib/auth/tokens.ts)
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull().default(now),
  expiresAt: integer('expires_at').notNull(),
}, (t) => ({
  userIdx: index('sessions_user_idx').on(t.userId),
}));

export const invites = sqliteTable('invites', {
  token: text('token').primaryKey(), // SHA-256 of the link token; the raw token is never stored
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

/**
 * Remembers the outcome of a write so replaying it is a no-op.
 *
 * A phone that saved work offline replays it when signal returns, and the same
 * request can legitimately arrive twice (queue flushed from two tabs, or a
 * response lost in transit and the user tapped again). Each queued write
 * carries a client-generated key; the first one through claims the row with
 * `status = 0`, and once it finishes the real status and body are stored and
 * returned verbatim to any repeat. Rows are pruned by the nightly cleanup job.
 */
export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 0 while the original request is still running; the HTTP status once done.
  status: integer('status').notNull().default(0),
  response: text('response').notNull().default(''),
  createdAt: integer('created_at').notNull().default(now),
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
  nextDue: text('next_due').notNull(),
  requirePhoto: integer('require_photo', { mode: 'boolean' }).notNull().default(false),
  open: integer('open', { mode: 'boolean' }).notNull().default(false),
  steps: text('steps', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  sentBack: text('sent_back', { mode: 'json' }).$type<SentBack>(),
  // One-time ('once') chores are marked done on completion instead of rolling to a next date.
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  /** Recurring care tied to something on the farm, e.g. ('animal_group', id). */
  linkType: text('link_type').$type<ChoreLinkType>(),
  linkId: text('link_id'),
  /** Take turns: only `turn_user_id` has it on their list; it moves on each time it's done or skipped. */
  rotate: integer('rotate', { mode: 'boolean' }).notNull().default(false),
  turnUserId: text('turn_user_id').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  linkIdx: index('chores_link_idx').on(t.linkType, t.linkId),
  nextDueIdx: index('chores_next_due_idx').on(t.done, t.nextDue),
}));

export const choreCompletions = sqliteTable('chore_completions', {
  id: text('id').primaryKey(),
  choreId: text('chore_id').notNull().references(() => chores.id, { onDelete: 'cascade' }),
  completedBy: text('completed_by').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  notes: text('notes').notNull().default(''),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
  /** Supplies this completion took off the shelf, so sending it back can return them. */
  suppliesUsed: text('supplies_used', { mode: 'json' }).$type<SupplyUseRecord[]>(),
}, (t) => ({
  choreIdx: index('chore_completions_chore_idx').on(t.choreId, t.date),
  byIdx: index('chore_completions_by_idx').on(t.completedBy, t.date),
}));

/* ---------------- assets & maintenance ---------------- */
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default('Equipment'),
  meterUnit: text('meter_unit'), // 'hours' | 'miles' | null
  notes: text('notes').notNull().default(''),
  // Registry details — what the farm owns, beyond what needs servicing.
  makeModel: text('make_model').notNull().default(''),
  serial: text('serial').notNull().default(''),
  purchaseDate: text('purchase_date'),
  purchaseCost: real('purchase_cost'),
});

export const meterReadings = sqliteTable('meter_readings', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  reading: real('reading').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
}, (t) => ({
  assetIdx: index('meter_readings_asset_idx').on(t.assetId, t.reading),
}));

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
}, (t) => ({
  assetIdx: index('maintenance_items_asset_idx').on(t.assetId),
}));

export const maintenanceLogs = sqliteTable('maintenance_logs', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull().references(() => maintenanceItems.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  reading: real('reading'),
  notes: text('notes').notNull().default(''),
  cost: real('cost').notNull().default(0),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
  /** Parts and fluids taken off Supplies for this service. */
  parts: text('parts', { mode: 'json' }).$type<SupplyUseRecord[]>(),
}, (t) => ({
  itemIdx: index('maintenance_logs_item_idx').on(t.itemId, t.date),
}));

/**
 * Who a chore is assigned to. A chore can have several people on it, so
 * assignment lives here rather than in a single column.
 */
export const choreAssignees = sqliteTable(
  'chore_assignees',
  {
    choreId: text('chore_id').notNull().references(() => chores.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.choreId, t.userId] }),
    // "What's assigned to me" looks up by person, not by chore.
    userIdx: index('chore_assignees_user_idx').on(t.userId),
  }),
);

/**
 * Documents filed against an asset — receipts, manuals, warranties. The file
 * itself lives in `attachments`; this row carries the label and kind so the
 * registry can group them.
 */
export type AssetDocType = 'receipt' | 'manual' | 'warranty' | 'other';
export const assetDocs = sqliteTable('asset_docs', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  docType: text('doc_type').$type<AssetDocType>().notNull().default('other'),
  attachmentId: text('attachment_id').notNull().references(() => attachments.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  ts: integer('ts').notNull().default(now),
  /** When the paper runs out (insurance, registration, warranty). Reminded at 30 days, 7 days and after. */
  expiresOn: text('expires_on'),
  reminderStage: text('reminder_stage').$type<RenewalStage>(),
}, (t) => ({
  assetIdx: index('asset_docs_asset_idx').on(t.assetId),
}));

/* ---------------- projects & tasks ---------------- */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').$type<'idea' | 'planned' | 'in_progress' | 'on_hold' | 'done'>().notNull().default('idea'),
  targetDate: text('target_date'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
  /** Planned spend for the project. Null = no budget set, so nothing to track against. */
  budget: real('budget'),
});

/**
 * Money spent on a project — materials, hired help, permits. Kept separate from
 * maintenance logs (which are per-asset servicing costs) because a project's
 * spend isn't tied to a piece of equipment.
 */
export const projectExpenses = sqliteTable('project_expenses', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  amount: real('amount').notNull(),
  date: text('date').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
  ts: integer('ts').notNull().default(now),
}, (t) => ({
  projectIdx: index('project_expenses_project_idx').on(t.projectId),
}));

export const projectTasks = sqliteTable('project_tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  dueDate: text('due_date'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  doneBy: text('done_by').references(() => users.id, { onDelete: 'set null' }),
  doneAt: text('done_at'),
  donePhotoId: text('done_photo_id').references(() => attachments.id, { onDelete: 'set null' }),
  sort: integer('sort').notNull().default(0),
  requirePhoto: integer('require_photo', { mode: 'boolean' }).notNull().default(false),
  open: integer('open', { mode: 'boolean' }).notNull().default(false),
  sentBack: text('sent_back', { mode: 'json' }).$type<SentBack>(),
  /** A repeating task: when it's done, the next one is created this far after its due date. */
  repeat: text('repeat', { mode: 'json' }).$type<TaskRepeat>(),
  /** The task created when this one was done, so undoing can take it back. */
  repeatedTo: text('repeated_to'),
}, (t) => ({
  projectIdx: index('project_tasks_project_idx').on(t.projectId, t.sort),
}));

/** Who a project task is assigned to — same shape as chore_assignees. */
export const taskAssignees = sqliteTable(
  'task_assignees',
  {
    taskId: text('task_id').notNull().references(() => projectTasks.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taskId, t.userId] }),
    userIdx: index('task_assignees_user_idx').on(t.userId),
  }),
);

/* ---------------- inventory ---------------- */
export const inventory = sqliteTable('inventory', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default('Supplies'),
  unit: text('unit').notNull().default('count'),
  qty: real('qty').notNull().default(0),
  reorderAt: real('reorder_at').notNull().default(0),
  notes: text('notes').notNull().default(''),
  /** What one `unit` costs, for on-hand value and consumption spend. Null = unpriced. */
  unitCost: real('unit_cost'),
  /** Days after a treatment with this before meat / milk & eggs are safe to use. */
  meatWithdrawalDays: integer('meat_withdrawal_days'),
  milkWithdrawalDays: integer('milk_withdrawal_days'),
});

export const inventoryLog = sqliteTable('inventory_log', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull().references(() => inventory.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  delta: real('delta').notNull(),
  reason: text('reason').notNull().default(''),
  date: text('date').notNull(),
  /** What the supplies were used on (a herd, a bed, a machine), for costing. */
  refType: text('ref_type').$type<SupplyRefType>(),
  refId: text('ref_id'),
  /** Restocks: what was paid in total, and where it was bought. */
  cost: real('cost'),
  vendor: text('vendor'),
}, (t) => ({
  itemIdx: index('inventory_log_item_idx').on(t.itemId, t.date),
  refIdx: index('inventory_log_ref_idx').on(t.refType, t.refId),
}));

/* ---------------- time tracking ---------------- */
export const timeEntries = sqliteTable('time_entries', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<'chore' | 'task' | 'maintenance'>().notNull(),
  refId: text('ref_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  start: integer('start').notNull(),
  end: integer('end'),
  seconds: integer('seconds').notNull().default(0),
}, (t) => ({
  userIdx: index('time_entries_user_idx').on(t.userId, t.end),
  refIdx: index('time_entries_ref_idx').on(t.kind, t.refId),
}));

/* ---------------- notes ---------------- */
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  parentType: text('parent_type').$type<'project' | 'task' | 'asset' | 'chore'>().notNull(),
  parentId: text('parent_id').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  ts: integer('ts').notNull().default(now),
  body: text('body').notNull().default(''),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
}, (t) => ({
  parentIdx: index('notes_parent_idx').on(t.parentType, t.parentId),
}));

/* ---------------- rent ---------------- */
export const rentAssignments = sqliteTable('rent_assignments', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  dueDay: integer('due_day').notNull().default(1),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export type ChargeKind = 'rent' | 'utility' | 'late_fee' | 'other';

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
  /**
   * Which reminder this charge last got, and when. The reminder job runs
   * daily, so without these a renter would be told the same thing every
   * morning; with them each stage lands once and overdue repeats weekly.
   */
  reminderStage: text('reminder_stage').$type<'upcoming' | 'due' | 'overdue'>(),
  reminderSentOn: text('reminder_sent_on'),
  /** The lease this is billed under (null only for charges from before leases). */
  leaseId: text('lease_id').references(() => leases.id, { onDelete: 'set null' }),
  /** Rent, a utility billed back, a late fee… Only one 'rent' per lease per month. */
  kind: text('kind').$type<ChargeKind>().notNull().default('rent'),
  label: text('label').notNull().default(''),
}, (t) => ({
  leaseMonthUnique: uniqueIndex('rent_charges_lease_month_unique').on(t.leaseId, t.month).where(sql`kind = 'rent'`),
  legacyUserMonthUnique: uniqueIndex('rent_charges_user_month_unique').on(t.userId, t.month).where(sql`kind = 'rent' AND lease_id IS NULL`),
  leaseIdx: index('rent_charges_lease_idx').on(t.leaseId),
  monthIdx: index('rent_charges_month_idx').on(t.month),
}));

/**
 * Rental paperwork filed against a renter — the lease and everything that
 * hangs off it. Attached to the person rather than to a monthly charge,
 * because a lease spans the whole tenancy, not one month's rent.
 *
 * These are more sensitive than the app's other attachments (a lease carries
 * terms and signatures), so the file route checks that the viewer is the
 * renter or a manager before serving one.
 */
export type RentDocType = 'lease' | 'addendum' | 'deposit' | 'inspection' | 'insurance' | 'other';
export const rentDocs = sqliteTable('rent_docs', {
  id: text('id').primaryKey(),
  /** The renter the paperwork belongs to. */
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  docType: text('doc_type').$type<RentDocType>().notNull().default('other'),
  attachmentId: text('attachment_id').notNull().references(() => attachments.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  ts: integer('ts').notNull().default(now),
  /** When the paper runs out (insurance, registration, warranty). Reminded at 30 days, 7 days and after. */
  expiresOn: text('expires_on'),
  reminderStage: text('reminder_stage').$type<RenewalStage>(),
}, (t) => ({
  userIdx: index('rent_docs_user_idx').on(t.userId),
  attachmentIdx: index('rent_docs_attachment_idx').on(t.attachmentId),
}));

/* ---------------- notifications & misc ---------------- */
export const notificationPrefs = sqliteTable('notification_prefs', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').$type<'off' | 'daily' | 'weekly'>().notNull().default('daily'),
  push: integer('push', { mode: 'boolean' }).notNull().default(true),
  digestHour: integer('digest_hour').notNull().default(6),
  /**
   * Push as things happen (assigned work, sent-back work, low stock) rather than
   * only in the daily digest. Separate from `push` so someone can keep the
   * once-a-day summary without their phone buzzing all afternoon.
   */
  eventPush: integer('event_push', { mode: 'boolean' }).notNull().default(true),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  keys: text('keys', { mode: 'json' }).$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  userIdx: index('push_subscriptions_user_idx').on(t.userId),
}));

export const activity = sqliteTable('activity', {
  id: text('id').primaryKey(),
  ts: integer('ts').notNull().default(now),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  text: text('text').notNull(),
  /** Capability needed to see this entry (null = anyone on the farm). */
  audience: text('audience'),
  /** Where the entry links to, e.g. /chores/abc. */
  href: text('href'),
}, (t) => ({
  tsIdx: index('activity_ts_idx').on(t.ts),
}));

// Singleton key/value settings (e.g. weather cache). One row per key.
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
});

/* ---------------- maintenance requests ---------------- */
export type RequestStatus = 'open' | 'in_progress' | 'done' | 'declined';

/**
 * Something that needs fixing, reported by a renter or anyone on the farm
 * ("the hot water is out", "gate latch broken"). People with requests.manage
 * handle them. `unitId` is reserved for rental units (not yet a table).
 */
export const maintenanceRequests = sqliteTable('maintenance_requests', {
  id: text('id').primaryKey(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  unitId: text('unit_id'),
  title: text('title').notNull(),
  details: text('details').notNull().default(''),
  status: text('status').$type<RequestStatus>().notNull().default('open'),
  urgent: integer('urgent', { mode: 'boolean' }).notNull().default(false),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, (t) => ({
  createdByIdx: index('maintenance_requests_created_by_idx').on(t.createdBy),
  statusIdx: index('maintenance_requests_status_idx').on(t.status),
}));

/** The back-and-forth on a request, including status changes. */
export const requestComments = sqliteTable('request_comments', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references(() => maintenanceRequests.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  ts: integer('ts').notNull().default(now),
}, (t) => ({
  requestIdx: index('request_comments_request_idx').on(t.requestId, t.ts),
}));

/* ---------------- password & code vault ---------------- */
/**
 * Who can see an entry, chosen by its owner:
 *  private  – only the owner (admins can't open it either);
 *  groups   – the owner and members of the chosen vault groups;
 *  farm     – everyone with farm access;
 *  everyone – everyone who can sign in, renters included (e.g. the gate code).
 */
export type VaultVisibility = 'private' | 'groups' | 'farm' | 'everyone';

/** Sharing groups, managed by admins ("Family", "Crew", "Gate codes"). */
export const vaultGroups = sqliteTable('vault_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
});

export const vaultGroupMembers = sqliteTable('vault_group_members', {
  groupId: text('group_id').notNull().references(() => vaultGroups.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.groupId, t.userId] }),
  userIdx: index('vault_group_members_user_idx').on(t.userId),
}));

/**
 * One stored login or code. Username, secret and notes are encrypted at rest
 * (AES-256-GCM, lib/vault/crypto.ts) with a key kept outside the database
 * and its backups; title and website stay readable so lists can be searched.
 */
export const vaultEntries = sqliteTable('vault_entries', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  url: text('url').notNull().default(''),
  usernameEnc: text('username_enc').notNull().default(''),
  secretEnc: text('secret_enc').notNull(),
  notesEnc: text('notes_enc').notNull().default(''),
  visibility: text('visibility').$type<VaultVisibility>().notNull().default('private'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, (t) => ({
  ownerIdx: index('vault_entries_owner_idx').on(t.ownerId),
}));

export const vaultEntryGroups = sqliteTable('vault_entry_groups', {
  entryId: text('entry_id').notNull().references(() => vaultEntries.id, { onDelete: 'cascade' }),
  groupId: text('group_id').notNull().references(() => vaultGroups.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.entryId, t.groupId] }),
  groupIdx: index('vault_entry_groups_group_idx').on(t.groupId),
}));

/** Every time a secret is shown, copied or changed — who, what, when. */
export const vaultAccessLog = sqliteTable('vault_access_log', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').references(() => vaultEntries.id, { onDelete: 'set null' }),
  entryTitle: text('entry_title').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').$type<'reveal' | 'create' | 'update' | 'delete'>().notNull(),
  ts: integer('ts').notNull().default(now),
}, (t) => ({
  entryIdx: index('vault_access_log_entry_idx').on(t.entryId, t.ts),
}));

/* ---------------- livestock ---------------- */

export type AnimalGroupKind = 'herd' | 'flock' | 'litter' | 'pen';
export type AnimalSex = 'female' | 'male' | 'unknown';
export type AnimalStatus = 'active' | 'sold' | 'dead' | 'processed';

/**
 * A herd, flock, litter or pen. Location lives here only — a lone horse is a
 * group of one. `head_count` is the number of animals, whether or not each has
 * its own record; it only moves through events (birth, purchase, death, sale).
 */
export const animalGroups = sqliteTable('animal_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  species: text('species').notNull(),
  kind: text('kind').$type<AnimalGroupKind>().notNull().default('herd'),
  headCount: integer('head_count').notNull().default(0),
  location: text('location').notNull().default(''),
  /** Where they are now when that's a paddock/field we track; set by grazing moves. */
  landUnitId: text('land_unit_id').references(() => landUnits.id, { onDelete: 'set null' }),
  movedOn: text('moved_on'),
  notes: text('notes').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull().default(now),
});

export const animals = sqliteTable('animals', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => animalGroups.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull().default(''),
  name: text('name').notNull().default(''),
  sex: text('sex').$type<AnimalSex>().notNull().default('unknown'),
  breed: text('breed').notNull().default(''),
  birthDate: text('birth_date'),
  damId: text('dam_id'),
  sireId: text('sire_id'),
  status: text('status').$type<AnimalStatus>().notNull().default('active'),
  notes: text('notes').notNull().default(''),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
}, (t) => ({
  groupIdx: index('animals_group_idx').on(t.groupId, t.status),
}));

export type AnimalEventType = 'treatment' | 'vaccination' | 'weight' | 'birth' | 'death' | 'sale' | 'purchase' | 'slaughter' | 'note';

export const animalEvents = sqliteTable('animal_events', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => animalGroups.id, { onDelete: 'cascade' }),
  animalId: text('animal_id').references(() => animals.id, { onDelete: 'cascade' }),
  type: text('type').$type<AnimalEventType>().notNull(),
  date: text('date').notNull(),
  /** Signed change to the group's head count this event made (0 for most). */
  countDelta: integer('count_delta').notNull().default(0),
  inventoryId: text('inventory_id').references(() => inventory.id, { onDelete: 'set null' }),
  qtyUsed: real('qty_used'),
  weight: real('weight'),
  cost: real('cost'),
  meatUntil: text('meat_until'),
  milkUntil: text('milk_until'),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  groupIdx: index('animal_events_group_idx').on(t.groupId, t.date),
  animalIdx: index('animal_events_animal_idx').on(t.animalId),
  withdrawalIdx: index('animal_events_withdrawal_idx').on(t.meatUntil, t.milkUntil),
}));

export type BreedingStatus = 'bred' | 'confirmed' | 'born' | 'failed';

export const breedings = sqliteTable('breedings', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => animalGroups.id, { onDelete: 'cascade' }),
  damId: text('dam_id').references(() => animals.id, { onDelete: 'set null' }),
  sire: text('sire').notNull().default(''),
  bredOn: text('bred_on').notNull(),
  dueOn: text('due_on'),
  status: text('status').$type<BreedingStatus>().notNull().default('bred'),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  dueIdx: index('breedings_due_idx').on(t.status, t.dueOn),
  groupIdx: index('breedings_group_idx').on(t.groupId),
}));

export type ProductKind = 'eggs' | 'milk' | 'wool';

export const productionLogs = sqliteTable('production_logs', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => animalGroups.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<ProductKind>().notNull(),
  date: text('date').notNull(),
  amount: real('amount').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes').notNull().default(''),
}, (t) => ({
  groupIdx: index('production_logs_group_idx').on(t.groupId, t.kind, t.date),
  dateIdx: index('production_logs_date_idx').on(t.kind, t.date),
}));

/* ---------------- land ---------------- */

export type LandKind = 'garden' | 'bed' | 'pasture' | 'paddock' | 'orchard' | 'field' | 'other';

/** A piece of ground; beds sit in gardens and paddocks in pastures. */
export const landUnits = sqliteTable('land_units', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  kind: text('kind').$type<LandKind>().notNull(),
  name: text('name').notNull(),
  area: real('area'),
  areaUnit: text('area_unit').$type<'sqft' | 'acre'>().notNull().default('sqft'),
  /** Paddocks: days of rest wanted between grazings. */
  restDays: integer('rest_days').notNull().default(30),
  /** Paddocks: how many days a group should stay before moving on (null = no target). */
  grazeDays: integer('graze_days'),
  notes: text('notes').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  parentIdx: index('land_units_parent_idx').on(t.parentId),
}));

export type PlantingStatus = 'planned' | 'growing' | 'harvested' | 'failed';

export const plantings = sqliteTable('plantings', {
  id: text('id').primaryKey(),
  unitId: text('unit_id').notNull().references(() => landUnits.id, { onDelete: 'cascade' }),
  crop: text('crop').notNull(),
  variety: text('variety').notNull().default(''),
  method: text('method').$type<'seed' | 'transplant'>().notNull().default('seed'),
  sownOn: text('sown_on').notNull(),
  daysToMaturity: integer('days_to_maturity'),
  expectedHarvest: text('expected_harvest'),
  status: text('status').$type<PlantingStatus>().notNull().default('planned'),
  inventoryId: text('inventory_id').references(() => inventory.id, { onDelete: 'set null' }),
  seedQty: real('seed_qty'),
  /** Plantings sown together as a succession share this id. */
  series: text('series'),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  unitIdx: index('plantings_unit_idx').on(t.unitId, t.status),
  readyIdx: index('plantings_ready_idx').on(t.status, t.expectedHarvest),
}));

/** Trees, bushes, canes, asparagus — things that stay put for years. */
export const perennials = sqliteTable('perennials', {
  id: text('id').primaryKey(),
  unitId: text('unit_id').notNull().references(() => landUnits.id, { onDelete: 'cascade' }),
  crop: text('crop').notNull(),
  variety: text('variety').notNull().default(''),
  count: integer('count').notNull().default(1),
  plantedOn: text('planted_on'),
  notes: text('notes').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
}, (t) => ({
  unitIdx: index('perennials_unit_idx').on(t.unitId),
}));

export const harvests = sqliteTable('harvests', {
  id: text('id').primaryKey(),
  unitId: text('unit_id').notNull().references(() => landUnits.id, { onDelete: 'cascade' }),
  plantingId: text('planting_id').references(() => plantings.id, { onDelete: 'set null' }),
  perennialId: text('perennial_id').references(() => perennials.id, { onDelete: 'set null' }),
  crop: text('crop').notNull(),
  date: text('date').notNull(),
  amount: real('amount').notNull(),
  unit: text('unit').notNull().default('lb'),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  unitIdx: index('harvests_unit_idx').on(t.unitId, t.date),
  dateIdx: index('harvests_date_idx').on(t.date),
}));

export type LandEventType = 'amend' | 'spray' | 'prune' | 'irrigate' | 'mow' | 'soil_test' | 'note';

export const landEvents = sqliteTable('land_events', {
  id: text('id').primaryKey(),
  unitId: text('unit_id').notNull().references(() => landUnits.id, { onDelete: 'cascade' }),
  type: text('type').$type<LandEventType>().notNull(),
  date: text('date').notNull(),
  inventoryId: text('inventory_id').references(() => inventory.id, { onDelete: 'set null' }),
  qtyUsed: real('qty_used'),
  /** Sprays: first day harvest is allowed again (pre-harvest interval). */
  phiUntil: text('phi_until'),
  cost: real('cost'),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  unitIdx: index('land_events_unit_idx').on(t.unitId, t.date),
  phiIdx: index('land_events_phi_idx').on(t.phiUntil),
}));

export const grazingMoves = sqliteTable('grazing_moves', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull().references(() => animalGroups.id, { onDelete: 'cascade' }),
  fromUnitId: text('from_unit_id').references(() => landUnits.id, { onDelete: 'set null' }),
  toUnitId: text('to_unit_id').references(() => landUnits.id, { onDelete: 'set null' }),
  movedOn: text('moved_on').notNull(),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
}, (t) => ({
  fromIdx: index('grazing_moves_from_idx').on(t.fromUnitId, t.movedOn),
  groupIdx: index('grazing_moves_group_idx').on(t.groupId, t.movedOn),
}));

/* ---------------- rentals ---------------- */

export type RentalKind = 'house' | 'apartment' | 'room' | 'cabin' | 'rv' | 'other';

/** A place the farm rents out. Requests, inspections and utilities hang off it. */
export const rentalUnits = sqliteTable('rental_units', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').$type<RentalKind>().notNull().default('other'),
  address: text('address').notNull().default(''),
  notes: text('notes').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull().default(now),
});

export type LeaseStatus = 'active' | 'ended';
export type LeaseReminderStage = 'renewal' | 'ending' | 'ended';

/** Who rents a unit, for how long, at what rent. No end date = month to month. */
export const leases = sqliteTable('leases', {
  id: text('id').primaryKey(),
  unitId: text('unit_id').notNull().references(() => rentalUnits.id, { onDelete: 'cascade' }),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  rent: real('rent').notNull(),
  dueDay: integer('due_day').notNull().default(1),
  deposit: real('deposit'),
  lateFee: real('late_fee'),
  graceDays: integer('grace_days').notNull().default(5),
  /** Days before the end to start talking about renewal. */
  noticeDays: integer('notice_days').notNull().default(60),
  status: text('status').$type<LeaseStatus>().notNull().default('active'),
  notes: text('notes').notNull().default(''),
  reminderStage: text('reminder_stage').$type<LeaseReminderStage>(),
  reminderSentOn: text('reminder_sent_on'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  unitIdx: index('leases_unit_idx').on(t.unitId, t.status),
}));

export const leaseTenants = sqliteTable('lease_tenants', {
  leaseId: text('lease_id').notNull().references(() => leases.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** The one rent is billed to. Everyone on the lease can see and pay it. */
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
}, (t) => ({
  pk: primaryKey({ columns: [t.leaseId, t.userId] }),
  userIdx: index('lease_tenants_user_idx').on(t.userId),
}));

export type UtilityKind = 'electric' | 'water' | 'gas' | 'propane' | 'internet' | 'trash' | 'other';

export const utilityAccounts = sqliteTable('utility_accounts', {
  id: text('id').primaryKey(),
  unitId: text('unit_id').notNull().references(() => rentalUnits.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<UtilityKind>().notNull(),
  provider: text('provider').notNull().default(''),
  accountNo: text('account_no').notNull().default(''),
  /** Share of each bill charged to the tenant, 0–100. 0 = farm pays. */
  billBackPct: integer('bill_back_pct').notNull().default(100),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
}, (t) => ({
  unitIdx: index('utility_accounts_unit_idx').on(t.unitId),
}));

export const utilityBills = sqliteTable('utility_bills', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => utilityAccounts.id, { onDelete: 'cascade' }),
  period: text('period').notNull(), // YYYY-MM the bill covers
  amount: real('amount').notNull(),
  /** The tenant charge it created, if any. */
  chargeId: text('charge_id').references(() => rentCharges.id, { onDelete: 'set null' }),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  accountIdx: index('utility_bills_account_idx').on(t.accountId, t.period),
}));

export type InspectionKind = 'move_in' | 'move_out' | 'routine';
export type Condition = 'good' | 'fair' | 'poor' | 'na';
export type InspectionItem = { area: string; condition: Condition; notes: string };

export const inspections = sqliteTable('inspections', {
  id: text('id').primaryKey(),
  unitId: text('unit_id').notNull().references(() => rentalUnits.id, { onDelete: 'cascade' }),
  leaseId: text('lease_id').references(() => leases.id, { onDelete: 'set null' }),
  kind: text('kind').$type<InspectionKind>().notNull(),
  date: text('date').notNull(),
  items: text('items', { mode: 'json' }).$type<InspectionItem[]>().notNull().default(sql`'[]'`),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  unitIdx: index('inspections_unit_idx').on(t.unitId, t.date),
}));

/** Photos taken during an inspection, optionally tied to an area ("Kitchen"). */
export const inspectionPhotos = sqliteTable('inspection_photos', {
  inspectionId: text('inspection_id').notNull().references(() => inspections.id, { onDelete: 'cascade' }),
  attachmentId: text('attachment_id').notNull().references(() => attachments.id, { onDelete: 'cascade' }),
  area: text('area').notNull().default(''),
}, (t) => ({
  pk: primaryKey({ columns: [t.inspectionId, t.attachmentId] }),
  attachmentIdx: index('inspection_photos_attachment_idx').on(t.attachmentId),
}));

/** Supplies a chore uses every time it's done ("2 scoops of layer feed"). */
export const choreSupplies = sqliteTable('chore_supplies', {
  choreId: text('chore_id').notNull().references(() => chores.id, { onDelete: 'cascade' }),
  inventoryId: text('inventory_id').notNull().references(() => inventory.id, { onDelete: 'cascade' }),
  qty: real('qty').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.choreId, t.inventoryId] }),
}));

/** One secret calendar-feed link per person (the token itself is never stored, only its hash). */
export const calendarTokens = sqliteTable('calendar_tokens', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: integer('created_at').notNull().default(now),
});

/* ---------------- people & communication ---------------- */

export type NoticeAudience = 'farm' | 'tenants' | 'everyone';

/** An announcement pinned to the top of Today (farm) and/or the renter portal (tenants). */
export const notices = sqliteTable('notices', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  audience: text('audience').$type<NoticeAudience>().notNull().default('farm'),
  /** Last day it shows (null = until taken down). */
  expiresOn: text('expires_on'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
});

export type GuideStep = { text: string };
export type GuideParentType = 'chore' | 'asset' | 'animal_group' | 'land_unit';

/** A how-to: "Starting the generator", "Mixing milk replacer". Steps in order, photos alongside. */
export const guides = sqliteTable('guides', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  steps: text('steps', { mode: 'json' }).$type<GuideStep[]>().notNull().default(sql`'[]'`),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at').notNull().default(now),
});

export const guidePhotos = sqliteTable('guide_photos', {
  guideId: text('guide_id').notNull().references(() => guides.id, { onDelete: 'cascade' }),
  attachmentId: text('attachment_id').notNull().references(() => attachments.id, { onDelete: 'cascade' }),
  /** Which step it illustrates (0-based); -1 = the guide as a whole. */
  step: integer('step').notNull().default(-1),
}, (t) => ({
  pk: primaryKey({ columns: [t.guideId, t.attachmentId] }),
  attachmentIdx: index('guide_photos_attachment_idx').on(t.attachmentId),
}));

/** Where a guide shows up: on a chore, a machine, a herd, a bed. */
export const guideLinks = sqliteTable('guide_links', {
  guideId: text('guide_id').notNull().references(() => guides.id, { onDelete: 'cascade' }),
  parentType: text('parent_type').$type<GuideParentType>().notNull(),
  parentId: text('parent_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.guideId, t.parentType, t.parentId] }),
  parentIdx: index('guide_links_parent_idx').on(t.parentType, t.parentId),
}));

export type ContactKind = 'emergency' | 'vet' | 'farrier' | 'supplier' | 'utility' | 'other';

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').$type<ContactKind>().notNull().default('other'),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  notes: text('notes').notNull().default(''),
  /** Also shown to tenants in the renter portal (e.g. after-hours plumber). */
  showTenants: integer('show_tenants', { mode: 'boolean' }).notNull().default(false),
});

/* ---------------- money in ---------------- */

export type SaleKind = 'eggs' | 'milk' | 'produce' | 'animal' | 'hay' | 'other';

/** Something the farm sold. Optionally tied to the herd or ground it came from, for profit by enterprise. */
export const sales = sqliteTable('sales', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  kind: text('kind').$type<SaleKind>().notNull(),
  item: text('item').notNull().default(''),
  qty: real('qty'),
  unit: text('unit').notNull().default(''),
  amount: real('amount').notNull(),
  buyer: text('buyer').notNull().default(''),
  paid: integer('paid', { mode: 'boolean' }).notNull().default(true),
  paidOn: text('paid_on'),
  groupId: text('group_id').references(() => animalGroups.id, { onDelete: 'set null' }),
  landUnitId: text('land_unit_id').references(() => landUnits.id, { onDelete: 'set null' }),
  /** Set when the sale was recorded as an animal "sale" event; removing the event removes this. */
  animalEventId: text('animal_event_id').references(() => animalEvents.id, { onDelete: 'cascade' }),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  dateIdx: index('sales_date_idx').on(t.date),
  owedIdx: index('sales_owed_idx').on(t.paid),
}));

export type DepositKind = 'received' | 'deduction' | 'refund';

/** Money in and out of a lease's security deposit. Balance = received − deductions − refunds. */
export const depositEntries = sqliteTable('deposit_entries', {
  id: text('id').primaryKey(),
  leaseId: text('lease_id').notNull().references(() => leases.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  kind: text('kind').$type<DepositKind>().notNull(),
  amount: real('amount').notNull(),
  reason: text('reason').notNull().default(''),
  inspectionId: text('inspection_id').references(() => inspections.id, { onDelete: 'set null' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  leaseIdx: index('deposit_entries_lease_idx').on(t.leaseId, t.date),
}));

export type HatchStatus = 'incubating' | 'hatched' | 'failed';

/** A clutch of eggs in the incubator (or under a broody hen): set date, candling, hatch. */
export const hatches = sqliteTable('hatches', {
  id: text('id').primaryKey(),
  /** The flock the chicks will join (can be chosen at hatch). */
  groupId: text('group_id').references(() => animalGroups.id, { onDelete: 'set null' }),
  species: text('species').notNull(),
  label: text('label').notNull().default(''),
  setOn: text('set_on').notNull(),
  eggsSet: integer('eggs_set').notNull(),
  fertile: integer('fertile'),
  hatched: integer('hatched'),
  status: text('status').$type<HatchStatus>().notNull().default('incubating'),
  notes: text('notes').notNull().default(''),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  statusIdx: index('hatches_status_idx').on(t.status, t.setOn),
}));

/* ---------------- outgoing webhooks ---------------- */

/**
 * A URL the farm calls when something happens (low stock, a new request, a
 * weather alert…), for home automation or services like IFTTT. Admin only.
 */
export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  /** Event types this hook wants; empty means all of them. */
  events: text('events', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  /** Signs each delivery (HMAC-SHA256 in the X-Farm-Signature header). */
  secret: text('secret').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  lastStatus: text('last_status').notNull().default(''),
  lastAt: integer('last_at'),
  createdAt: integer('created_at').notNull().default(now),
});

/* ---------------- loans (sales paid back over time) ---------------- */

export type LoanEvery = 'week' | 'month';
export type LoanStatus = 'active' | 'paid';

/**
 * A sale to someone on the farm, paid back in set instalments with no
 * interest. The sale stays "owed" until the loan is paid off.
 */
export const loans = sqliteTable('loans', {
  id: text('id').primaryKey(),
  saleId: text('sale_id').notNull().unique().references(() => sales.id, { onDelete: 'cascade' }),
  borrowerId: text('borrower_id').references(() => users.id, { onDelete: 'set null' }),
  principal: real('principal').notNull(),
  instalment: real('instalment').notNull(),
  every: text('every').$type<LoanEvery>().notNull(),
  firstDue: text('first_due').notNull(),
  status: text('status').$type<LoanStatus>().notNull().default('active'),
  paidOffOn: text('paid_off_on'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  borrowerIdx: index('loans_borrower_idx').on(t.borrowerId, t.status),
}));

export type LoanPaymentStatus = 'pending' | 'confirmed';

/** Money paid toward a loan. The borrower marks it; someone who handles money confirms it. */
export const loanPayments = sqliteTable('loan_payments', {
  id: text('id').primaryKey(),
  loanId: text('loan_id').notNull().references(() => loans.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  amount: real('amount').notNull(),
  status: text('status').$type<LoanPaymentStatus>().notNull().default('pending'),
  note: text('note').notNull().default(''),
  markedBy: text('marked_by').references(() => users.id, { onDelete: 'set null' }),
  confirmedBy: text('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
  confirmedAt: integer('confirmed_at'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => ({
  loanIdx: index('loan_payments_loan_idx').on(t.loanId, t.status),
}));
