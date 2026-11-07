CREATE INDEX `activity_ts_idx` ON `activity` (`ts`);--> statement-breakpoint
CREATE INDEX `asset_docs_asset_idx` ON `asset_docs` (`asset_id`);--> statement-breakpoint
CREATE INDEX `chore_assignees_user_idx` ON `chore_assignees` (`user_id`);--> statement-breakpoint
CREATE INDEX `chore_completions_chore_idx` ON `chore_completions` (`chore_id`,`date`);--> statement-breakpoint
CREATE INDEX `chore_completions_by_idx` ON `chore_completions` (`completed_by`,`date`);--> statement-breakpoint
CREATE INDEX `chores_next_due_idx` ON `chores` (`done`,`next_due`);--> statement-breakpoint
CREATE INDEX `inventory_log_item_idx` ON `inventory_log` (`item_id`,`date`);--> statement-breakpoint
CREATE INDEX `maintenance_items_asset_idx` ON `maintenance_items` (`asset_id`);--> statement-breakpoint
CREATE INDEX `maintenance_logs_item_idx` ON `maintenance_logs` (`item_id`,`date`);--> statement-breakpoint
CREATE INDEX `meter_readings_asset_idx` ON `meter_readings` (`asset_id`,`reading`);--> statement-breakpoint
CREATE INDEX `notes_parent_idx` ON `notes` (`parent_type`,`parent_id`);--> statement-breakpoint
CREATE INDEX `project_expenses_project_idx` ON `project_expenses` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_tasks_project_idx` ON `project_tasks` (`project_id`,`sort`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
-- Hand-added: a page load and the nightly cron could both create the same
-- month's charge, so production may already hold duplicates, and the unique
-- index below would then fail at boot. Keep one per person per month — the
-- most settled (verified, then marked, then unpaid), newest first — and drop
-- the rest. Nothing references rent_charges by id.
DELETE FROM `rent_charges` WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY `user_id`, `month`
      ORDER BY CASE `status` WHEN 'verified' THEN 0 WHEN 'marked' THEN 1 ELSE 2 END, rowid DESC
    ) AS `rn` FROM `rent_charges`
  ) WHERE `rn` > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `rent_charges_user_month_unique` ON `rent_charges` (`user_id`,`month`);--> statement-breakpoint
CREATE INDEX `rent_charges_month_idx` ON `rent_charges` (`month`);--> statement-breakpoint
CREATE INDEX `rent_docs_user_idx` ON `rent_docs` (`user_id`);--> statement-breakpoint
CREATE INDEX `rent_docs_attachment_idx` ON `rent_docs` (`attachment_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_assignees_user_idx` ON `task_assignees` (`user_id`);--> statement-breakpoint
CREATE INDEX `time_entries_user_idx` ON `time_entries` (`user_id`,`end`);--> statement-breakpoint
CREATE INDEX `time_entries_ref_idx` ON `time_entries` (`kind`,`ref_id`);