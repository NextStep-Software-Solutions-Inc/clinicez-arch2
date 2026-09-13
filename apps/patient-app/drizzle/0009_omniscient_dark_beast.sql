ALTER TABLE `booking_drafts` ADD `attached_file_ids_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `file_folders` ADD `sync_operation` text DEFAULT 'insert' NOT NULL;--> statement-breakpoint
ALTER TABLE `file_upload_config` ADD `encrypted_mak` text;--> statement-breakpoint
ALTER TABLE `files_metadata` ADD `sync_operation` text DEFAULT 'insert' NOT NULL;