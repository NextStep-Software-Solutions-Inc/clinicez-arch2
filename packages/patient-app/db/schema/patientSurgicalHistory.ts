import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Patient surgical history — PhilHealth PKA v1.1 SURGHIST data group.
 * Tracks operational/surgical history of the patient.
 * Multiple rows per patient (one per surgery entry).
 */
export const patientSurgicalHistory = sqliteTable("patient_surgical_history", {
	id: text("id").primaryKey(),
	patientId: text("patient_id")
		.notNull()
		.references(() => patients.id, { onDelete: "cascade" }),

	/** Text narrative describing the surgical intervention (pSurgDesc) */
	surgDesc: text("surg_desc"),
	/** Chronological execution date of surgery (YYYY-MM-DD) (pSurgDate) */
	surgDate: text("surg_date"),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
	deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export type PatientSurgicalHistory = typeof patientSurgicalHistory.$inferSelect;
export type NewPatientSurgicalHistory =
	typeof patientSurgicalHistory.$inferInsert;
