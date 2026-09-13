CREATE TABLE `file_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`sync_status` text DEFAULT 'local' NOT NULL,
	`sync_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`synced_at` integer,
	`server_id` text,
	`server_updated_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `file_types` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`supported_extensions_json` text DEFAULT '[]' NOT NULL,
	`supported_mime_types_json` text DEFAULT '[]' NOT NULL,
	`native_preview_kind` text DEFAULT 'external' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer NOT NULL,
	`server_updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `file_upload_config` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`max_file_size_bytes` integer NOT NULL,
	`quota_bytes` integer NOT NULL,
	`used_storage_bytes` integer DEFAULT 0 NOT NULL,
	`native_preview_extensions_json` text DEFAULT '[]' NOT NULL,
	`config_version` text DEFAULT 'local-defaults' NOT NULL,
	`fetched_at` integer NOT NULL,
	`server_updated_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_files_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text,
	`clinic_id` text,
	`folder_id` text,
	`file_type_id` text,
	`name` text NOT NULL,
	`type` text,
	`mime_type` text,
	`extension` text,
	`size_bytes` integer,
	`encrypted_size_bytes` integer,
	`server_url` text,
	`local_path` text,
	`local_encrypted_path` text,
	`cloud_object_key` text,
	`sync_status` text DEFAULT 'local' NOT NULL,
	`sync_error` text,
	`encryption_algorithm` text DEFAULT 'AES-256-GCM' NOT NULL,
	`encryption_key_id` text,
	`encryption_iv_base64` text,
	`encryption_tag_base64` text,
	`encrypted_hash` text,
	`server_wrapped_key_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	`server_updated_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`folder_id`) REFERENCES `file_folders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_type_id`) REFERENCES `file_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_files_metadata`("id", "patient_id", "clinic_id", "folder_id", "file_type_id", "name", "type", "mime_type", "extension", "size_bytes", "encrypted_size_bytes", "server_url", "local_path", "local_encrypted_path", "cloud_object_key", "sync_status", "sync_error", "encryption_algorithm", "encryption_key_id", "encryption_iv_base64", "encryption_tag_base64", "encrypted_hash", "server_wrapped_key_json", "created_at", "updated_at", "deleted_at", "synced_at", "server_id", "server_created_at", "server_updated_at") SELECT "id", NULL, "clinic_id", NULL, NULL, "name", "type", NULL, NULL, "size_bytes", NULL, "server_url", "local_path", NULL, NULL, CASE WHEN "synced_at" IS NULL THEN 'local' ELSE 'synced' END, NULL, 'AES-256-GCM', NULL, NULL, NULL, NULL, NULL, "created_at", "created_at", NULL, "synced_at", "server_id", "server_created_at", NULL FROM `files_metadata`;--> statement-breakpoint
DROP TABLE `files_metadata`;--> statement-breakpoint
ALTER TABLE `__new_files_metadata` RENAME TO `files_metadata`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
