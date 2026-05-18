import { drizzle } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";
import * as schema from "./schema/index";

const expo = SQLite.openDatabaseSync("clinicez.db");

export const db = drizzle(expo, { schema });

/**
 * Prune audit_logs older than 30 days.
 * Called once during app initialisation after migrations run.
 */
export async function pruneAuditLogs(): Promise<void> {
	const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
	await expo.runAsync("DELETE FROM audit_logs WHERE created_at < ?", cutoff);
}
