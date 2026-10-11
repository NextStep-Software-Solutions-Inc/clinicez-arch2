CREATE TABLE `inbox_lab_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`requisition_id` text NOT NULL,
	`ordering_tenant_id` text NOT NULL,
	`ordering_facility_id` text NOT NULL,
	`ordering_facility_name` text,
	`accession_number` text,
	`title` text NOT NULL,
	`urgency` text,
	`items_json` text DEFAULT '[]' NOT NULL,
	`stage` text NOT NULL,
	`quoted_amount` real,
	`currency` text,
	`payment_required` integer DEFAULT false NOT NULL,
	`payment_status` text DEFAULT 'none' NOT NULL,
	`laboratory_name` text,
	`claim_token` text,
	`reason` text,
	`issued_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_lab_requests_patient_issued` ON `inbox_lab_requests` (`patient_id`,`issued_at`);--> statement-breakpoint
CREATE TABLE `inbox_prescriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`prescription_number` text NOT NULL,
	`ordering_tenant_id` text NOT NULL,
	`ordering_facility_id` text NOT NULL,
	`ordering_facility_name` text,
	`prescriber_name` text NOT NULL,
	`prescriber_prc_license` text,
	`diagnosis` text,
	`instructions` text,
	`items_json` text DEFAULT '[]' NOT NULL,
	`stage` text NOT NULL,
	`quoted_amount` real,
	`pharmacy_name` text,
	`claim_token` text,
	`verification_url` text,
	`receipt_number` text,
	`dispensed_at` integer,
	`external_pharmacy_name` text,
	`issued_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_prescriptions_patient_issued` ON `inbox_prescriptions` (`patient_id`,`issued_at`);--> statement-breakpoint
CREATE TABLE `inbox_lab_results` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`requisition_id` text,
	`laboratory_name` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`verification` text NOT NULL,
	`reviewed_by_name` text,
	`reviewed_at` integer,
	`remarks` text,
	`impression` text,
	`is_critical` integer DEFAULT false NOT NULL,
	`resulted_at` integer NOT NULL,
	`file_url` text,
	`observations_json` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_lab_results_patient_resulted` ON `inbox_lab_results` (`patient_id`,`resulted_at`);--> statement-breakpoint
CREATE INDEX `idx_inbox_lab_results_requisition` ON `inbox_lab_results` (`requisition_id`);--> statement-breakpoint
CREATE TABLE `inbox_medical_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`certificate_number` text NOT NULL,
	`issuer_name` text NOT NULL,
	`doctor_name` text NOT NULL,
	`doctor_prc_license` text,
	`purpose` text NOT NULL,
	`diagnosis` text,
	`remarks` text,
	`rest_days` integer,
	`valid_from` integer,
	`valid_to` integer,
	`verification_url` text,
	`issued_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_medical_certificates_patient_issued` ON `inbox_medical_certificates` (`patient_id`,`issued_at`);--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`cursor` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `clinics` DROP COLUMN `base_url`;