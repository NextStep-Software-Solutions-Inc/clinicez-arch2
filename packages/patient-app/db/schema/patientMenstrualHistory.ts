import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Patient menstrual history (PhilHealth MENSHIST group).
 * Applicable to female patients only.
 * One row per patient.
 */
export const patientMenstrualHistory = sqliteTable(
	"patient_menstrual_history",
	{
		id: text("id").primaryKey(),
		patientId: text("patient_id")
			.notNull()
			.unique()
			.references(() => patients.id, { onDelete: "cascade" }),

		/** Whether this section is applicable for the patient: "Y" | "N" */
		isApplicable: text("is_applicable", { enum: ["Y", "N"] }),

		/** Age at first menstruation (menarche) */
		menarchePeriod: real("menarche_period"),
		/** Date of last menstrual period (YYYY-MM-DD) */
		lastMensPeriod: text("last_mens_period"),
		/** Duration of menstrual period in number of days */
		periodDuration: real("period_duration"),
		/** Interval / cycle of menstruation in number of days */
		mensInterval: real("mens_interval"),
		/** Number of pads / napkins used per day during menstruation */
		padsPerDay: real("pads_per_day"),
		/** Age of onset of first sexual intercourse */
		onsetSexIc: real("onset_sex_ic"),
		/** Birth control method used */
		birthCtrlMethod: text("birth_ctrl_method"),
		/** Is Menopause: "Y" | "N" */
		isMenopause: text("is_menopause", { enum: ["Y", "N"] }),
		/** Age of menopause (if applicable) */
		menopauseAge: real("menopause_age"),

		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
		syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
	},
);

export type PatientMenstrualHistory =
	typeof patientMenstrualHistory.$inferSelect;
export type NewPatientMenstrualHistory =
	typeof patientMenstrualHistory.$inferInsert;
