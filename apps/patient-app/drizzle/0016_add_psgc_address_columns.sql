ALTER TABLE `patient_addresses` ADD `region_psgc` text;--> statement-breakpoint
ALTER TABLE `patient_addresses` ADD `province_psgc` text;--> statement-breakpoint
ALTER TABLE `patient_addresses` ADD `city_municipality_psgc` text;--> statement-breakpoint
ALTER TABLE `patient_addresses` ADD `barangay_psgc` text;--> statement-breakpoint
ALTER TABLE `patient_addresses` ADD `region_name` text;--> statement-breakpoint
ALTER TABLE `patient_addresses` ADD `province_name` text;--> statement-breakpoint
ALTER TABLE `patient_addresses` ADD `city_municipality_name` text;--> statement-breakpoint
ALTER TABLE `patient_addresses` ADD `barangay_name` text;--> statement-breakpoint
ALTER TABLE `patient_addresses` ADD `is_same_as_permanent` integer DEFAULT false;
