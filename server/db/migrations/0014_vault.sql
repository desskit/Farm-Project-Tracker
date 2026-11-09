CREATE TABLE `vault_access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text,
	`entry_title` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `vault_entries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `vault_access_log_entry_idx` ON `vault_access_log` (`entry_id`,`ts`);--> statement-breakpoint
CREATE TABLE `vault_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`title` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`username_enc` text DEFAULT '' NOT NULL,
	`secret_enc` text NOT NULL,
	`notes_enc` text DEFAULT '' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `vault_entries_owner_idx` ON `vault_entries` (`owner_id`);--> statement-breakpoint
CREATE TABLE `vault_entry_groups` (
	`entry_id` text NOT NULL,
	`group_id` text NOT NULL,
	PRIMARY KEY(`entry_id`, `group_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `vault_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `vault_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vault_entry_groups_group_idx` ON `vault_entry_groups` (`group_id`);--> statement-breakpoint
CREATE TABLE `vault_group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `vault_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vault_group_members_user_idx` ON `vault_group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `vault_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
