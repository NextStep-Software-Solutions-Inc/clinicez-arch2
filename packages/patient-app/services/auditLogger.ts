import { randomUUID } from "expo-crypto";
import { db } from "../db";
import { auditLogs } from "../db/schema/auditLogs";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type LogCategory = "AUTH" | "SYNC" | "DATA" | "SECURITY" | "SYSTEM";

/**
 * Write a verbose audit event to the local audit_logs table.
 *
 * Rules:
 *  - Never log sensitive values (no PINs, tokens, or PII field values)
 *  - Only log event names, counts, status codes, entity types, and IDs
 *  - Writes are fire-and-forget (non-blocking)
 */
async function writeLog(
	level: LogLevel,
	category: LogCategory,
	action: string,
	details?: Record<string, unknown>,
): Promise<void> {
	const now = Date.now();
	await db.insert(auditLogs).values({
		id: randomUUID(),
		timestamp: now,
		level,
		category,
		action,
		detailsJson: details ? JSON.stringify(details) : null,
		createdAt: new Date(now),
	});
}

export const audit = {
	debug: (
		category: LogCategory,
		action: string,
		details?: Record<string, unknown>,
	) => {
		writeLog("DEBUG", category, action, details).catch(console.error);
	},
	info: (
		category: LogCategory,
		action: string,
		details?: Record<string, unknown>,
	) => {
		writeLog("INFO", category, action, details).catch(console.error);
	},
	warn: (
		category: LogCategory,
		action: string,
		details?: Record<string, unknown>,
	) => {
		writeLog("WARN", category, action, details).catch(console.error);
	},
	error: (
		category: LogCategory,
		action: string,
		details?: Record<string, unknown>,
	) => {
		writeLog("ERROR", category, action, details).catch(console.error);
	},
};
