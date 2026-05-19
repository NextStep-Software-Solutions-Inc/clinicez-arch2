import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { patients } from "./patients";

/**
 * Patient addresses — primary and secondary (PH-style fields).
 * Modelled after PhilHealth Konsulta address format.
 */
export const patientAddresses = sqliteTable("patient_addresses", {
	id: text("id").primaryKey(), // client UUID
	patientId: text("patient_id")
		.notNull()
		.references(() => patients.id, { onDelete: "cascade" }),
	type: text("type", { enum: ["primary", "secondary"] })
		.notNull()
		.default("primary"),

	// Address fields (Philippine format)
	houseStreet: text("house_street"), // House/Unit No., Building, Street
	barangay: text("barangay"),
	cityMunicipality: text("city_municipality"),
	province: text("province"),
	region: text("region"),
	zipCode: text("zip_code"),
	country: text("country").default("Philippines"),

	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type PatientAddress = typeof patientAddresses.$inferSelect;
export type NewPatientAddress = typeof patientAddresses.$inferInsert;
