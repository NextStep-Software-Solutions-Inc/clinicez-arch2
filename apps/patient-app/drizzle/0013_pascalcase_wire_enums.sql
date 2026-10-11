PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inbox_lab_requests` (
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
	`payment_status` text DEFAULT 'None' NOT NULL,
	`laboratory_name` text,
	`claim_token` text,
	`reason` text,
	`issued_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_inbox_lab_requests`("id", "patient_id", "requisition_id", "ordering_tenant_id", "ordering_facility_id", "ordering_facility_name", "accession_number", "title", "urgency", "items_json", "stage", "quoted_amount", "currency", "payment_required", "payment_status", "laboratory_name", "claim_token", "reason", "issued_at", "updated_at") SELECT "id", "patient_id", "requisition_id", "ordering_tenant_id", "ordering_facility_id", "ordering_facility_name", "accession_number", "title", "urgency", "items_json", "stage", "quoted_amount", "currency", "payment_required", "payment_status", "laboratory_name", "claim_token", "reason", "issued_at", "updated_at" FROM `inbox_lab_requests`;--> statement-breakpoint
DROP TABLE `inbox_lab_requests`;--> statement-breakpoint
ALTER TABLE `__new_inbox_lab_requests` RENAME TO `inbox_lab_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_inbox_lab_requests_patient_issued` ON `inbox_lab_requests` (`patient_id`,`issued_at`);--> statement-breakpoint
DELETE FROM `inbox_lab_requests`;--> statement-breakpoint
DELETE FROM `inbox_prescriptions`;--> statement-breakpoint
DELETE FROM `inbox_lab_results`;--> statement-breakpoint
DELETE FROM `inbox_medical_certificates`;--> statement-breakpoint
DELETE FROM `sync_cursors`;
