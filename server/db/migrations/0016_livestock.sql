CREATE TABLE `animal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`animal_id` text,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`count_delta` integer DEFAULT 0 NOT NULL,
	`inventory_id` text,
	`qty_used` real,
	`weight` real,
	`cost` real,
	`meat_until` text,
	`milk_until` text,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `animal_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`animal_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `animal_events_group_idx` ON `animal_events` (`group_id`,`date`);--> statement-breakpoint
CREATE INDEX `animal_events_animal_idx` ON `animal_events` (`animal_id`);--> statement-breakpoint
CREATE INDEX `animal_events_withdrawal_idx` ON `animal_events` (`meat_until`,`milk_until`);--> statement-breakpoint
CREATE TABLE `animal_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`species` text NOT NULL,
	`kind` text DEFAULT 'herd' NOT NULL,
	`head_count` integer DEFAULT 0 NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `animals` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`tag` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`sex` text DEFAULT 'unknown' NOT NULL,
	`breed` text DEFAULT '' NOT NULL,
	`birth_date` text,
	`dam_id` text,
	`sire_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `animal_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `animals_group_idx` ON `animals` (`group_id`,`status`);--> statement-breakpoint
CREATE TABLE `breedings` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`dam_id` text,
	`sire` text DEFAULT '' NOT NULL,
	`bred_on` text NOT NULL,
	`due_on` text,
	`status` text DEFAULT 'bred' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	FOREIGN KEY (`group_id`) REFERENCES `animal_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dam_id`) REFERENCES `animals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `breedings_due_idx` ON `breedings` (`status`,`due_on`);--> statement-breakpoint
CREATE INDEX `breedings_group_idx` ON `breedings` (`group_id`);--> statement-breakpoint
CREATE TABLE `production_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`user_id` text,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `animal_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `production_logs_group_idx` ON `production_logs` (`group_id`,`kind`,`date`);--> statement-breakpoint
CREATE INDEX `production_logs_date_idx` ON `production_logs` (`kind`,`date`);--> statement-breakpoint
ALTER TABLE `chores` ADD `link_type` text;--> statement-breakpoint
ALTER TABLE `chores` ADD `link_id` text;--> statement-breakpoint
CREATE INDEX `chores_link_idx` ON `chores` (`link_type`,`link_id`);--> statement-breakpoint
ALTER TABLE `inventory` ADD `meat_withdrawal_days` integer;--> statement-breakpoint
ALTER TABLE `inventory` ADD `milk_withdrawal_days` integer;