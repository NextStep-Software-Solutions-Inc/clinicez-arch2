import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Patient past medical history — PhilHealth PKA v1.1 MHSPECIFIC data group.
 * Documents past systemic conditions linked to PhilHealth disease library codes.
 * Multiple rows per patient (one per disease entry).
 */
export const patientPastMedicalHistory = sqliteTable(
	"patient_past_medical_history",
	{
		id: text("id").primaryKey(),
		patientId: text("patient_id")
			.notNull()
			.references(() => patients.id, { onDelete: "cascade" }),

		/** Standardized disease category code (ref: lib_mdisease) (pMdiseaseCode) */
		mdiseaseCode: text("mdisease_code"),
		/** Granular medical description or contextual annotations (pSpecificDesc) */
		specificDesc: text("specific_desc"),

		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
		syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
	},
);

export type PatientPastMedicalHistory =
	typeof patientPastMedicalHistory.$inferSelect;
export type NewPatientPastMedicalHistory =
	typeof patientPastMedicalHistory.$inferInsert;
