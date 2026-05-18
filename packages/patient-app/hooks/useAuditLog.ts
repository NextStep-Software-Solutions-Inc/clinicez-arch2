import { desc } from "drizzle-orm";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/db";
import type { AuditLog } from "@/db/schema/auditLogs";
import { auditLogs } from "@/db/schema/auditLogs";
import type { LogCategory, LogLevel } from "@/services/auditLogger";

type AuditLogFilters = {
	level?: LogLevel;
	category?: LogCategory;
	limit?: number;
};

type UseAuditLogResult = {
	logs: AuditLog[];
	clear: () => Promise<void>;
};

/**
 * Hook for reading audit logs — intended for dev/admin use only.
 * Toggle via a hidden gesture or a developer menu flag.
 */
export function useAuditLog(filters?: AuditLogFilters): UseAuditLogResult {
	const [logs, setLogs] = useState<AuditLog[]>([]);
	const limit = filters?.limit ?? 200;

	const load = useCallback(async () => {
		const query = db
			.select()
			.from(auditLogs)
			.orderBy(desc(auditLogs.timestamp))
			.limit(limit);

		setLogs(await query);
	}, [limit]);

	const clear = async () => {
		await db.delete(auditLogs);
		setLogs([]);
	};

	useEffect(() => {
		load().catch(console.error);
	}, [load]);

	return { logs, clear };
}
