CREATE TABLE `inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`lease_id` text,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `rental_units`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `inspections_unit_idx` ON `inspections` (`unit_id`,`date`);--> statement-breakpoint
CREATE TABLE `lease_tenants` (
	`lease_id` text NOT NULL,
	`user_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`lease_id`, `user_id`),
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lease_tenants_user_idx` ON `lease_tenants` (`user_id`);--> statement-breakpoint
CREATE TABLE `leases` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`rent` real NOT NULL,
	`due_day` integer DEFAULT 1 NOT NULL,
	`deposit` real,
	`late_fee` real,
	`grace_days` integer DEFAULT 5 NOT NULL,
	`notice_days` integer DEFAULT 60 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`reminder_stage` text,
	`reminder_sent_on` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `rental_units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `leases_unit_idx` ON `leases` (`unit_id`,`status`);--> statement-breakpoint
CREATE TABLE `rental_units` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `utility_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`account_no` text DEFAULT '' NOT NULL,
	`bill_back_pct` integer DEFAULT 100 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `rental_units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `utility_accounts_unit_idx` ON `utility_accounts` (`unit_id`);--> statement-breakpoint
CREATE TABLE `utility_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`period` text NOT NULL,
	`amount` real NOT NULL,
	`charge_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `utility_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`charge_id`) REFERENCES `rent_charges`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `utility_bills_account_idx` ON `utility_bills` (`account_id`,`period`);--> statement-breakpoint
DROP INDEX IF EXISTS `rent_charges_user_month_unique`;--> statement-breakpoint
ALTER TABLE `rent_charges` ADD `lease_id` text REFERENCES leases(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `rent_charges` ADD `kind` text DEFAULT 'rent' NOT NULL;--> statement-breakpoint
ALTER TABLE `rent_charges` ADD `label` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Each person who had rent becomes a unit with a month-to-month lease, with them
-- as the primary tenant, and their existing charges move under that lease.
-- (rent_assignments is kept as-is but no longer used.)
INSERT INTO `rental_units` (`id`, `name`, `kind`)
  SELECT 'ru_' || a.user_id, u.name || '''s place', 'other'
  FROM `rent_assignments` a JOIN `users` u ON u.id = a.user_id;--> statement-breakpoint
INSERT INTO `leases` (`id`, `unit_id`, `start_date`, `end_date`, `rent`, `due_day`, `status`, `notes`)
  SELECT 'ls_' || a.user_id, 'ru_' || a.user_id,
    COALESCE((SELECT MIN(c.month) FROM `rent_charges` c WHERE c.user_id = a.user_id) || '-01', date('now', 'localtime')),
    CASE WHEN a.active THEN NULL ELSE date('now', 'localtime') END,
    a.amount, a.due_day,
    CASE WHEN a.active THEN 'active' ELSE 'ended' END,
    'Created from the rent set up before leases.'
  FROM `rent_assignments` a JOIN `users` u ON u.id = a.user_id;--> statement-breakpoint
INSERT INTO `lease_tenants` (`lease_id`, `user_id`, `is_primary`)
  SELECT 'ls_' || a.user_id, a.user_id, 1 FROM `rent_assignments` a JOIN `users` u ON u.id = a.user_id;--> statement-breakpoint
UPDATE `rent_charges` SET `lease_id` = 'ls_' || `user_id`
  WHERE `user_id` IN (SELECT a.user_id FROM `rent_assignments` a JOIN `users` u ON u.id = a.user_id);--> statement-breakpoint
-- Requests already sent by a current tenant belong to their unit.
UPDATE `maintenance_requests` SET `unit_id` = 'ru_' || `created_by`
  WHERE `unit_id` IS NULL AND `created_by` IN (SELECT `user_id` FROM `rent_assignments` WHERE `active` = 1);--> statement-breakpoint
CREATE UNIQUE INDEX `rent_charges_lease_month_unique` ON `rent_charges` (`lease_id`,`month`) WHERE kind = 'rent';--> statement-breakpoint
CREATE INDEX `rent_charges_lease_idx` ON `rent_charges` (`lease_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rent_charges_user_month_unique` ON `rent_charges` (`user_id`,`month`) WHERE kind = 'rent' AND lease_id IS NULL;