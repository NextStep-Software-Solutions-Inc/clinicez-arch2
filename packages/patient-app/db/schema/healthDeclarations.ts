import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Patient-declared health conditions.
 * Based on PhilHealth Konsulta patient profile health declaration form.
 *
 * Categories:
 * - allergy            : drug, food, or environmental allergies
 * - disability         : physical/sensory/cognitive disabilities
 * - illness            : known illnesses (current or past)
 * - chronic_condition  : long-term conditions (e.g. hypertension, diabetes)
 * - current_medication : active prescriptions / OTC medications
 * - past_surgery       : surgical history
 * - family_history     : hereditary conditions in immediate family
 * - immunization       : vaccination history
 * - lifestyle_habit    : smoking, alcohol, exercise, diet notes
 */
export const healthDeclarations = sqliteTable("health_declarations", {
    id: text("id").primaryKey(), // client UUID
    patientId: text("patient_id")
        .notNull()
        .references(() => patients.id, { onDelete: "cascade" }),

    category: text("category", {
        enum: [
            "allergy",
            "disability",
            "illness",
            "chronic_condition",
            "current_medication",
            "past_surgery",
            "family_history",
            "immunization",
            "lifestyle_habit",
        ],
    }).notNull(),

    description: text("description").notNull(), // e.g. "Penicillin", "Hypertension"
    detail: text("detail"), // e.g. allergy reaction, medication dosage, surgery type
    onsetDate: text("onset_date"), // YYYY-MM-DD (approximate)
    treatingPhysician: text("treating_physician"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),

    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }), // soft delete
});

export type HealthDeclaration = typeof healthDeclarations.$inferSelect;
export type NewHealthDeclaration = typeof healthDeclarations.$inferInsert;

export type HealthDeclarationCategory = HealthDeclaration["category"];
