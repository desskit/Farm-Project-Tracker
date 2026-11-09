ALTER TABLE `activity` ADD `audience` text;--> statement-breakpoint
ALTER TABLE `activity` ADD `href` text;
--> statement-breakpoint
-- Entries from before audiences existed may mention rent or access: money people only.
UPDATE `activity` SET `audience` = 'finance.view' WHERE `audience` IS NULL;
