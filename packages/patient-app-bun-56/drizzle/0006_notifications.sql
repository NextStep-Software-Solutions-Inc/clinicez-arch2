CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`data` text,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	`expires_at` integer,
	`source_id` text,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_patient_id` ON `notifications` (`patient_id`);
--> statement-breakpoint
CREATE INDEX `idx_notifications_unread` ON `notifications` (`patient_id`,`is_read`);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`category` text NOT NULL,
	`push_enabled` integer DEFAULT true NOT NULL,
	`in_app_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notification_pref` ON `notification_preferences` (`patient_id`,`category`);
