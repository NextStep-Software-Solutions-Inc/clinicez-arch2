import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Patient social / personal history (PhilHealth SOCHIST group).
 * One row per patient.
 */
export const patientSocialHistory = sqliteTable("patient_social_history", {
	id: text("id").primaryKey(),
	patientId: text("patient_id")
		.notNull()
		.unique()
		.references(() => patients.id, { onDelete: "cascade" }),

	/** Is Patient a Smoker: "Y" Yes | "N" No | "X" Quit */
	isSmoker: text("is_smoker", { enum: ["Y", "N", "X"] }),
	/** Cigarette packs consumed per year (required if isSmoker = "Y") */
	noCigpk: real("no_cigpk"),

	/** Is Patient an Alcohol Drinker: "Y" Yes | "N" No | "X" Quit */
	isAdrinker: text("is_adrinker", { enum: ["Y", "N", "X"] }),
	/** Bottles consumed per day */
	noBottles: real("no_bottles"),

	/** Is Patient an Illicit Drug User: "Y" Yes | "N" No */
	illDrugUser: text("ill_drug_user", { enum: ["Y", "N"] }),

	/** Is Patient Sexually Active: "Y" Yes | "N" No */
	isSexuallyActive: text("is_sexually_active", { enum: ["Y", "N"] }),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type PatientSocialHistory = typeof patientSocialHistory.$inferSelect;
export type NewPatientSocialHistory = typeof patientSocialHistory.$inferInsert;
