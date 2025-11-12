import { text, sqliteTable } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

// Define tenants table here to avoid circular dependency
export const tenants = sqliteTable("tenants", {
  id: text().$defaultFn(() => uuidv7()).primaryKey(),
  name: text().notNull().unique(),
  description: text(),
});

export const baseEntity = {
  id: text().$defaultFn(() => uuidv7()).primaryKey(),
  tenantId: text().notNull().references(() => tenants.id),
  createdAt: text().$defaultFn(() => new Date().toISOString()),
  updatedAt: text().$defaultFn(() => new Date().toISOString()),
  deletedAt: text(),
};
