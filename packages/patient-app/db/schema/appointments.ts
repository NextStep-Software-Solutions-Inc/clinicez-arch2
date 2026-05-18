import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { clinics } from "./clinics";

export const appointments = sqliteTable("appointments", {
	id: text("id").primaryKey(), // client UUID
	clinicId: text("clinic_id")
		.notNull()
		.references(() => clinics.id),
	doctorName: text("doctor_name").notNull(),
	doctorSpecialty: text("doctor_specialty"),
	date: text("date").notNull(), // ISO date YYYY-MM-DD
	time: text("time").notNull(), // HH:MM
	status: text("status", {
		enum: ["pending", "confirmed", "cancelled", "completed"],
	})
		.notNull()
		.default("pending"),
	notes: text("notes"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	deletedAt: integer("deleted_at", { mode: "timestamp_ms" }), // soft delete
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
	serverId: text("server_id"), // assigned by server after first sync
	serverUpdatedAt: integer("server_updated_at", { mode: "timestamp_ms" }), // last known server timestamp for conflict detection
});

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
