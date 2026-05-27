import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Non-communicable disease (NCD) assessment — PhilHealth PKA v1.1 NCDQANS data group.
 * High-density screening block for patients aged ≥ 25 years.
 * One row per patient.
 */
export const patientNcdAssessment = sqliteTable("patient_ncd_assessment", {
	id: text("id").primaryKey(),
	patientId: text("patient_id")
		.notNull()
		.unique()
		.references(() => patients.id, { onDelete: "cascade" }),

	/** NCD questionnaire item 1 (ref: lib_ncdq): Y = Yes, N = No (pQid1_Yn) */
	qid1Yn: text("qid1_yn", { enum: ["Y", "N"] }),
	/** NCD questionnaire item 2 (ref: lib_ncdq): Y = Yes, N = No (pQid2_Yn) */
	qid2Yn: text("qid2_yn", { enum: ["Y", "N"] }),
	/** NCD questionnaire item 3 (ref: lib_ncdq): Y = Yes, N = No (pQid3_Yn) */
	qid3Yn: text("qid3_yn", { enum: ["Y", "N"] }),
	/** NCD questionnaire item 4 (ref: lib_ncdq): Y = Yes, N = No (pQid4_Yn) */
	qid4Yn: text("qid4_yn", { enum: ["Y", "N"] }),
	/** NCD questionnaire item 5: Y = Yes, N = No, X = Don't Know (pQid5_Ynx) */
	qid5Ynx: text("qid5_ynx", { enum: ["Y", "N", "X"] }),
	/** Historical Fasting Blood Sugar result in mg/dL (pQid19_Fbsmg) */
	qid19FbsMg: text("qid19_fbs_mg"),
	/** Historical Fasting Blood Sugar result in mmol/L (pQid19_Fbsmmol) */
	qid19FbsMmol: text("qid19_fbs_mmol"),
	/** Historical FBS test execution date (YYYY-MM-DD) (pQid19_Fbsdate) */
	qid19FbsDate: text("qid19_fbs_date"),
	/** Total Cholesterol historical baseline reading in mg/dL (pQid20_Choleval) */
	qid20CholeVal: text("qid20_chole_val"),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type PatientNcdAssessment = typeof patientNcdAssessment.$inferSelect;
export type NewPatientNcdAssessment = typeof patientNcdAssessment.$inferInsert;
