CREATE TABLE `maintenance_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text,
	`unit_id` text,
	`title` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`urgent` integer DEFAULT false NOT NULL,
	`photo_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`photo_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `maintenance_requests_created_by_idx` ON `maintenance_requests` (`created_by`);--> statement-breakpoint
CREATE INDEX `maintenance_requests_status_idx` ON `maintenance_requests` (`status`);--> statement-breakpoint
CREATE TABLE `request_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text,
	`body` text NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `maintenance_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `request_comments_request_idx` ON `request_comments` (`request_id`,`ts`);