import { integer, sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A8 — Social History (singleton per patient — flat columns)
export const patientSocialHistory = sqliteTable('patient_social_history', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .unique()
    .references(() => patients.id, { onDelete: 'cascade' }),
  // Tobacco
  tobaccoStatus: text('tobacco_status', { enum: ['Never', 'Former', 'Current'] }),
  cigsPerDay: integer('cigs_per_day'),
  packYears: real('pack_years'),
  quitDate: text('quit_date'), // YYYY-MM-DD
  otherTobaccoProducts: text('other_tobacco_products'),
  // Alcohol
  alcoholUseLevel: text('alcohol_use_level'),
  alcoholType: text('alcohol_type'),
  alcoholFrequencyDaysPerWeek: integer('alcohol_frequency_days_per_week'),
  alcoholQuantityPerOccasion: integer('alcohol_quantity_per_occasion'),
  // Substance use
  substanceUse: integer('substance_use', { mode: 'boolean' }).default(false),
  substanceName: text('substance_name'),
  substanceRoute: text('substance_route'),
  substanceFrequency: text('substance_frequency'),
  // Physical activity
  activityLevel: text('activity_level'),
  exerciseType: text('exercise_type'),
  exerciseFrequencyDaysPerWeek: integer('exercise_frequency_days_per_week'),
  // Diet
  dietPattern: text('diet_pattern'),
  foodRestrictions: text('food_restrictions'),
  // Sleep
  sleepAvgHours: real('sleep_avg_hours'),
  sleepQuality: text('sleep_quality', { enum: ['Good', 'Fair', 'Poor'] }),
  // Other
  waterIntake: text('water_intake'),
  caffeineUse: text('caffeine_use'),
  dailyScreenTime: text('daily_screen_time'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientSocialHistory = typeof patientSocialHistory.$inferSelect;
export type NewPatientSocialHistory = typeof patientSocialHistory.$inferInsert;
