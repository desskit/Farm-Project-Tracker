CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` integer DEFAULT 0 NOT NULL,
	`response` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
