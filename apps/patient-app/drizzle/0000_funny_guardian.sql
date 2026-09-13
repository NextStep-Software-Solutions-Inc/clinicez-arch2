CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text,
	`first_name` text NOT NULL,
	`middle_name` text,
	`last_name` text NOT NULL,
	`suffix` text,
	`sex` text,
	`dob` text,
	`place_of_birth` text,
	`civil_status` text,
	`blood_type` text,
	`nationality` text DEFAULT 'Filipino',
	`ethnicity` text,
	`religion` text,
	`primary_language` text,
	`education_level` text,
	`avatar_url` text,
	`mobile` text,
	`alt_phone` text,
	`email` text,
	`messenger_handle` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patients_clerk_user_id_unique` ON `patients` (`clerk_user_id`);--> statement-breakpoint
CREATE TABLE `patient_government_ids` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`philhealth_id` text,
	`philhealth_category` text,
	`sss_number` text,
	`gsis_number` text,
	`pagibig_id` text,
	`tin` text,
	`senior_citizen_id` text,
	`is_pwd` integer DEFAULT false,
	`pwd_id_number` text,
	`disability_type` text,
	`hmo_provider` text,
	`hmo_policy_number` text,
	`hmo_plan_type` text,
	`hmo_coverage_start` text,
	`hmo_coverage_end` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_government_ids_patient_id_unique` ON `patient_government_ids` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`type` text DEFAULT 'primary' NOT NULL,
	`house_street` text,
	`barangay` text,
	`city_municipality` text,
	`province` text,
	`region` text,
	`zip_code` text,
	`country` text DEFAULT 'Philippines',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `emergency_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`sort_order` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`relationship` text,
	`phone` text NOT NULL,
	`alt_phone` text,
	`email` text,
	`address` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_healthcare_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`provider_type` text NOT NULL,
	`name` text,
	`specialty` text,
	`clinic_hospital` text,
	`phone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_allergies` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`allergen` text NOT NULL,
	`reaction_type` text,
	`severity` text,
	`management` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_medications` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`drug_name` text NOT NULL,
	`dosage` text,
	`dosage_form` text,
	`frequency` text,
	`prescribing_physician` text,
	`start_date` text,
	`indication` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_surgical_history` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`procedure` text NOT NULL,
	`surgeon` text,
	`facility` text,
	`date` text,
	`anesthesia_type` text,
	`complications` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_past_illnesses` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`diagnosis` text NOT NULL,
	`duration` text,
	`complications` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_chronic_conditions` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`diagnosis` text NOT NULL,
	`control_status` text,
	`monitoring_frequency` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_disabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`body_part` text,
	`classification` text,
	`is_pwd_certified` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_immunizations_self` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`vaccine_name` text NOT NULL,
	`dose_number` text,
	`lot_number` text,
	`date` text,
	`administered_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_social_history` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`tobacco_status` text,
	`cigs_per_day` integer,
	`pack_years` real,
	`quit_date` text,
	`other_tobacco_products` text,
	`alcohol_use_level` text,
	`alcohol_type` text,
	`alcohol_frequency_days_per_week` integer,
	`alcohol_quantity_per_occasion` integer,
	`substance_use` integer DEFAULT false,
	`substance_name` text,
	`substance_route` text,
	`substance_frequency` text,
	`activity_level` text,
	`exercise_type` text,
	`exercise_frequency_days_per_week` integer,
	`diet_pattern` text,
	`food_restrictions` text,
	`sleep_avg_hours` real,
	`sleep_quality` text,
	`water_intake` text,
	`caffeine_use` text,
	`daily_screen_time` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_social_history_patient_id_unique` ON `patient_social_history` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_family_history` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`condition` text NOT NULL,
	`affected_relative` text,
	`side` text,
	`age_of_onset` integer,
	`is_deceased` integer DEFAULT false,
	`age_at_death` integer,
	`cause_of_death` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_occupation` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`occupation` text,
	`employer` text,
	`industry` text,
	`work_environment` text,
	`years_in_occupation` integer,
	`hazard_exposure` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_occupation_patient_id_unique` ON `patient_occupation` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_travel_history` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`destination` text NOT NULL,
	`city_province` text,
	`departure_date` text,
	`return_date` text,
	`purpose` text,
	`illness_during_after_travel` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_obstetric_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`age_at_menarche` integer,
	`cycle_length` integer,
	`cycle_duration` integer,
	`regularity` text,
	`dysmenorrhea_severity` text,
	`menopausal_status` text,
	`age_at_menopause` integer,
	`gravida` integer,
	`para` integer,
	`abortion` integer,
	`living_children` integer,
	`lmp` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_obstetric_profile_patient_id_unique` ON `patient_obstetric_profile` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_pregnancies` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`year` integer,
	`outcome` text,
	`gestational_age_weeks` integer,
	`delivery_type` text,
	`birth_weight_kg` real,
	`complications` text,
	`facility` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_contraceptive_history` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`method` text NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`date_started` text,
	`reason_for_stopping` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `patient_male_reproductive` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`has_vasectomy` integer DEFAULT false,
	`vasectomy_date` text,
	`conditions` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_male_reproductive_patient_id_unique` ON `patient_male_reproductive` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_dental_vision` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`dentist_name` text,
	`dentist_clinic` text,
	`orthodontic_device` text,
	`eye_doctor_name` text,
	`corrective_lenses` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_dental_vision_patient_id_unique` ON `patient_dental_vision` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patient_mental_health_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`has_prior_diagnosis` integer DEFAULT false,
	`provider_name` text,
	`provider_specialty` text,
	`provider_clinic` text,
	`psychotherapy_status` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patient_mental_health_profile_patient_id_unique` ON `patient_mental_health_profile` (`patient_id`);--> statement-breakpoint
CREATE TABLE `clinics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`base_url` text NOT NULL,
	`invite_code` text,
	`joined_at` integer NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `files_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`size_bytes` integer,
	`server_url` text,
	`local_path` text,
	`created_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vital_signs` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text,
	`measured_at` text NOT NULL,
	`height_cm` real,
	`weight_kg` real,
	`bmi` real,
	`temperature_celsius` real,
	`bp_systolic` integer,
	`bp_diastolic` integer,
	`heart_rate_bpm` integer,
	`respiratory_rate` integer,
	`spo2_percent` real,
	`fasting_blood_glucose` real,
	`waist_cm` real,
	`hip_cm` real,
	`head_circumference_cm` real,
	`taken_by` text,
	`facility` text,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `consultations` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text,
	`visit_date` text NOT NULL,
	`visit_type` text,
	`clinic_name` text,
	`doctor_name` text,
	`doctor_specialty` text,
	`chief_complaint` text,
	`primary_diagnosis` text,
	`icd10_code` text,
	`secondary_diagnoses` text,
	`soap_notes` text,
	`treatment_plan` text,
	`follow_up_instructions` text,
	`follow_up_date` text,
	`referral_issued` text,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text,
	`drug_name` text NOT NULL,
	`generic_name` text,
	`dosage` text,
	`dosage_form` text,
	`frequency` text,
	`route` text,
	`duration` text,
	`indication` text,
	`start_date` text,
	`end_date` text,
	`prescribing_physician` text,
	`refills_allowed` integer,
	`special_instructions` text,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lab_results` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text,
	`test_name` text NOT NULL,
	`component_parameter` text,
	`result_value` text,
	`unit` text,
	`reference_range` text,
	`flag` text,
	`date_ordered` text,
	`date_resulted` text,
	`ordering_physician` text,
	`laboratory` text,
	`file_attachment_id` text,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_attachment_id`) REFERENCES `files_metadata`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `imaging_results` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text,
	`imaging_type` text NOT NULL,
	`body_part` text,
	`exam_date` text NOT NULL,
	`ordering_physician` text,
	`radiologist` text,
	`findings` text,
	`impression` text,
	`recommendation` text,
	`file_attachment_id` text,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_attachment_id`) REFERENCES `files_metadata`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vaccinations_administered` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text,
	`vaccine_name` text NOT NULL,
	`disease_targeted` text,
	`dose_number` text,
	`date_administered` text NOT NULL,
	`lot_batch_number` text,
	`administered_by` text,
	`facility` text,
	`route` text,
	`injection_site` text,
	`next_due_date` text,
	`adverse_reaction` text,
	`adverse_reaction_description` text,
	`vaccine_program` text,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clinical_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text,
	`assessment_type` text NOT NULL,
	`date` text NOT NULL,
	`assessed_by` text,
	`scores_json` text,
	`findings_json` text,
	`synced_at` integer,
	`server_id` text,
	`server_created_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`level` text NOT NULL,
	`category` text NOT NULL,
	`action` text NOT NULL,
	`details_json` text,
	`created_at` integer NOT NULL
);
