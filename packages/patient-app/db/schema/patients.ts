import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const patients = sqliteTable("patients", {
	id: text("id").primaryKey(), // client UUID
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	dob: text("dob"), // ISO date YYYY-MM-DD
	email: text("email"),
	phone: text("phone"),
	avatarUrl: text("avatar_url"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
