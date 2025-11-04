import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import * as t from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const timestamps = {
  createdAt: t.text().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: t.text().default(sql`CURRENT_TIMESTAMP`),
};

export const softDelete = {
  deletedAt: t.text(),
}