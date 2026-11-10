CREATE TABLE `inspection_photos` (
	`inspection_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`inspection_id`, `attachment_id`),
	FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inspection_photos_attachment_idx` ON `inspection_photos` (`attachment_id`);