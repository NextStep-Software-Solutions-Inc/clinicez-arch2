CREATE TABLE `patient_ncd_questionnaire` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`qid1_yn` text,
	`qid2_yn` text,
	`qid3_yn` text,
	`qid4_yn` text,
	`qid5_ynx` text,
	`qid6_yn` text,
	`qid7_yn` text,
	`qid8_yn` text,
	`qid9_yn` text,
	`qid10_yn` text,
	`qid11_yn` text,
	`qid12_yn` text,
	`qid13_yn` text,
	`qid14_yn` text,
	`qid15_yn` text,
	`qid16_yn` text,
	`qid17_abcde` text,
	`qid18_yn` text,
	`qid19_yn` text,
	`qid19_fbs_mgdl` real,
	`qid19_fbs_mmol` real,
	`qid19_fbs_date` text,
	`qid20_yn` text,
	`qid20_chole_val` real,
	`qid20_chole_date` text,
	`qid21_yn` text,
	`qid21_keton_val` real,
	`qid21_keton_date` text,
	`qid22_yn` text,
	`qid22_protein_val` real,
	`qid22_protein_date` text,
	`qid23_yn` text,
	`qid24_yn` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_ncd_questionnaire_patient_id_unique` ON `patient_ncd_questionnaire` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_physical_exam_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text,
	`exam_date` text NOT NULL,
	`gen_survey_id` text,
	`gen_survey_rem` text,
	`skin_rem` text,
	`heent_rem` text,
	`chest_rem` text,
	`heart_rem` text,
	`abdomen_rem` text,
	`neuro_rem` text,
	`rectal_rem` text,
	`gu_rem` text,
	`skin_id` text,
	`heent_id` text,
	`chest_id` text,
	`heart_id` text,
	`abdomen_id` text,
	`neuro_id` text,
	`gu_id` text,
	`rectal_id` text,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `patients` ADD `consent_to_share_info` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `patient_immunizations_self` ADD `immunization_category` text;--> statement-breakpoint
ALTER TABLE `patient_social_history` ADD `is_sexually_active` integer;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `pads_per_day` integer;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `age_at_onset_sexual_activity` integer;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `current_contraceptive_method` text;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `menstruation_applicable` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `delivery_cnt` integer;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `delivery_type` text;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `full_term_deliveries` integer;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `premature_deliveries` integer;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `pregnancy_induced_hypertension` integer;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `on_family_planning` integer;--> statement-breakpoint
ALTER TABLE `patient_obstetric_profile` ADD `pregnancy_applicable` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `vital_signs` ADD `z_score` real;--> statement-breakpoint
ALTER TABLE `vital_signs` ADD `left_vision_acuity` text;--> statement-breakpoint
ALTER TABLE `vital_signs` ADD `right_vision_acuity` text;--> statement-breakpoint
ALTER TABLE `vital_signs` ADD `body_length_cm` real;--> statement-breakpoint
ALTER TABLE `vital_signs` ADD `skinfold_thickness_mm` real;--> statement-breakpoint
ALTER TABLE `vital_signs` ADD `mid_upper_arm_circ_cm` real;--> statement-breakpoint
ALTER TABLE `vital_signs` ADD `limb_measurements` text;