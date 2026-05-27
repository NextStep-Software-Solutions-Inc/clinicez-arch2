import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Outpatient prescription and dispensing ledger — PhilHealth PKA v1.1 MEDICINE data group.
 * Multiple rows per patient. When no medication is prescribed, one row must exist with
 * isApplicable = "N" and the structural fallback dummy codes (see defaults below).
 */
export const patientMedicines = sqliteTable("patient_medicines", {
	id: text("id").primaryKey(),
	patientId: text("patient_id")
		.notNull()
		.references(() => patients.id, { onDelete: "cascade" }),

	/** Therapeutic category (ref: lib_medicine) (pCategory) */
	category: text("category"),
	/**
	 * Unique drug code (ref: lib_medicine) (pDrugCode).
	 * Fallback to "NOMED0000000000000000000000000" when no medication is issued.
	 */
	drugCode: text("drug_code"),
	/**
	 * Generic chemical formulation code (ref: lib_medicine_generic) (pGenericCode).
	 * Fallback: "NOMED"
	 */
	genericCode: text("generic_code"),
	/**
	 * Chemical salt compound code (ref: lib_medicine_salt) (pSaltCode).
	 * Fallback: "00000"
	 */
	saltCode: text("salt_code"),
	/**
	 * Dosage concentration code (ref: lib_medicine_strength) (pStrengthCode).
	 * Fallback: "00000"
	 */
	strengthCode: text("strength_code"),
	/**
	 * Physical preparation form code (ref: lib_medicine_form) (pFormCode).
	 * Tablet, Drops, Capsule, etc. Fallback: "00000"
	 */
	formCode: text("form_code"),
	/** Extension block for unlisted pharmaceutical groupings (pOthMedDrugGrouping) */
	othMedDrugGrouping: text("oth_med_drug_grouping"),
	/** Dispensing fulfillment state: Y = dispensed, N = not dispensed (pIsDispensed) */
	isDispensed: text("is_dispensed", { enum: ["Y", "N"] }).notNull(),
	/**
	 * Structural override toggle (pIsApplicable).
	 * Set to "N" when no medication was prescribed (zero-prescription fallback).
	 * Default: "Y"
	 */
	isApplicable: text("is_applicable", { enum: ["Y", "N"] })
		.notNull()
		.default("Y"),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
	deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

export type PatientMedicine = typeof patientMedicines.$inferSelect;
export type NewPatientMedicine = typeof patientMedicines.$inferInsert;
