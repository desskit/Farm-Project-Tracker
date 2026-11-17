CREATE TABLE `standing_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer` text NOT NULL,
	`kind` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`item` text DEFAULT '' NOT NULL,
	`qty` real,
	`unit` text DEFAULT '' NOT NULL,
	`price` real NOT NULL,
	`every` text NOT NULL,
	`start_date` text NOT NULL,
	`next_date` text NOT NULL,
	`group_id` text,
	`land_unit_id` text,
	`paid_on_delivery` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `animal_groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`land_unit_id`) REFERENCES `land_units`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `standing_orders_next_idx` ON `standing_orders` (`active`,`next_date`);