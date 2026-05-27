CREATE TABLE `patient_diagnostic_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`exam_type` text NOT NULL,
	`referral_facility` text,
	`lab_date` text,
	`date_added` text,
	`status` text,
	`diagnostic_lab_fee` real,
	`glucose_mg` text,
	`glucose_mmol` text,
	`cholesterol` text,
	`triglycerides` text,
	`hdl` text,
	`ldl` text,
	`lipid_total` text,
	`findings` text,
	`oth_diag_exam` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_medicines` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`category` text,
	`drug_code` text,
	`generic_code` text,
	`salt_code` text,
	`strength_code` text,
	`form_code` text,
	`oth_med_drug_grouping` text,
	`is_dispensed` text NOT NULL,
	`is_applicable` text DEFAULT 'Y' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_ncd_assessment` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`qid1_yn` text,
	`qid2_yn` text,
	`qid3_yn` text,
	`qid4_yn` text,
	`qid5_ynx` text,
	`qid19_fbs_mg` text,
	`qid19_fbs_mmol` text,
	`qid19_fbs_date` text,
	`qid20_chole_val` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_ncd_assessment_patient_id_unique` ON `patient_ncd_assessment` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_past_medical_history` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`mdisease_code` text,
	`specific_desc` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_surgical_history` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`surg_desc` text,
	`surg_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_vitals` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`systolic` real,
	`diastolic` real,
	`hr` real,
	`rr` real,
	`temp` real,
	`height` real,
	`weight` real,
	`bmi` real,
	`z_score` text,
	`left_vision` text,
	`right_vision` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_vitals_patient_id_unique` ON `patient_vitals` (`patient_id`);--> statement-breakpoint
ALTER TABLE `philhealth_profiles` ADD `prof_date` text;--> statement-breakpoint
ALTER TABLE `philhealth_profiles` ADD `hci_trans_no` text;--> statement-breakpoint
ALTER TABLE `philhealth_profiles` ADD `hci_case_no` text;