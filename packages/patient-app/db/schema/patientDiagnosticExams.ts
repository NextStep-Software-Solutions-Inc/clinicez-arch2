import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Diagnostic and laboratory exam results — PhilHealth PKA v1.1.
 * Covers all diagnostic panels under a unified table with an examType discriminator.
 * Panels: FBS/RBS, Lipid Profile, Creatinine, PPD Test, Other.
 * Shared wrapper parameters apply to every row; panel-specific columns are nullable
 * and populated only for the matching examType.
 * Multiple rows per patient (one per exam panel entry).
 *
 * Exam type values:
 *  "fbs_rbs"       — Fasting / Random Blood Sugar (FBSS / RBSS)
 *  "lipid_profile" — Lipid Profile (LIPIDPROFILE)
 *  "creatinine"    — Serum Creatinine (CREATININE)
 *  "ppd_test"      — Purified Protein Derivative Test (PPDTest)
 *  "other"         — Unlisted Extended Panel (OTHERDIAGEXAM)
 */
export const patientDiagnosticExams = sqliteTable("patient_diagnostic_exams", {
	id: text("id").primaryKey(),
	patientId: text("patient_id")
		.notNull()
		.references(() => patients.id, { onDelete: "cascade" }),

	/** Panel discriminator (pPanel) */
	examType: text("exam_type", {
		enum: ["fbs_rbs", "lipid_profile", "creatinine", "ppd_test", "other"],
	}).notNull(),

	// ── Shared diagnostic wrapper parameters ──────────────────────────────────

	/** Name of third-party facility if lab service was outsourced (pReferralFacility) */
	referralFacility: text("referral_facility"),
	/** Date specimen processing or clinical observation completed (YYYY-MM-DD) (pLabDate) */
	labDate: text("lab_date"),
	/** Audit trail logging date for EMR state tracking (YYYY-MM-DD) (pDateAdded) */
	dateAdded: text("date_added"),
	/**
	 * Execution lifecycle flag (pStatus):
	 *  D = Done, N = Not yet done, X = Deferred, W = Waived
	 */
	status: text("status", { enum: ["D", "N", "X", "W"] }),
	/** Actual cost charged for the assessment (pDiagnosticLabFee) */
	diagnosticLabFee: real("diagnostic_lab_fee"),

	// ── FBS / RBS panel (examType = "fbs_rbs") ────────────────────────────────

	/** Blood glucose level in mg/dL — VARCHAR2 to support qualifiers (pGlucoseMg) */
	glucoseMg: text("glucose_mg"),
	/** Blood glucose level in mmol/L — VARCHAR2 to support qualifiers (pGlucoseMmol) */
	glucoseMmol: text("glucose_mmol"),

	// ── Lipid Profile panel (examType = "lipid_profile") ─────────────────────

	/** Total Serum Cholesterol reading (pCholesterol) */
	cholesterol: text("cholesterol"),
	/** Triglycerides level (pTriglycerides) */
	triglycerides: text("triglycerides"),
	/** High-Density Lipoprotein value (pHdl) */
	hdl: text("hdl"),
	/** Low-Density Lipoprotein value (pLdl) */
	ldl: text("ldl"),
	/** Aggregated lipid calculation total (pTotal) */
	lipidTotal: text("lipid_total"),

	// ── Creatinine / PPD / Other panels ──────────────────────────────────────

	/**
	 * Findings/result string (pFindings).
	 * Creatinine: free-text mg/dL result.
	 * PPD Test: "P" (Positive) or "N" (Negative).
	 * Other: clinical interpretation notes.
	 */
	findings: text("findings"),

	// ── Other exam panel (examType = "other") ─────────────────────────────────

	/** Description of non-standard clinical exam (pOthDiagExam) */
	othDiagExam: text("oth_diag_exam"),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type PatientDiagnosticExam = typeof patientDiagnosticExams.$inferSelect;
export type NewPatientDiagnosticExam =
	typeof patientDiagnosticExams.$inferInsert;
