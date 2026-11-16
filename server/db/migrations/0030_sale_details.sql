ALTER TABLE `sales` ADD `category` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `serial` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `personal` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `seller_id` text REFERENCES users(id) ON DELETE set null;