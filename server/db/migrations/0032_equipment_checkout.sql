CREATE TABLE `asset_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`user_id` text,
	`out_at` integer NOT NULL,
	`due_back` text,
	`in_at` integer,
	`checked_in_by` text,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`checked_in_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `asset_checkouts_asset_idx` ON `asset_checkouts` (`asset_id`,`in_at`);--> statement-breakpoint
CREATE INDEX `asset_checkouts_user_idx` ON `asset_checkouts` (`user_id`);