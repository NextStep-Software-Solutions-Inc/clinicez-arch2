import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// Appointments — local cache of the last successful API response.
// On every successful network call, all rows for the patientId are deleted
// and replaced with fresh data. On API failure the stale rows are returned
// to the UI so the user still has offline access.
export const appointments = sqliteTable('appointments', {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
        .notNull()
        .references(() => patients.id, { onDelete: 'cascade' }),

    // Clinic snapshot
    clinicId: text('clinic_id').notNull(),
    clinicName: text('clinic_name').notNull(),
    clinicAddress: text('clinic_address'),
    clinicLogoUrl: text('clinic_logo_url'),
    clinicCoverImageUrl: text('clinic_cover_image_url'),
    clinicPhoneNumber: text('clinic_phone_number'),

    // Provider snapshot
    providerId: text('provider_id').notNull(),
    providerName: text('provider_name').notNull(),
    providerSpecialty: text('provider_specialty'),
    providerAvatarUrl: text('provider_avatar_url'),
    providerBio: text('provider_bio'),
    providerCredentialsJson: text('provider_credentials_json').notNull().default('[]'),
    providerAffiliatedClinicsJson: text('provider_affiliated_clinics_json').notNull().default('[]'),

    // Appointment core
    serviceType: text('service_type'),
    scheduledAt: text('scheduled_at').notNull(),   // ISO-8601 datetime string
    durationMinutes: integer('duration_minutes').notNull().default(30),
    status: text('status', {
        enum: ['confirmed', 'pending', 'canceled', 'action_required', 'completed', 'no_show'],
    }).notNull().default('pending'),
    notes: text('notes'),
    attachedDocumentsJson: text('attached_documents_json').notNull().default('[]'),

    // Cache metadata
    cachedAt: text('cached_at').notNull(),  // ISO-8601 — when the API response was stored
    rawJson: text('raw_json').notNull(),    // Full serialized AppointmentItem for lossless deserialization
});

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
