CREATE TABLE `project_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`label` text NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`user_id` text,
	`photo_id` text,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`photo_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `inventory` ADD `unit_cost` real;--> statement-breakpoint
ALTER TABLE `notification_prefs` ADD `event_push` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `budget` real;