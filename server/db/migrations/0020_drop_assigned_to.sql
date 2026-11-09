-- The old single-assignee columns go. Anything still only recorded there is
-- copied into the assignee tables first, so nobody loses an assignment.
-- (Foreign keys are off for the whole migration: drizzle's migrator turns them
-- off around it, so rebuilding these tables doesn't cascade into their children.)
INSERT OR IGNORE INTO `chore_assignees` (`chore_id`, `user_id`)
  SELECT `id`, `assigned_to` FROM `chores` WHERE `assigned_to` IN (SELECT `id` FROM `users`);--> statement-breakpoint
INSERT OR IGNORE INTO `task_assignees` (`task_id`, `user_id`)
  SELECT `id`, `assigned_to` FROM `project_tasks` WHERE `assigned_to` IN (SELECT `id` FROM `users`);--> statement-breakpoint
CREATE TABLE `__new_chores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`schedule` text NOT NULL,
	`catch_up` text DEFAULT 'skipToNext' NOT NULL,
	`next_due` text NOT NULL,
	`require_photo` integer DEFAULT false NOT NULL,
	`open` integer DEFAULT false NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`sent_back` text,
	`done` integer DEFAULT false NOT NULL,
	`link_type` text,
	`link_id` text
);
--> statement-breakpoint
INSERT INTO `__new_chores`("id", "name", "schedule", "catch_up", "next_due", "require_photo", "open", "steps", "sent_back", "done", "link_type", "link_id") SELECT "id", "name", "schedule", "catch_up", "next_due", "require_photo", "open", "steps", "sent_back", "done", "link_type", "link_id" FROM `chores`;--> statement-breakpoint
DROP TABLE `chores`;--> statement-breakpoint
ALTER TABLE `__new_chores` RENAME TO `chores`;--> statement-breakpoint
CREATE INDEX `chores_link_idx` ON `chores` (`link_type`,`link_id`);--> statement-breakpoint
CREATE INDEX `chores_next_due_idx` ON `chores` (`done`,`next_due`);--> statement-breakpoint
CREATE TABLE `__new_project_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`due_date` text,
	`done` integer DEFAULT false NOT NULL,
	`done_by` text,
	`done_at` text,
	`done_photo_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`require_photo` integer DEFAULT false NOT NULL,
	`open` integer DEFAULT false NOT NULL,
	`sent_back` text,
	`repeat` text,
	`repeated_to` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`done_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`done_photo_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_project_tasks`("id", "project_id", "title", "description", "due_date", "done", "done_by", "done_at", "done_photo_id", "sort", "require_photo", "open", "sent_back", "repeat", "repeated_to") SELECT "id", "project_id", "title", "description", "due_date", "done", "done_by", "done_at", "done_photo_id", "sort", "require_photo", "open", "sent_back", "repeat", "repeated_to" FROM `project_tasks`;--> statement-breakpoint
DROP TABLE `project_tasks`;--> statement-breakpoint
ALTER TABLE `__new_project_tasks` RENAME TO `project_tasks`;--> statement-breakpoint
CREATE INDEX `project_tasks_project_idx` ON `project_tasks` (`project_id`,`sort`);