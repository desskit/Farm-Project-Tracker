CREATE TABLE `chore_assignees` (
	`chore_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`chore_id`, `user_id`),
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_assignees` (
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `user_id`),
	FOREIGN KEY (`task_id`) REFERENCES `project_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT OR IGNORE INTO `chore_assignees` (`chore_id`, `user_id`) SELECT `id`, `assigned_to` FROM `chores` WHERE `assigned_to` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `task_assignees` (`task_id`, `user_id`) SELECT `id`, `assigned_to` FROM `project_tasks` WHERE `assigned_to` IS NOT NULL;
