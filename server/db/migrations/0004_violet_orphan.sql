CREATE TABLE `asset_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`name` text NOT NULL,
	`doc_type` text DEFAULT 'other' NOT NULL,
	`attachment_id` text NOT NULL,
	`uploaded_by` text,
	`date` text NOT NULL,
	`ts` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `assets` ADD `make_model` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `serial` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `purchase_date` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `purchase_cost` real;