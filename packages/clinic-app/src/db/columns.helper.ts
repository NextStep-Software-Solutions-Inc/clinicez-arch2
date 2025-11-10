import { text } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";
import { tenants } from "./schema";

export const baseEntity = {
  id: text().$defaultFn(() => uuidv7()).primaryKey(),
  tenantId: text().notNull().references(() => tenants.id),
  createdAt: text().$defaultFn(() => new Date().toISOString()),
  updatedAt: text().$defaultFn(() => new Date().toISOString()),
  deletedAt: text(),
};
