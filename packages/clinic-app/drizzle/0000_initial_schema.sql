CREATE TABLE `appointment_types` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text NOT NULL,
	`description` text,
	`duration` integer NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointment_types_tenant_name_uidx` ON `appointment_types` (`tenantId`,`name`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`patientId` text NOT NULL,
	`providerId` text NOT NULL,
	`serviceId` text NOT NULL,
	`appointmentTypeId` text NOT NULL,
	`subject` text,
	`startTime` text NOT NULL,
	`endTime` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`recurring` integer DEFAULT false,
	`receivedAt` text NOT NULL,
	`receivedByStaffId` text NOT NULL,
	`rejectedAt` text,
	`rejectedByStaffId` text,
	`rejectedReason` text,
	`completedAt` text,
	`completedByStaffId` text,
	`rescheduledAt` text,
	`rescheduledByStaffId` text,
	`rescheduledReason` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`providerId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`serviceId`,`tenantId`) REFERENCES `services`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointmentTypeId`,`tenantId`) REFERENCES `appointment_types`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`receivedByStaffId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rejectedByStaffId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`completedByStaffId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rescheduledByStaffId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "check_start_time" CHECK("appointments"."startTime" LIKE '____-__-__T__:__:__%'),
	CONSTRAINT "check_end_time" CHECK("appointments"."endTime" LIKE '____-__-__T__:__:__%'),
	CONSTRAINT "check_received_at" CHECK("appointments"."receivedAt" LIKE '____-__-__T__:__:__%'),
	CONSTRAINT "check_rejected_at" CHECK("appointments"."rejectedAt" LIKE '____-__-__T__:__:__%' OR "appointments"."rejectedAt" IS NULL),
	CONSTRAINT "check_completed_at" CHECK("appointments"."completedAt" LIKE '____-__-__T__:__:__%' OR "appointments"."completedAt" IS NULL),
	CONSTRAINT "check_rescheduled_at" CHECK("appointments"."rescheduledAt" LIKE '____-__-__T__:__:__%' OR "appointments"."rescheduledAt" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `basic_info` (
	`firstName` text NOT NULL,
	`middleName` text,
	`lastName` text NOT NULL,
	`suffix` text,
	`nickname` text,
	`email` text NOT NULL,
	`phoneNumber` text NOT NULL,
	`gender` text,
	`civilStatus` text,
	`dateOfBirth` text,
	`nationality` text,
	`religion` text,
	`bloodType` text,
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "check_date_of_birth" CHECK("basic_info"."dateOfBirth" LIKE '____-__-__' OR "basic_info"."dateOfBirth" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `basic_info_tenant_email_uidx` ON `basic_info` (`tenantId`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `basic_info_tenant_phone_uidx` ON `basic_info` (`tenantId`,`phoneNumber`);--> statement-breakpoint
CREATE TABLE `billers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text NOT NULL,
	`description` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billers_tenant_name_uidx` ON `billers` (`tenantId`,`name`);--> statement-breakpoint
CREATE TABLE `clinics` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text NOT NULL,
	`description` text,
	`address` text NOT NULL,
	`phoneNumber` text NOT NULL,
	`email` text NOT NULL,
	`logoUrl` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinics_tenant_name_uidx` ON `clinics` (`tenantId`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `clinics_tenant_email_uidx` ON `clinics` (`tenantId`,`email`);--> statement-breakpoint
CREATE TABLE `conditions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text NOT NULL,
	`description` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conditions_tenant_name_uidx` ON `conditions` (`tenantId`,`name`);--> statement-breakpoint
CREATE TABLE `consultation_hp` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`consultationId` text NOT NULL,
	`providerId` text NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consultationId`,`tenantId`) REFERENCES `consultations`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`providerId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consultation_hp_tenant_consultation_provider_uidx` ON `consultation_hp` (`tenantId`,`consultationId`,`providerId`);--> statement-breakpoint
CREATE TABLE `consultations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`appointmentId` text NOT NULL,
	`patientId` text NOT NULL,
	`patientVitalRecordId` text NOT NULL,
	`consultationDate` text NOT NULL,
	`notes` text,
	`reasonForVisit` text,
	`initialDiagnosis` text,
	`status` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appointmentId`,`tenantId`) REFERENCES `appointments`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patientVitalRecordId`,`tenantId`) REFERENCES `patient_vital_records`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "check_consultation_date" CHECK("consultations"."consultationDate" LIKE '____-__-__T__:__:__%')
);
--> statement-breakpoint
CREATE TABLE `emergency_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`patientId` text NOT NULL,
	`name` text NOT NULL,
	`relationship` text NOT NULL,
	`phoneNumber` text NOT NULL,
	`type` text NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `file_types` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text NOT NULL,
	`description` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_types_tenant_name_uidx` ON `file_types` (`tenantId`,`name`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`folderId` text NOT NULL,
	`name` text NOT NULL,
	`fileTypeId` text NOT NULL,
	`url` text NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`folderId`,`tenantId`) REFERENCES `folders`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fileTypeId`,`tenantId`) REFERENCES `file_types`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `healthcare_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`about` text,
	`specialties` text,
	`licenseNumber` text NOT NULL,
	`licenseIssuedDate` text NOT NULL,
	`licenseExpiryDate` text NOT NULL,
	`ptrNumber` text NOT NULL,
	`taxNumber` text NOT NULL,
	`fieldOfStudy` text,
	`status` text DEFAULT 'ACTIVE',
	`fileUrl` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "check_license_issued_date" CHECK("healthcare_providers"."licenseIssuedDate" LIKE '____-__-__'),
	CONSTRAINT "check_license_expiry_date" CHECK("healthcare_providers"."licenseExpiryDate" LIKE '____-__-__')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `healthcare_providers_tenant_license_uidx` ON `healthcare_providers` (`tenantId`,`licenseNumber`);--> statement-breakpoint
CREATE UNIQUE INDEX `healthcare_providers_tenant_ptr_uidx` ON `healthcare_providers` (`tenantId`,`ptrNumber`);--> statement-breakpoint
CREATE UNIQUE INDEX `healthcare_providers_tenant_tax_uidx` ON `healthcare_providers` (`tenantId`,`taxNumber`);--> statement-breakpoint
CREATE TABLE `hp_availabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`providerId` text NOT NULL,
	`date` text NOT NULL,
	`day` text NOT NULL,
	`startTime` text NOT NULL,
	`endTime` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`breakStartTime` text,
	`breakEndTime` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`providerId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "check_date" CHECK("hp_availabilities"."date" LIKE '____-__-__'),
	CONSTRAINT "check_start_time" CHECK("hp_availabilities"."startTime" LIKE '__:__'),
	CONSTRAINT "check_end_time" CHECK("hp_availabilities"."endTime" LIKE '__:__'),
	CONSTRAINT "check_break_start_time" CHECK("hp_availabilities"."breakStartTime" LIKE '__:__' OR "hp_availabilities"."breakStartTime" IS NULL),
	CONSTRAINT "check_break_end_time" CHECK("hp_availabilities"."breakEndTime" LIKE '__:__' OR "hp_availabilities"."breakEndTime" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `imaging_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`providerId` text NOT NULL,
	`patientId` text NOT NULL,
	`consultationId` text NOT NULL,
	`clinicId` text NOT NULL,
	`templateId` text NOT NULL,
	`issuedDate` text NOT NULL,
	`type` text NOT NULL,
	`bodyPart` text NOT NULL,
	`indication` text,
	`status` text,
	`notes` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`providerId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`consultationId`,`tenantId`) REFERENCES `consultations`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinicId`,`tenantId`) REFERENCES `clinics`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`templateId`,`tenantId`) REFERENCES `templates`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "check_issued_date" CHECK("imaging_requests"."issuedDate" LIKE '____-__-__')
);
--> statement-breakpoint
CREATE TABLE `laboratory_request_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`laboratoryRequestId` text NOT NULL,
	`testCatalogId` text NOT NULL,
	`status` text,
	`results` text,
	`remarks` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`laboratoryRequestId`,`tenantId`) REFERENCES `laboratory_requests`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`testCatalogId`,`tenantId`) REFERENCES `laboratory_test_catalogs`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `laboratory_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`providerId` text NOT NULL,
	`patientId` text NOT NULL,
	`consultationId` text NOT NULL,
	`clinicId` text NOT NULL,
	`templateId` text NOT NULL,
	`issuedDate` text NOT NULL,
	`status` text,
	`notes` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`providerId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`consultationId`,`tenantId`) REFERENCES `consultations`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinicId`,`tenantId`) REFERENCES `clinics`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`templateId`,`tenantId`) REFERENCES `templates`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "check_issued_date" CHECK("laboratory_requests"."issuedDate" LIKE '____-__-__')
);
--> statement-breakpoint
CREATE TABLE `laboratory_test_catalogs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`sampleType` text NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `medical_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`providerId` text NOT NULL,
	`patientId` text NOT NULL,
	`consultationId` text NOT NULL,
	`clinicId` text NOT NULL,
	`templateId` text NOT NULL,
	`classification` text NOT NULL,
	`purpose` text NOT NULL,
	`issuedDate` text NOT NULL,
	`notes` text,
	`status` text,
	`diagnosis` text,
	`remarks` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`providerId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`consultationId`,`tenantId`) REFERENCES `consultations`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinicId`,`tenantId`) REFERENCES `clinics`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`templateId`,`tenantId`) REFERENCES `templates`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "check_issued_date" CHECK("medical_certificates"."issuedDate" LIKE '____-__-__')
);
--> statement-breakpoint
CREATE TABLE `medical_record_histories` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`patientId` text NOT NULL,
	`conditionId` text NOT NULL,
	`relationToPatient` text,
	`category` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conditionId`,`tenantId`) REFERENCES `conditions`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `medications` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`patientId` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`dosage` text,
	`form` text,
	`frequency` text,
	`startDate` text NOT NULL,
	`endDate` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "check_start_date" CHECK("medications"."startDate" LIKE '____-__-__'),
	CONSTRAINT "check_end_date" CHECK("medications"."endDate" LIKE '____-__-__' OR "medications"."endDate" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `patient_conditions` (
	`tenantId` text NOT NULL,
	`patientId` text NOT NULL,
	`conditionId` text NOT NULL,
	`diagnosedDate` text NOT NULL,
	`diagnosedBy` text NOT NULL,
	`description` text,
	`severity` text,
	`notes` text,
	`isInborn` integer DEFAULT false NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	PRIMARY KEY(`tenantId`, `patientId`, `conditionId`),
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conditionId`,`tenantId`) REFERENCES `conditions`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "check_diagnosed_date" CHECK("patient_conditions"."diagnosedDate" LIKE '____-__-__'),
	CONSTRAINT "deleted_at_check" CHECK("patient_conditions"."deletedAt" LIKE '____-__-__T__:__:__%' OR "patient_conditions"."deletedAt" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `patient_vital_records` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`patientId` text NOT NULL,
	`providerId` text NOT NULL,
	`recordedAt` text NOT NULL,
	`temperature` text NOT NULL,
	`height` text NOT NULL,
	`weight` text NOT NULL,
	`bmi` text NOT NULL,
	`heartRate` integer NOT NULL,
	`respiratoryRate` integer NOT NULL,
	`oxygenSaturation` text NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`providerId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "check_recorded_at" CHECK("patient_vital_records"."recordedAt" LIKE '____-__-__T__:__:__%')
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`basicInfo` text NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`basicInfo`,`tenantId`) REFERENCES `basic_info`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `prescription_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`prescriptionId` text NOT NULL,
	`drugName` text NOT NULL,
	`dosage` text NOT NULL,
	`frequency` text NOT NULL,
	`duration` text NOT NULL,
	`unit` text NOT NULL,
	`instructions` text,
	`isGenericAllowed` integer DEFAULT true,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prescriptionId`,`tenantId`) REFERENCES `prescriptions`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`providerId` text NOT NULL,
	`patientId` text NOT NULL,
	`consultationId` text NOT NULL,
	`clinicId` text NOT NULL,
	`templateId` text NOT NULL,
	`name` text,
	`remarks` text,
	`issuedDate` text NOT NULL,
	`instructions` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`providerId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`consultationId`,`tenantId`) REFERENCES `consultations`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinicId`,`tenantId`) REFERENCES `clinics`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`templateId`,`tenantId`) REFERENCES `templates`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "check_issued_date" CHECK("prescriptions"."issuedDate" LIKE '____-__-__')
);
--> statement-breakpoint
CREATE TABLE `referral_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`providerId` text NOT NULL,
	`patientId` text NOT NULL,
	`consultationId` text NOT NULL,
	`clinicId` text NOT NULL,
	`templateId` text NOT NULL,
	`issuedDate` text NOT NULL,
	`referredTo` text NOT NULL,
	`reason` text NOT NULL,
	`status` text,
	`briefHistory` text,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`providerId`,`tenantId`) REFERENCES `healthcare_providers`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patientId`,`tenantId`) REFERENCES `patients`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`consultationId`,`tenantId`) REFERENCES `consultations`(`id`,`tenantId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clinicId`,`tenantId`) REFERENCES `clinics`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`templateId`,`tenantId`) REFERENCES `templates`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "check_issued_date" CHECK("referral_requests"."issuedDate" LIKE '____-__-__')
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`tenantId` text NOT NULL,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`billerId` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cost` text NOT NULL,
	`duration` integer,
	`isActive` integer DEFAULT true,
	FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`billerId`,`tenantId`) REFERENCES `billers`(`id`,`tenantId`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_tenant_name_uidx` ON `services` (`tenantId`,`name`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_name_unique` ON `tenants` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`authUserId` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_authUserId_unique` ON `users` (`authUserId`);