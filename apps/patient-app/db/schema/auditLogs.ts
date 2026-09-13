import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Audit Logs — local app-level event log, prunable after 30 days
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  timestamp: integer('timestamp').notNull(),
  level: text('level', { enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'] }).notNull(),
  category: text('category', {
    enum: ['AUTH', 'SYNC', 'DATA', 'SECURITY', 'SYSTEM'],
  }).notNull(),
  action: text('action').notNull(),
  detailsJson: text('details_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
