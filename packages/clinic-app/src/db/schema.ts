import { sql } from "drizzle-orm";
import { sqliteTable, text, check, primaryKey, integer, uniqueIndex, foreignKey } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";
import { baseEntity } from "./columns.helper";

export const users = sqliteTable("users", {
  id: text().$defaultFn(() => uuidv7()).primaryKey(),
  authUserId: text().notNull().unique(), // universal unique identifier from Keycloak (since we will be moving to Keycloak later)
  // TODO: Need clarification if users table should also have basic info fields.
});

export const tenants = sqliteTable("tenants", {
  id: text().$defaultFn(() => uuidv7()).primaryKey(),
  name: text().notNull().unique(),
  description: text(),
});

export const basicInfo = sqliteTable("basic_info", {
  firstName: text().notNull(),
  middleName: text(),
  lastName: text().notNull(),
  suffix: text(),
  nickname: text(),
  email: text().notNull(),
  phoneNumber: text().notNull(),
  gender: text({ enum: ["MALE", "FEMALE"] }),
  civilStatus: text({ enum: ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "SEPARATED"] }),
  dateOfBirth: text(),
  nationality: text(),
  religion: text(),
  bloodType: text(),
  ...baseEntity
}, (t) => [
  check("check_date_of_birth", sql`${t.dateOfBirth} LIKE '____-__-__' OR ${t.dateOfBirth} IS NULL`),
  uniqueIndex("basic_info_tenant_email_uidx").on(t.tenantId, t.email),
  uniqueIndex("basic_info_tenant_phone_uidx").on(t.tenantId, t.phoneNumber),
]);

export const billers = sqliteTable("billers", {
  ...baseEntity,
  name: text().notNull(),
  description: text(),
}, (t) => [
  uniqueIndex("billers_tenant_name_uidx").on(t.tenantId, t.name),
]);

export const services = sqliteTable("services", {
  ...baseEntity,
  billerId: text().notNull(),
  // TODO: Need clarifications with the team if category is enum or text
  name: text().notNull(),
  description: text(),
  // Why on earth does SQLite not have a decimal type???
  cost: text().notNull(), // stored as decimal string; reference src/utils/numeric-conversion.ts
  // TODO: Need clarification with the team if duration is integer or float
  duration: integer(), // duration in hours
  isActive: integer({ mode: "boolean" }).default(true),
}, (t) => [
  foreignKey({
    columns: [t.billerId, t.tenantId],
    foreignColumns: [billers.id, billers.tenantId],
  }).onDelete("restrict"),
  uniqueIndex("services_tenant_name_uidx").on(t.tenantId, t.name),
]);

export const clinics = sqliteTable("clinics", {
  ...baseEntity,
  name: text().notNull(),
  description: text(),
  address: text().notNull(),
  phoneNumber: text().notNull(),
  email: text().notNull(),
  logoUrl: text(),
}, (t) => [
  uniqueIndex("clinics_tenant_name_uidx").on(t.tenantId, t.name),
  uniqueIndex("clinics_tenant_email_uidx").on(t.tenantId, t.email),
]);

export const healthcareProviders = sqliteTable("healthcare_providers", {
  ...baseEntity,
  // TODO: Clinic ID seems to be missing in the ERD. Need clarification with the team.
  // clinicId: text().notNull().references(() => clinics.id),
  userId: text().notNull().references(() => users.id),
  // TODO: Need clarification as well for the basic info fields.
  type: text().notNull(), // e.g., Doctor, Nurse, Therapist
  about: text(),
  specialties: text(), // comma-separated list of specialties
  // TODO: Need clarification if the credential field is a file upload or text so I can set it as text or blob.
  licenseNumber: text().notNull(),
  licenseIssuedDate: text().notNull(),
  licenseExpiryDate: text().notNull(),
  ptrNumber: text().notNull(),
  taxNumber: text().notNull(),
  fieldOfStudy: text(), // e.g., Medicine, Nursing
  status: text({ enum: ["ACTIVE", "INACTIVE", "SUSPENDED"] }).default("ACTIVE"),
  fileUrl: text(), // URL to the uploaded credential file
}, (t) => [
  check("check_license_issued_date", sql`${t.licenseIssuedDate} LIKE '____-__-__'`),
  check("check_license_expiry_date", sql`${t.licenseExpiryDate} LIKE '____-__-__'`),
  uniqueIndex("healthcare_providers_tenant_license_uidx").on(t.tenantId, t.licenseNumber),
  uniqueIndex("healthcare_providers_tenant_ptr_uidx").on(t.tenantId, t.ptrNumber),
  uniqueIndex("healthcare_providers_tenant_tax_uidx").on(t.tenantId, t.taxNumber),
]);

export const hpAvailabilities = sqliteTable("hp_availabilities", {
  ...baseEntity,
  providerId: text().notNull(),
  date: text().notNull(), // YYYY-MM-DD
  day: text().notNull(), // e.g., MONDAY, TUESDAY
  startTime: text().notNull(), // HH:MM format
  endTime: text().notNull(),   // HH:MM format
  status: text().notNull(), // e.g., AVAILABLE, UNAVAILABLE, BOOKED, ONLEAVE, BLOCKED
  reason: text(), // reason for unavailability or blocking
  breakStartTime: text(), // HH:MM format
  breakEndTime: text(),   // HH:MM format
}, (t) => [
  check("check_date", sql`${t.date} LIKE '____-__-__'`),
  check("check_start_time", sql`${t.startTime} LIKE '__:__'`),
  check("check_end_time", sql`${t.endTime} LIKE '__:__'`),
  check("check_break_start_time", sql`${t.breakStartTime} LIKE '__:__' OR ${t.breakStartTime} IS NULL`),
  check("check_break_end_time", sql`${t.breakEndTime} LIKE '__:__' OR ${t.breakEndTime} IS NULL`),
  foreignKey({
    columns: [t.providerId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("cascade"),
]);

export const patients = sqliteTable("patients", {
  ...baseEntity,
  basicInfo: text().notNull(),
}, (t) => [
  foreignKey({
    columns: [t.basicInfo, t.tenantId],
    foreignColumns: [basicInfo.id, basicInfo.tenantId],
  }).onDelete("restrict"),
]);

export const appointmentTypes = sqliteTable("appointment_types", {
  ...baseEntity,
  name: text().notNull(),
  description: text(),
  duration: integer().notNull(), // duration in minutes
}, (t) => [
  uniqueIndex("appointment_types_tenant_name_uidx").on(t.tenantId, t.name),
]);

export const appointments = sqliteTable("appointments", {
  ...baseEntity,
  patientId: text().notNull(),
  providerId: text().notNull(),
  serviceId: text().notNull(),
  appointmentTypeId: text().notNull(),
  subject: text(),
  startTime: text().notNull(), // ISO 8601 format
  endTime: text().notNull(),
  status: text().notNull(), // e.g., Pending, Received, Completed, Rejected, Rescheduled
  notes: text(),
  recurring: integer({ mode: "boolean" }).default(false),
  receivedAt: text().notNull(), // receivedAt datetime
  receivedByStaffId: text().notNull(),
  rejectedAt: text(), // rejectedAt datetime
  rejectedByStaffId: text(),
  rejectedReason: text(),
  completedAt: text(), // completedAt datetime
  completedByStaffId: text(),
  rescheduledAt: text(), // rescheduledAt datetime
  rescheduledByStaffId: text(),
  rescheduledReason: text(),
}, (t) => [
  check("check_start_time", sql`${t.startTime} LIKE '____-__-__T__:__:__%'`),
  check("check_end_time", sql`${t.endTime} LIKE '____-__-__T__:__:__%'`),
  check("check_received_at", sql`${t.receivedAt} LIKE '____-__-__T__:__:__%'`),
  check("check_rejected_at", sql`${t.rejectedAt} LIKE '____-__-__T__:__:__%' OR ${t.rejectedAt} IS NULL`),
  check("check_completed_at", sql`${t.completedAt} LIKE '____-__-__T__:__:__%' OR ${t.completedAt} IS NULL`),
  check("check_rescheduled_at", sql`${t.rescheduledAt} LIKE '____-__-__T__:__:__%' OR ${t.rescheduledAt} IS NULL`),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.providerId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.serviceId, t.tenantId],
    foreignColumns: [services.id, services.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.appointmentTypeId, t.tenantId],
    foreignColumns: [appointmentTypes.id, appointmentTypes.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.receivedByStaffId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.rejectedByStaffId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("set null"),
  foreignKey({
    columns: [t.completedByStaffId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("set null"),
  foreignKey({
    columns: [t.rescheduledByStaffId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("set null"),
]);

export const consultations = sqliteTable("consultations", {
  ...baseEntity,
  appointmentId: text().notNull(),
  patientId: text().notNull(),
  patientVitalRecordId: text().notNull(), // latest vital record at the time of consultation
  // consultationDate datetime
  consultationDate: text().notNull(),
  notes: text(),
  reasonForVisit: text(),
  initialDiagnosis: text(), // preliminary diagnosis
  status: text(), // e.g., Open, Closed, Follow-up Required
}, (t) => [
  check("check_consultation_date", sql`${t.consultationDate} LIKE '____-__-__T__:__:__%'`),
  foreignKey({
    columns: [t.appointmentId, t.tenantId],
    foreignColumns: [appointments.id, appointments.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.patientVitalRecordId, t.tenantId],
    foreignColumns: [patientVitalRecords.id, patientVitalRecords.tenantId],
  }).onDelete("restrict"),
]);

/**
 * Consultation-HealthcareProvider many-to-many relationship table
 * to allow multiple healthcare providers to be involved in a single consultation.
 * The idea is that a consultation can have multiple providers (e.g., a doctor and a nurse)
 * and a healthcare provider can participate in multiple consultations.
 */
export const consultationHP = sqliteTable("consultation_hp", {
  ...baseEntity,
  consultationId: text().notNull(),
  providerId: text().notNull(),
}, (t) => [
  foreignKey({
    columns: [t.consultationId, t.tenantId],
    foreignColumns: [consultations.id, consultations.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.providerId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("cascade"),
  uniqueIndex("consultation_hp_tenant_consultation_provider_uidx").on(
    t.tenantId,
    t.consultationId,
    t.providerId,
  ),
]);

/**
 * Emergency contact information for a patient
 * has a column `type` to specify if the contact is a
 * primary or secondary contact
 */
export const emergencyContacts = sqliteTable("emergency_contacts", {
  ...baseEntity,
  patientId: text().notNull(),
  name: text().notNull(),
  relationship: text().notNull(),
  phoneNumber: text().notNull(),
  type: text({ enum: ["PRIMARY", "SECONDARY"] }).notNull(),
}, (t) => [
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("cascade"),
]);

export const patientVitalRecords = sqliteTable("patient_vital_records", {
  ...baseEntity,
  patientId: text().notNull(),
  providerId: text().notNull(),
  // recordedAt datetime
  recordedAt: text().notNull(),
  temperature: text().notNull(), // stored as decimal string; reference src/utils/numeric-conversion.ts
  height: text().notNull(), // stored as decimal string; reference src/utils/numeric-conversion.ts
  weight: text().notNull(), // stored as decimal string; reference src/utils/numeric-conversion.ts
  bmi: text().notNull(), // stored as decimal string; reference src/utils/numeric-conversion.ts
  // TODO: These are missing in the ERD but are necessary for vital records. I must consult the team.
  // bloodPressureSystolic: integer().notNull(),
  // bloodPressureDiastolic: integer().notNull(),
  heartRate: integer().notNull(), // also known as pulse rate
  respiratoryRate: integer().notNull(),
  oxygenSaturation: text().notNull(), // stored as decimal string; reference src/utils/numeric-conversion.ts; percentage
}, (t) => [
  check("check_recorded_at", sql`${t.recordedAt} LIKE '____-__-__T__:__:__%'`),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.providerId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("restrict"),
]);

// TODO: Allergies: Need to be consulted with the team for clarifications.
// export const allergies = sqliteTable("allergies", {
//   id: text().$defaultFn(() => uuidv7()).primaryKey(),
//   patientId: text().notNull().references(() => patients.id),

// });

export const conditions = sqliteTable("conditions", {
  ...baseEntity,
  name: text().notNull(),
  description: text(),
}, (t) => [
  uniqueIndex("conditions_tenant_name_uidx").on(t.tenantId, t.name),
]);

export const patientConditions = sqliteTable("patient_conditions", {
  tenantId: text().notNull(),
  patientId: text().notNull(),
  conditionId: text().notNull(),
  // TODO: Need clarification with the team for the type whether it's text or enum
  diagnosedDate: text().notNull(),
  diagnosedBy: text().notNull(),
  description: text(),
  severity: text(),
  notes: text(),
  isInborn: integer({ mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text().$defaultFn(() => new Date().toISOString()),
  updatedAt: text().$defaultFn(() => new Date().toISOString()),
  deletedAt: text(),
}, (t) => [
  primaryKey({ name: "pk_patient_conditions", columns: [t.tenantId, t.patientId, t.conditionId] }),
  check("check_diagnosed_date", sql`${t.diagnosedDate} LIKE '____-__-__'`),
  check("deleted_at_check", sql`${t.deletedAt} LIKE '____-__-__T__:__:__%' OR ${t.deletedAt} IS NULL`),
  foreignKey({
    columns: [t.tenantId],
    foreignColumns: [tenants.id],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.conditionId, t.tenantId],
    foreignColumns: [conditions.id, conditions.tenantId],
  }).onDelete("restrict"),
]);

export const medications = sqliteTable("medications", {
  ...baseEntity,
  patientId: text().notNull(),
  name: text().notNull(),
  description: text(),
  dosage: text(),
  form: text(), // e.g., tablet, capsule, syrup, injection
  frequency: text(), // e.g., once daily, twice daily
  // TODO: Need to clarify with the team if route is enum or text
  // route: text(), // e.g., oral, intravenous
  startDate: text().notNull(),
  endDate: text(), // nullable for ongoing medications
}, (t) => [
  // check if startDate and endDate follows the date format YYYY-MM-DD
  check("check_start_date", sql`${t.startDate} LIKE '____-__-__'`),
  check("check_end_date", sql`${t.endDate} LIKE '____-__-__' OR ${t.endDate} IS NULL`),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("cascade"),
]);

const templates = sqliteTable("templates", {
  ...baseEntity,
  clinicId: text().notNull(),
  name: text().notNull(),
  logoUrl: text(),
  header: text().notNull(),
  body: text().notNull(), // could be JSON or any structured format (e.g,. HTML, Markdown, etc.)
  footer: text().notNull(),
  isDefault: integer({ mode: "boolean" }).default(false),
}, (t) => [
  foreignKey({
    columns: [t.clinicId, t.tenantId],
    foreignColumns: [clinics.id, clinics.tenantId],
  }).onDelete("cascade"),
  uniqueIndex("templates_tenant_name_uidx").on(t.tenantId, t.name),
]);

// These are a set of medical documents in a table form.
// Prescription, Medical Certificate, Laboratory Request, Imaging Request, Referral Request etc.
export const prescriptions = sqliteTable("prescriptions", {
  ...baseEntity,
  providerId: text().notNull(),
  patientId: text().notNull(),
  consultationId: text().notNull(),
  clinicId: text().notNull(),
  templateId: text().notNull(),
  name: text(),
  remarks: text(),
  issuedDate: text().notNull(),
  instructions: text(),
}, (t) => [
  check("check_issued_date", sql`${t.issuedDate} LIKE '____-__-__'`),
  foreignKey({
    columns: [t.providerId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.consultationId, t.tenantId],
    foreignColumns: [consultations.id, consultations.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.clinicId, t.tenantId],
    foreignColumns: [clinics.id, clinics.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.templateId, t.tenantId],
    foreignColumns: [templates.id, templates.tenantId],
  }).onDelete("restrict"),
]);

export const prescriptionItems = sqliteTable("prescription_items", {
  ...baseEntity,
  prescriptionId: text().notNull(),
  drugName: text().notNull(),
  dosage: text().notNull(),
  frequency: text().notNull(),
  duration: text().notNull(),
  unit: text().notNull(), // e.g., mg, ml, tablets
  instructions: text(),
  isGenericAllowed: integer({ mode: "boolean" }).default(true),
}, (t) => [
  foreignKey({
    columns: [t.prescriptionId, t.tenantId],
    foreignColumns: [prescriptions.id, prescriptions.tenantId],
  }).onDelete("cascade"),
]);

export const medicalCertificate = sqliteTable("medical_certificates", {
  ...baseEntity,
  providerId: text().notNull(),
  patientId: text().notNull(),
  consultationId: text().notNull(),
  clinicId: text().notNull(),
  templateId: text().notNull(),
  classification: text().notNull(), // e.g., Sick Leave, Fitness to Work
  purpose: text().notNull(),
  issuedDate: text().notNull(),
  notes: text(),
  status: text(), // e.g., Active, Expired, Cancelled
  diagnosis: text(),
  remarks: text(),
}, (t) => [
  check("check_issued_date", sql`${t.issuedDate} LIKE '____-__-__'`),
  foreignKey({
    columns: [t.providerId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.consultationId, t.tenantId],
    foreignColumns: [consultations.id, consultations.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.clinicId, t.tenantId],
    foreignColumns: [clinics.id, clinics.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.templateId, t.tenantId],
    foreignColumns: [templates.id, templates.tenantId],
  }).onDelete("restrict"),
]);

export const laboratoryRequests = sqliteTable("laboratory_requests", {
  ...baseEntity,
  providerId: text().notNull(),
  patientId: text().notNull(),
  consultationId: text().notNull(),
  clinicId: text().notNull(),
  templateId: text().notNull(),
  issuedDate: text().notNull(),
  status: text(), // e.g., Pending, Completed, Cancelled
  notes: text(),
}, (t) => [
  check("check_issued_date", sql`${t.issuedDate} LIKE '____-__-__'`),
  foreignKey({
    columns: [t.providerId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.consultationId, t.tenantId],
    foreignColumns: [consultations.id, consultations.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.clinicId, t.tenantId],
    foreignColumns: [clinics.id, clinics.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.templateId, t.tenantId],
    foreignColumns: [templates.id, templates.tenantId],
  }).onDelete("restrict"),
]);

export const laboratoryTestCatalogs = sqliteTable("laboratory_test_catalogs", {
  ...baseEntity,
  category: text().notNull(), // e.g., Hematology, Biochemistry
  name: text().notNull(),
  sampleType: text().notNull(), // e.g., Blood, Urine
});

export const laboratoryRequestItems = sqliteTable("laboratory_request_items", {
  ...baseEntity,
  laboratoryRequestId: text().notNull(),
  testCatalogId: text().notNull(),
  status: text(), // e.g., Pending, In-Progress, Completed
  results: text(),
  remarks: text(),
}, (t) => [
  foreignKey({
    columns: [t.laboratoryRequestId, t.tenantId],
    foreignColumns: [laboratoryRequests.id, laboratoryRequests.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.testCatalogId, t.tenantId],
    foreignColumns: [laboratoryTestCatalogs.id, laboratoryTestCatalogs.tenantId],
  }).onDelete("restrict"),
]);

export const imagingRequests = sqliteTable("imaging_requests", {
  ...baseEntity,
  providerId: text().notNull(),
  patientId: text().notNull(),
  consultationId: text().notNull(),
  clinicId: text().notNull(),
  templateId: text().notNull(),
  issuedDate: text().notNull(),
  type: text().notNull(), // e.g., X-Ray, MRI, CT Scan
  bodyPart: text().notNull(), // e.g., Chest, Abdomen
  indication: text(), // reason for the imaging request
  status: text(), // e.g., Pending, Completed, Cancelled
  notes: text(),
}, (t) => [
  check("check_issued_date", sql`${t.issuedDate} LIKE '____-__-__'`),
  foreignKey({
    columns: [t.providerId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.consultationId, t.tenantId],
    foreignColumns: [consultations.id, consultations.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.clinicId, t.tenantId],
    foreignColumns: [clinics.id, clinics.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.templateId, t.tenantId],
    foreignColumns: [templates.id, templates.tenantId],
  }).onDelete("restrict"),
]);

export const referralRequests = sqliteTable("referral_requests", {
  ...baseEntity,
  providerId: text().notNull(),
  patientId: text().notNull(),
  consultationId: text().notNull(),
  clinicId: text().notNull(),
  templateId: text().notNull(),
  issuedDate: text().notNull(),
  referredTo: text().notNull(), // specialist or facility
  reason: text().notNull(),
  status: text(), // e.g., Pending, Completed, Cancelled
  briefHistory: text(),
}, (t) => [
  check("check_issued_date", sql`${t.issuedDate} LIKE '____-__-__'`),
  foreignKey({
    columns: [t.providerId, t.tenantId],
    foreignColumns: [healthcareProviders.id, healthcareProviders.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.consultationId, t.tenantId],
    foreignColumns: [consultations.id, consultations.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.clinicId, t.tenantId],
    foreignColumns: [clinics.id, clinics.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    columns: [t.templateId, t.tenantId],
    foreignColumns: [templates.id, templates.tenantId],
  }).onDelete("restrict"),
]);

export const medicalRecordHistories = sqliteTable("medical_record_histories", {
  ...baseEntity,
  patientId: text().notNull(),
  conditionId: text().notNull(),
  relationToPatient: text(),
  category: text().notNull(),
  notes: text(),
}, (t) => [
  foreignKey({
    columns: [t.patientId, t.tenantId],
    foreignColumns: [patients.id, patients.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.conditionId, t.tenantId],
    foreignColumns: [conditions.id, conditions.tenantId],
  }).onDelete("restrict"),
]);

// Files & Folders
export const folders = sqliteTable("folders", {
  ...baseEntity,
  name: text().notNull(),
});

export const fileTypes = sqliteTable("file_types", {
  ...baseEntity,
  name: text().notNull(), // e.g., image, document, pdf
  description: text(),
}, (t) => [
  uniqueIndex("file_types_tenant_name_uidx").on(t.tenantId, t.name),
]);

export const files = sqliteTable("files", {
  ...baseEntity,
  folderId: text().notNull(),
  name: text().notNull(),
  fileTypeId: text().notNull(),
  url: text().notNull(),
}, (t) => [
  foreignKey({
    columns: [t.folderId, t.tenantId],
    foreignColumns: [folders.id, folders.tenantId],
  }).onDelete("cascade"),
  foreignKey({
    columns: [t.fileTypeId, t.tenantId],
    foreignColumns: [fileTypes.id, fileTypes.tenantId],
  }).onDelete("restrict"),
]);
