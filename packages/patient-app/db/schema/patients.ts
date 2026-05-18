import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Patient profile — PhilHealth Konsulta baseline.
 * One row per device (single patient per app install).
 * clerkUserId links this record to the authenticated Clerk identity.
 */
export const patients = sqliteTable("patients", {
	id: text("id").primaryKey(), // client UUID
	clerkUserId: text("clerk_user_id").unique(), // Clerk identity link

	// Name
	firstName: text("first_name").notNull(),
	middleName: text("middle_name"),
	lastName: text("last_name").notNull(),
	suffix: text("suffix"), // Jr., Sr., III, etc.

	// Demographics
	sex: text("sex", { enum: ["Male", "Female", "Other"] }),
	dob: text("dob"), // ISO date YYYY-MM-DD
	civilStatus: text("civil_status", {
		enum: ["Single", "Married", "Widowed", "Separated", "Divorced"],
	}),
	bloodType: text("blood_type", {
		enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"],
	}),
	nationality: text("nationality").default("Filipino"),
	religion: text("religion"),

	// Government IDs
	philhealthId: text("philheath_id"),

	// Contact
	email: text("email"),
	phone: text("phone"),

	// Avatar
	avatarUrl: text("avatar_url"),

	// Sync metadata
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
	serverId: text("server_id"), // assigned after first successful sync
});

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
