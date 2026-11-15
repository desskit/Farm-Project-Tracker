CREATE TABLE `vault_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text DEFAULT '' NOT NULL,
	`can_edit` integer DEFAULT false NOT NULL,
	`expires_on` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `vault_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vault_shares_entry_idx` ON `vault_shares` (`entry_id`);--> statement-breakpoint
CREATE INDEX `vault_shares_target_idx` ON `vault_shares` (`target_type`,`target_id`);--> statement-breakpoint
INSERT INTO `vault_shares` (`id`, `entry_id`, `target_type`, `target_id`, `can_edit`, `expires_on`)
  SELECT 'vs' || lower(hex(randomblob(8))), eg.`entry_id`, 'group', eg.`group_id`, 0, NULL
  FROM `vault_entry_groups` eg JOIN `vault_entries` e ON e.`id` = eg.`entry_id` WHERE e.`visibility` = 'groups';
--> statement-breakpoint
INSERT INTO `vault_shares` (`id`, `entry_id`, `target_type`, `target_id`, `can_edit`, `expires_on`)
  SELECT 'vs' || lower(hex(randomblob(8))), `id`, `visibility`, '', 0, NULL
  FROM `vault_entries` WHERE `visibility` IN ('farm', 'everyone');
