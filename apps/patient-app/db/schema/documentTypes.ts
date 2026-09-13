import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const documentTypes = sqliteTable('document_types', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  label: text('label').notNull(),
  description: text('description'),
  supportedExtensionsJson: text('supported_extensions_json').notNull().default('[]'),
  supportedMimeTypesJson: text('supported_mime_types_json').notNull().default('[]'),
  nativePreviewKind: text('native_preview_kind', {
    enum: ['image', 'pdf', 'external', 'none'],
  })
    .notNull()
    .default('external'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
});

export type DocumentType = typeof documentTypes.$inferSelect;
export type NewDocumentType = typeof documentTypes.$inferInsert;
