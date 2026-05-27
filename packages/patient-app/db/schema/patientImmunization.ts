import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Patient immunization record (PhilHealth IMMUNIZATION group).
 * Stores coded immunization identifiers from PhilHealth reference libraries.
 * One row per patient.
 */
export const patientImmunization = sqliteTable("patient_immunization", {
	id: text("id").primaryKey(),
	patientId: text("patient_id")
		.notNull()
		.unique()
		.references(() => patients.id, { onDelete: "cascade" }),

	/** Children Immunization Code (ref: lib_immchild) */
	childImmcode: text("child_immcode"),
	/** Young Woman Immunization Code (ref: lib_immyoungw) */
	youngwImmcode: text("youngw_immcode"),
	/** Pregnant Woman Immunization Code (ref: lib_immpregw) */
	pregwImmcode: text("pregw_immcode"),
	/** Elderly Immunization Code (ref: lib_immaelderly) */
	elderlyImmcode: text("elderly_immcode"),
	/** Other immunizations not in the provided reference lists */
	otherImm: text("other_imm"),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type PatientImmunization = typeof patientImmunization.$inferSelect;
export type NewPatientImmunization = typeof patientImmunization.$inferInsert;
