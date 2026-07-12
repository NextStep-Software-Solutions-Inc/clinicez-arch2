CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`logo_url` text,
	`address_hint` text,
	`is_public` integer DEFAULT true NOT NULL,
	`invite_code` text,
	`privacy_policy_url` text NOT NULL,
	`terms_and_conditions_url` text NOT NULL,
	`roles_json` text NOT NULL,
	`required_share_fields_json` text NOT NULL,
	`featured_score` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `organization_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`role_id` text NOT NULL,
	`role_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`consent_privacy_policy` integer DEFAULT false NOT NULL,
	`consent_terms_and_conditions` integer DEFAULT false NOT NULL,
	`consent_data_sharing` integer DEFAULT false NOT NULL,
	`consented_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `clinic_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`consent_privacy_policy` integer DEFAULT false NOT NULL,
	`consent_terms_and_conditions` integer DEFAULT false NOT NULL,
	`consent_data_sharing` integer DEFAULT false NOT NULL,
	`consented_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	`server_id` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `clinic_organization_links` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`relation_type` text DEFAULT 'partnered' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `booking_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`clinic_id` text NOT NULL,
	`organization_id` text,
	`preferred_date` text,
	`preferred_time` text,
	`reason` text,
	`notes` text,
	`share_fields_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `clinics` ADD `description` text;--> statement-breakpoint
ALTER TABLE `clinics` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `clinics` ADD `is_public` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `supports_appointments` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `privacy_policy_url` text;--> statement-breakpoint
ALTER TABLE `clinics` ADD `terms_and_conditions_url` text;--> statement-breakpoint
ALTER TABLE `clinics` ADD `specialties_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinics` ADD `required_share_fields_json` text DEFAULT '[]' NOT NULL;