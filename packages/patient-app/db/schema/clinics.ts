import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * All clinics the patient has joined.
 * There is no "current clinic" — the app is patient-centric and shows
 * data across all joined clinics simultaneously.
 */
export const clinics = sqliteTable("clinics", {
	id: text("id").primaryKey(), // client UUID
	name: text("name").notNull(),
	address: text("address"),
	baseUrl: text("base_url").notNull(), // backend API root URL
	inviteCode: text("invite_code"),
	joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
});

export type Clinic = typeof clinics.$inferSelect;
export type NewClinic = typeof clinics.$inferInsert;
