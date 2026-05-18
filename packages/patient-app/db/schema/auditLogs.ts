import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Verbose local audit trail.
 * Retained for 30 days (pruned on app cold start).
 * Rule: never store sensitive values — only event names, counts,
 * status codes, entity types, and IDs.
 */
export const auditLogs = sqliteTable("audit_logs", {
	id: text("id").primaryKey(), // client UUID
	timestamp: integer("timestamp").notNull(), // Unix ms
	level: text("level", {
		enum: ["DEBUG", "INFO", "WARN", "ERROR"],
	}).notNull(),
	category: text("category", {
		enum: ["AUTH", "SYNC", "DATA", "SECURITY", "SYSTEM"],
	}).notNull(),
	action: text("action").notNull(), // e.g. 'PIN_VERIFY_SUCCESS'
	detailsJson: text("details_json"), // context JSON — never sensitive values
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
