CREATE TABLE IF NOT EXISTS `local_health_records` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`document_type_id` text,
	`title` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`document_date` text,
	`facility_name` text,
	`notes` text,
	`provenance` text DEFAULT 'patient_uploaded' NOT NULL,
	`urgency` text DEFAULT 'routine' NOT NULL,
	`local_blob_path` text,
	`is_cached` integer DEFAULT false NOT NULL,
	`sync_status` text DEFAULT 'queued' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_sync_error` text,
	`server_id` text,
	`storage_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_local_health_records_patient_date` ON `local_health_records` (`patient_id`,`document_date`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_local_health_records_patient_status` ON `local_health_records` (`patient_id`,`sync_status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_local_health_records_patient_category` ON `local_health_records` (`patient_id`,`category`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `local_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`document_number` text,
	`ordering_facility_id` text,
	`ordering_facility_name` text,
	`issuer_name` text,
	`issuer_prc_license` text,
	`issued_at` integer NOT NULL,
	`provenance` text DEFAULT 'clinicez_verified' NOT NULL,
	`urgency` text DEFAULT 'routine' NOT NULL,
	`stage` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`file_url` text,
	`file_name` text,
	`mime_type` text,
	`size_bytes` integer,
	`local_blob_path` text,
	`is_cached` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_local_documents_patient_issued` ON `local_documents` (`patient_id`,`issued_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_local_documents_patient_category` ON `local_documents` (`patient_id`,`category`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `upload_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`record_id` text NOT NULL,
	`file_uri` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`title` text NOT NULL,
	`document_type_id` text NOT NULL,
	`document_date` text,
	`facility_name` text,
	`notes` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`error_message` text,
	`fatal_error` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_upload_queue_patient_status` ON `upload_queue` (`patient_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `files_metadata` ADD `title` text;--> statement-breakpoint
ALTER TABLE `files_metadata` ADD `document_date` text;--> statement-breakpoint
ALTER TABLE `files_metadata` ADD `facility_name` text;--> statement-breakpoint
ALTER TABLE `files_metadata` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `files_metadata` ADD `is_cached` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `files_metadata` ADD `last_sync_error` text;--> statement-breakpoint
ALTER TABLE `files_metadata` ADD `retry_count` integer DEFAULT 0 NOT NULL;
