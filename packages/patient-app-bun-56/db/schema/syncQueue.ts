import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Sync Queue — tracks pending Part A changes to push to clinic backend
export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  entityType: text('entity_type', {
    enum: [
      'patient',
      'patient_government_ids',
      'patient_addresses',
      'emergency_contacts',
      'patient_healthcare_providers',
      'patient_allergies',
      'patient_medications',
      'patient_surgical_history',
      'patient_past_illnesses',
      'patient_chronic_conditions',
      'patient_disabilities',
      'patient_immunizations_self',
      'patient_social_history',
      'patient_family_history',
      'patient_occupation',
      'patient_travel_history',
      'patient_obstetric_profile',
      'patient_pregnancies',
      'patient_contraceptive_history',
      'patient_male_reproductive',
      'patient_dental_vision',
      'patient_mental_health_profile',
    ],
  }).notNull(),
  entityId: text('entity_id').notNull(),
  operation: text('operation', { enum: ['create', 'update', 'delete'] }).notNull(),
  payloadJson: text('payload_json').notNull(),
  status: text('status', {
    enum: ['pending', 'syncing', 'synced', 'failed', 'dead'],
  })
    .notNull()
    .default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type SyncQueueItem = typeof syncQueue.$inferSelect;
export type NewSyncQueueItem = typeof syncQueue.$inferInsert;
