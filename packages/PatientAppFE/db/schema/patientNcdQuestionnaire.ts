import { integer, sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// PhilHealth YAKAP/eKonsulta — NCDQANS (singleton per patient)
// 24-item NCD risk questionnaire answered by HCW during profiling (read-only for patient).
export const patientNcdQuestionnaire = sqliteTable('patient_ncd_questionnaire', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .unique()
    .references(() => patients.id, { onDelete: 'cascade' }),

  // Questions 1–16, 18, 23–24: Y/N answers (stored as 'Y'|'N'|null)
  qid1Yn: text('qid1_yn'),
  qid2Yn: text('qid2_yn'),
  qid3Yn: text('qid3_yn'),
  qid4Yn: text('qid4_yn'),
  // Q5 — Yes/No/X (three-valued)
  qid5Ynx: text('qid5_ynx'),
  qid6Yn: text('qid6_yn'),
  qid7Yn: text('qid7_yn'),
  qid8Yn: text('qid8_yn'),
  qid9Yn: text('qid9_yn'),
  qid10Yn: text('qid10_yn'),
  qid11Yn: text('qid11_yn'),
  qid12Yn: text('qid12_yn'),
  qid13Yn: text('qid13_yn'),
  qid14Yn: text('qid14_yn'),
  qid15Yn: text('qid15_yn'),
  qid16Yn: text('qid16_yn'),
  // Q17 — five-choice answer (A/B/C/D/E)
  qid17Abcde: text('qid17_abcde'),
  qid18Yn: text('qid18_yn'),

  // Q19 — Fasting Blood Sugar
  qid19Yn: text('qid19_yn'),
  qid19FbsMgdl: real('qid19_fbs_mgdl'),
  qid19FbsMmol: real('qid19_fbs_mmol'),
  qid19FbsDate: text('qid19_fbs_date'), // YYYY-MM-DD

  // Q20 — Cholesterol
  qid20Yn: text('qid20_yn'),
  qid20CholeVal: real('qid20_chole_val'),
  qid20CholeDate: text('qid20_chole_date'), // YYYY-MM-DD

  // Q21 — Urine Ketones
  qid21Yn: text('qid21_yn'),
  qid21KetonVal: real('qid21_keton_val'),
  qid21KetonDate: text('qid21_keton_date'), // YYYY-MM-DD

  // Q22 — Urine Protein
  qid22Yn: text('qid22_yn'),
  qid22ProteinVal: real('qid22_protein_val'),
  qid22ProteinDate: text('qid22_protein_date'), // YYYY-MM-DD

  qid23Yn: text('qid23_yn'),
  qid24Yn: text('qid24_yn'),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientNcdQuestionnaire = typeof patientNcdQuestionnaire.$inferSelect;
export type NewPatientNcdQuestionnaire = typeof patientNcdQuestionnaire.$inferInsert;
