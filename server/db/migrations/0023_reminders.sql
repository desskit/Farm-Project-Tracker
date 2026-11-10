CREATE TABLE `calendar_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_tokens_token_hash_unique` ON `calendar_tokens` (`token_hash`);--> statement-breakpoint
ALTER TABLE `asset_docs` ADD `expires_on` text;--> statement-breakpoint
ALTER TABLE `asset_docs` ADD `reminder_stage` text;--> statement-breakpoint
ALTER TABLE `land_units` ADD `graze_days` integer;--> statement-breakpoint
ALTER TABLE `rent_docs` ADD `expires_on` text;--> statement-breakpoint
ALTER TABLE `rent_docs` ADD `reminder_stage` text;