CREATE TABLE `hatches` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text,
	`species` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`set_on` text NOT NULL,
	`eggs_set` integer NOT NULL,
	`fertile` integer,
	`hatched` integer,
	`status` text DEFAULT 'incubating' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `animal_groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `hatches_status_idx` ON `hatches` (`status`,`set_on`);--> statement-breakpoint
ALTER TABLE `animals` ADD `photo_id` text REFERENCES attachments(id) ON DELETE set null;