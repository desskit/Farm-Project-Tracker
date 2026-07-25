ALTER TABLE `users` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `deactivated_at` integer;