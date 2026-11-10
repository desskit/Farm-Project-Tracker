CREATE TABLE `chore_supplies` (
	`chore_id` text NOT NULL,
	`inventory_id` text NOT NULL,
	`qty` real NOT NULL,
	PRIMARY KEY(`chore_id`, `inventory_id`),
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `chore_completions` ADD `supplies_used` text;--> statement-breakpoint
ALTER TABLE `inventory_log` ADD `ref_type` text;--> statement-breakpoint
ALTER TABLE `inventory_log` ADD `ref_id` text;--> statement-breakpoint
CREATE INDEX `inventory_log_ref_idx` ON `inventory_log` (`ref_type`,`ref_id`);--> statement-breakpoint
ALTER TABLE `maintenance_logs` ADD `parts` text;