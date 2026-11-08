CREATE TABLE `user_caps` (
	`user_id` text NOT NULL,
	`cap` text NOT NULL,
	`allow` integer NOT NULL,
	`set_by` text,
	`set_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `cap`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `users` ADD `access_expires_at` integer;