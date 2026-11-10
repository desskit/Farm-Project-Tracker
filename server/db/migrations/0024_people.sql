CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`show_tenants` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guide_links` (
	`guide_id` text NOT NULL,
	`parent_type` text NOT NULL,
	`parent_id` text NOT NULL,
	PRIMARY KEY(`guide_id`, `parent_type`, `parent_id`),
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guide_links_parent_idx` ON `guide_links` (`parent_type`,`parent_id`);--> statement-breakpoint
CREATE TABLE `guide_photos` (
	`guide_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	`step` integer DEFAULT -1 NOT NULL,
	PRIMARY KEY(`guide_id`, `attachment_id`),
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guide_photos_attachment_idx` ON `guide_photos` (`attachment_id`);--> statement-breakpoint
CREATE TABLE `guides` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`created_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT 'farm' NOT NULL,
	`expires_on` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `chores` ADD `rotate` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `chores` ADD `turn_user_id` text REFERENCES users(id) ON DELETE set null;