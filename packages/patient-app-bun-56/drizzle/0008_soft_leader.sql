ALTER TABLE `organizations` ADD `active_member_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `active_member_count` integer DEFAULT 0 NOT NULL;