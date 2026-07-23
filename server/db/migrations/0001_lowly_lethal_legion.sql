CREATE TABLE `auth_throttle` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`first_failed_at` integer NOT NULL,
	`locked_until` integer
);
