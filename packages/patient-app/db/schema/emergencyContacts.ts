import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Emergency contacts for a patient.
 * sortOrder: 1 = primary, 2 = secondary, etc.
 */
export const emergencyContacts = sqliteTable("emergency_contacts", {
    id: text("id").primaryKey(), // client UUID
    patientId: text("patient_id")
        .notNull()
        .references(() => patients.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(1), // 1 = primary

    name: text("name").notNull(),
    relationship: text("relationship"), // Spouse, Parent, Sibling, Child, Friend, etc.
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address"),

    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type EmergencyContact = typeof emergencyContacts.$inferSelect;
export type NewEmergencyContact = typeof emergencyContacts.$inferInsert;
