ALTER TABLE `patient_government_ids` ADD `sponsor_pin` text;--> statement-breakpoint
ALTER TABLE `patient_government_ids` ADD `sponsor_last_name` text;--> statement-breakpoint
ALTER TABLE `patient_government_ids` ADD `sponsor_first_name` text;--> statement-breakpoint
ALTER TABLE `patient_government_ids` ADD `sponsor_middle_name` text;--> statement-breakpoint
ALTER TABLE `patient_government_ids` ADD `sponsor_suffix` text;--> statement-breakpoint
ALTER TABLE `patient_government_ids` ADD `sponsor_dob` text;--> statement-breakpoint
ALTER TABLE `patient_government_ids` ADD `sponsor_relationship` text;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `is_philhealth_gamot` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `philhealth_drug_code` text;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `unique_prescription_security_code` text;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `gamot_coverage_amount` real;