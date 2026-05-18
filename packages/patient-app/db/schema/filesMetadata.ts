import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { clinics } from "./clinics";

/**
 * Metadata only — binary content lives on the clinic's server.
 * localPath is set when the file has been cached on-device.
 */
export const filesMetadata = sqliteTable("files_metadata", {
	id: text("id").primaryKey(), // client UUID
	clinicId: text("clinic_id")
		.notNull()
		.references(() => clinics.id),
	name: text("name").notNull(),
	type: text("type"), // MIME type
	sizeBytes: integer("size_bytes"),
	serverUrl: text("server_url"),
	localPath: text("local_path"), // path to on-device cached copy
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
	serverId: text("server_id"),
});

export type FileMetadata = typeof filesMetadata.$inferSelect;
export type NewFileMetadata = typeof filesMetadata.$inferInsert;
