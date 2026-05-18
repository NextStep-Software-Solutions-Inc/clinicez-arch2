import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Outbox for all pending local mutations.
 * Every create / update / delete goes through the queue before being
 * pushed to the clinic's backend.
 */
export const syncQueue = sqliteTable("sync_queue", {
	id: text("id").primaryKey(), // client UUID
	entityType: text("entity_type", {
		enum: ["appointment", "file_metadata", "patient", "clinic"],
	}).notNull(),
	entityId: text("entity_id").notNull(),
	operation: text("operation", {
		enum: ["create", "update", "delete"],
	}).notNull(),
	payloadJson: text("payload_json").notNull(), // JSON-serialised field delta
	status: text("status", {
		enum: ["pending", "syncing", "synced", "failed", "dead"],
	})
		.notNull()
		.default("pending"),
	retryCount: integer("retry_count").notNull().default(0),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type SyncQueueItem = typeof syncQueue.$inferSelect;
export type NewSyncQueueItem = typeof syncQueue.$inferInsert;
