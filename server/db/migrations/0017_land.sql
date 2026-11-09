CREATE TABLE `grazing_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`from_unit_id` text,
	`to_unit_id` text,
	`moved_on` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	FOREIGN KEY (`group_id`) REFERENCES `animal_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_unit_id`) REFERENCES `land_units`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_unit_id`) REFERENCES `land_units`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `grazing_moves_from_idx` ON `grazing_moves` (`from_unit_id`,`moved_on`);--> statement-breakpoint
CREATE INDEX `grazing_moves_group_idx` ON `grazing_moves` (`group_id`,`moved_on`);--> statement-breakpoint
CREATE TABLE `harvests` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`planting_id` text,
	`perennial_id` text,
	`crop` text NOT NULL,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text DEFAULT 'lb' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	FOREIGN KEY (`unit_id`) REFERENCES `land_units`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planting_id`) REFERENCES `plantings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`perennial_id`) REFERENCES `perennials`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `harvests_unit_idx` ON `harvests` (`unit_id`,`date`);--> statement-breakpoint
CREATE INDEX `harvests_date_idx` ON `harvests` (`date`);--> statement-breakpoint
CREATE TABLE `land_events` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`inventory_id` text,
	`qty_used` real,
	`phi_until` text,
	`cost` real,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `land_units`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `land_events_unit_idx` ON `land_events` (`unit_id`,`date`);--> statement-breakpoint
CREATE INDEX `land_events_phi_idx` ON `land_events` (`phi_until`);--> statement-breakpoint
CREATE TABLE `land_units` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`area` real,
	`area_unit` text DEFAULT 'sqft' NOT NULL,
	`rest_days` integer DEFAULT 30 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `land_units_parent_idx` ON `land_units` (`parent_id`);--> statement-breakpoint
CREATE TABLE `perennials` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`crop` text NOT NULL,
	`variety` text DEFAULT '' NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`planted_on` text,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `land_units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `perennials_unit_idx` ON `perennials` (`unit_id`);--> statement-breakpoint
CREATE TABLE `plantings` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`crop` text NOT NULL,
	`variety` text DEFAULT '' NOT NULL,
	`method` text DEFAULT 'seed' NOT NULL,
	`sown_on` text NOT NULL,
	`days_to_maturity` integer,
	`expected_harvest` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`inventory_id` text,
	`seed_qty` real,
	`series` text,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	FOREIGN KEY (`unit_id`) REFERENCES `land_units`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plantings_unit_idx` ON `plantings` (`unit_id`,`status`);--> statement-breakpoint
CREATE INDEX `plantings_ready_idx` ON `plantings` (`status`,`expected_harvest`);--> statement-breakpoint
ALTER TABLE `animal_groups` ADD `land_unit_id` text REFERENCES land_units(id);--> statement-breakpoint
ALTER TABLE `animal_groups` ADD `moved_on` text;