CREATE TABLE `pay_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text,
	`timer_hours` real DEFAULT 0 NOT NULL,
	`typed_hours` real DEFAULT 0 NOT NULL,
	`rate` real NOT NULL,
	`gross` real NOT NULL,
	`to_rent` real DEFAULT 0 NOT NULL,
	`paid_out` real DEFAULT 0 NOT NULL,
	`paid_on` text,
	`paid_how` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `pay_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pay_lines_run_idx` ON `pay_lines` (`run_id`);--> statement-breakpoint
CREATE INDEX `pay_lines_user_idx` ON `pay_lines` (`user_id`);--> statement-breakpoint
CREATE TABLE `pay_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`approved_by` text,
	`approved_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pay_runs_period_start_unique` ON `pay_runs` (`period_start`);--> statement-breakpoint
CREATE TABLE `pay_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`hourly_rate` real NOT NULL,
	`rent_rule` text DEFAULT 'none' NOT NULL,
	`rent_fixed` real,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rent_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`charge_id` text NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT 'work' NOT NULL,
	`pay_line_id` text,
	`settled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`charge_id`) REFERENCES `rent_charges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pay_line_id`) REFERENCES `pay_lines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rent_credits_charge_idx` ON `rent_credits` (`charge_id`);--> statement-breakpoint
CREATE TABLE `work_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`hours` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `work_logs_user_idx` ON `work_logs` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `work_logs_status_idx` ON `work_logs` (`status`);