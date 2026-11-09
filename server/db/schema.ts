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
  /** @deprecated superseded by `chore_assignees`; kept as the pre-migration backup. */
  assignedTo: text('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  nextDue: text('next_due').notNull(),
  requirePhoto: integer('require_photo', { mode: 'boolean' }).notNull().default(false),
  open: integer('open', { mode: 'boolean' }).notNull().default(false),
  steps: text('steps', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  sentBack: text('sent_back', { mode: 'json' }).$type<SentBack>(),
  // One-time ('once') chores are marked done on completion instead of rolling to a next date.
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
}, (t) => ({
  nextDueIdx: index('chores_next_due_idx').on(t.done, t.nextDue),
}));

export const choreCompletions = sqliteTable('chore_completions', {
  id: text('id').primaryKey(),
  choreId: text('chore_id').notNull().references(() => chores.id, { onDelete: 'cascade' }),
  completedBy: text('completed_by').references(() => users.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  notes: text('notes').notNull().default(''),
  photoId: text('photo_id').references(() => attachments.id, { onDelete: 'set null' }),
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
}, (t) => ({
  itemIdx: index('maintenance_logs_item_idx').on(t.itemId, t.date),
}));

/**
 * Who a chore is assigned to. A chore can have several people on it, so
 * assignment lives here rather than in a single column. `chores.assigned_to`
 * is retained only as the pre-multi-assignee backup and is no longer read.
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
  /** @deprecated superseded by `task_assignees`; kept as the pre-migration backup. */
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
});

export const inventoryLog = sqliteTable('inventory_log', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull().references(() => inventory.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  delta: real('delta').notNull(),
  reason: text('reason').notNull().default(''),
  date: text('date').notNull(),
}, (t) => ({
  itemIdx: index('inventory_log_item_idx').on(t.itemId, t.date),
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
  parentType: text('parent_type').$type<'project' | 'task' | 'asset'>().notNull(),
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
}, (t) => ({
  userMonthUnique: uniqueIndex('rent_charges_user_month_unique').on(t.userId, t.month),
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
