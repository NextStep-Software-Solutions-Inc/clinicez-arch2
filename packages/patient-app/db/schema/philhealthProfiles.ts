import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * PhilHealth-specific profiling fields required for Konsulta XML submission.
 * Maps to PKA v1.1 PROFILE data group (Clinical Encounter Master).
 * One row per patient.
 */
export const philhealthProfiles = sqliteTable("philhealth_profiles", {
	id: text("id").primaryKey(),
	patientId: text("patient_id")
		.notNull()
		.unique()
		.references(() => patients.id, { onDelete: "cascade" }),

	/** "MM" = Member, "DD" = Dependent */
	patientType: text("patient_type", { enum: ["MM", "DD"] }),
	/** PhilHealth ID of primary member (required when patientType = "DD") */
	memPin: text("mem_pin"),
	/** Effectivity year (4-digit) */
	effYear: text("eff_year"),
	/** Authorization Transaction Code — use "WALKEDIN" if isWalkedIn = "Y" (pATC) */
	atc: text("atc"),
	/** Is Patient Walked In: "Y" or "N" (pIsWalkedIn) */
	isWalkedIn: text("is_walked_in", { enum: ["Y", "N"] }),
	/** Date profiling/screening took place (YYYY-MM-DD) (pProfDate) */
	profDate: text("prof_date"),
	/** Server-assigned encounter transaction key (pHciTransNo); populated after sync */
	hciTransNo: text("hci_trans_no"),
	/** Server-assigned enlistment case reference (pHciCaseNo); populated after sync */
	hciCaseNo: text("hci_case_no"),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type PhilhealthProfile = typeof philhealthProfiles.$inferSelect;
export type NewPhilhealthProfile = typeof philhealthProfiles.$inferInsert;
