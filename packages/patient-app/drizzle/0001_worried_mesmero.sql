CREATE TABLE `emergency_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`sort_order` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`relationship` text,
	`phone` text NOT NULL,
	`email` text,
	`address` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `health_declarations` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`detail` text,
	`onset_date` text,
	`treating_physician` text,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `patients` ADD `clerk_user_id` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `middle_name` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `suffix` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `sex` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `civil_status` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `blood_type` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `nationality` text DEFAULT 'Filipino';--> statement-breakpoint
ALTER TABLE `patients` ADD `religion` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `philheath_id` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `server_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `patients_clerk_user_id_unique` ON `patients` (`clerk_user_id`);