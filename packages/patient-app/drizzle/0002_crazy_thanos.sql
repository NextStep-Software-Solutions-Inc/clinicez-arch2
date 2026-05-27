CREATE TABLE `patient_immunization` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`child_immcode` text,
	`youngw_immcode` text,
	`pregw_immcode` text,
	`elderly_immcode` text,
	`other_imm` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_immunization_patient_id_unique` ON `patient_immunization` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_menstrual_history` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`is_applicable` text,
	`menarche_period` real,
	`last_mens_period` text,
	`period_duration` real,
	`mens_interval` real,
	`pads_per_day` real,
	`onset_sex_ic` real,
	`birth_ctrl_method` text,
	`is_menopause` text,
	`menopause_age` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_menstrual_history_patient_id_unique` ON `patient_menstrual_history` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_social_history` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`is_smoker` text,
	`no_cigpk` real,
	`is_adrinker` text,
	`no_bottles` real,
	`ill_drug_user` text,
	`is_sexually_active` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_social_history_patient_id_unique` ON `patient_social_history` (`patient_id`);--> statement-breakpoint
CREATE TABLE `philhealth_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`patient_type` text,
	`mem_pin` text,
	`eff_year` text,
	`atc` text,
	`is_walked_in` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `philhealth_profiles_patient_id_unique` ON `philhealth_profiles` (`patient_id`);