import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * PhilHealth-specific profiling fields required for Konsulta XML submission.
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
	/** Authorization Transaction Code — use "WALKEDIN" if isWalkedIn = "Y" */
	atc: text("atc"),
	/** Is Patient Walked In: "Y" or "N" */
	isWalkedIn: text("is_walked_in", { enum: ["Y", "N"] }),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type PhilhealthProfile = typeof philhealthProfiles.$inferSelect;
export type NewPhilhealthProfile = typeof philhealthProfiles.$inferInsert;
