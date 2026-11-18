CREATE TABLE IF NOT EXISTS `patient_home_cache` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`clinic_ez_id` text,
	`welcome_visited_steps_json` text DEFAULT '[]' NOT NULL,
	`checked_in_appointments_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `patient_vital_telemetry` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	`heart_rate_bpm` integer,
	`bp_systolic` integer,
	`bp_diastolic` integer,
	`fasting_blood_glucose` real,
	`sleep_duration_minutes` integer,
	`deep_sleep_minutes` integer,
	`source` text,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_patient_vital_telemetry_patient_recorded` ON `patient_vital_telemetry` (`patient_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `patient_medication_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`medication_id` text NOT NULL,
	`log_date` text NOT NULL,
	`scheduled_time_label` text DEFAULT '8:00 AM' NOT NULL,
	`taken_at` text NOT NULL,
	`notes` text,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medication_id`) REFERENCES `patient_medications`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_patient_med_logs_daily` ON `patient_medication_logs` (`patient_id`,`medication_id`,`log_date`);
