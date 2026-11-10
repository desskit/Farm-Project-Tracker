CREATE TABLE `deposit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`amount` real NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`inspection_id` text,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `deposit_entries_lease_idx` ON `deposit_entries` (`lease_id`,`date`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`item` text DEFAULT '' NOT NULL,
	`qty` real,
	`unit` text DEFAULT '' NOT NULL,
	`amount` real NOT NULL,
	`buyer` text DEFAULT '' NOT NULL,
	`paid` integer DEFAULT true NOT NULL,
	`paid_on` text,
	`group_id` text,
	`land_unit_id` text,
	`animal_event_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `animal_groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`land_unit_id`) REFERENCES `land_units`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`animal_event_id`) REFERENCES `animal_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sales_date_idx` ON `sales` (`date`);--> statement-breakpoint
CREATE INDEX `sales_owed_idx` ON `sales` (`paid`);--> statement-breakpoint
ALTER TABLE `inventory_log` ADD `cost` real;--> statement-breakpoint
ALTER TABLE `inventory_log` ADD `vendor` text;--> statement-breakpoint
-- Leases that already record a deposit start their ledger with it as received.
INSERT INTO `deposit_entries` (`id`, `lease_id`, `date`, `kind`, `amount`, `reason`)
  SELECT 'de_' || `id`, `id`, `start_date`, 'received', `deposit`, 'Deposit on the lease' FROM `leases` WHERE `deposit` > 0;
