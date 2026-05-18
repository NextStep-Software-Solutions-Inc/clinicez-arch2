import { and, eq } from "drizzle-orm";
import { randomUUID } from "expo-crypto";
import { db } from "../db";
import { appointments, clinics, syncQueue } from "../db/schema/index";
import type { SyncQueueItem } from "../db/schema/syncQueue";
import { audit } from "./auditLogger";
import { StorageKey, secureGet, secureSet } from "./secureStorage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityType = "appointment" | "file_metadata" | "patient" | "clinic";
export type SyncOperation = "create" | "update" | "delete";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed" | "dead";

export type SyncResult = {
	pushed: number;
	pulled: number;
	conflicts: number;
	errors: number;
	durationMs: number;
};

type SyncState = {
	isSyncing: boolean;
	lastSyncAt: Date | null;
	pendingCount: number;
	error: string | null;
	authError: boolean;
};

const state: SyncState = {
	isSyncing: false,
	lastSyncAt: null,
	pendingCount: 0,
	error: null,
	authError: false,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSyncStatus(): Readonly<SyncState> {
	return { ...state };
}

/**
 * Enqueue a local mutation for the next sync cycle.
 * Call this after every local write (create / update / delete).
 */
export async function enqueueMutation(
	entityType: EntityType,
	entityId: string,
	operation: SyncOperation,
	payload: Record<string, unknown>,
): Promise<void> {
	await db.insert(syncQueue).values({
		id: randomUUID(),
		entityType,
		entityId,
		operation,
		payloadJson: JSON.stringify(payload),
		status: "pending",
		retryCount: 0,
		createdAt: new Date(),
	});
	state.pendingCount++;
}

/**
 * Run a full push + pull sync cycle across all joined clinics.
 * Clinics are synced sequentially to avoid concurrent write conflicts.
 */
export async function syncAll(): Promise<SyncResult> {
	if (state.isSyncing) {
		return { pushed: 0, pulled: 0, conflicts: 0, errors: 0, durationMs: 0 };
	}

	const startMs = Date.now();
	state.isSyncing = true;
	state.error = null;
	state.authError = false;

	const allClinics = await db.select().from(clinics);
	audit.info("SYNC", "SYNC_STARTED", { clinicCount: allClinics.length });

	let totalPushed = 0;
	let totalPulled = 0;
	let totalConflicts = 0;
	let totalErrors = 0;

	for (const clinic of allClinics) {
		try {
			const pushed = await pushPending(clinic.id, clinic.baseUrl);
			totalPushed += pushed;

			if (state.authError) break;

			const { pulled, conflicts } = await pullChanges(
				clinic.id,
				clinic.baseUrl,
			);
			totalPulled += pulled;
			totalConflicts += conflicts;
		} catch (err) {
			totalErrors++;
			const message = err instanceof Error ? err.message : String(err);
			state.error = message;
			audit.error("SYNC", "SYNC_CLINIC_ERROR", {
				clinicId: clinic.id,
				error: message,
			});
		}
	}

	const lastSyncAt = new Date();
	state.isSyncing = false;
	state.lastSyncAt = lastSyncAt;
	await secureSet(StorageKey.LAST_SYNC_AT, lastSyncAt.toISOString());

	// Refresh pending count
	const pending = await db
		.select()
		.from(syncQueue)
		.where(eq(syncQueue.status, "pending"));
	state.pendingCount = pending.length;

	const durationMs = Date.now() - startMs;
	audit.info("SYNC", "SYNC_COMPLETE", {
		pushed: totalPushed,
		pulled: totalPulled,
		conflicts: totalConflicts,
		errors: totalErrors,
		duration_ms: durationMs,
	});

	return {
		pushed: totalPushed,
		pulled: totalPulled,
		conflicts: totalConflicts,
		errors: totalErrors,
		durationMs,
	};
}

// ---------------------------------------------------------------------------
// Internal — push
// ---------------------------------------------------------------------------

async function pushPending(clinicId: string, baseUrl: string): Promise<number> {
	const pending = await db
		.select()
		.from(syncQueue)
		.where(eq(syncQueue.status, "pending"));

	if (pending.length === 0) return 0;

	audit.debug("SYNC", "SYNC_PUSH_BATCH", {
		count: pending.length,
		clinicId,
	});

	// Mark all as syncing
	for (const item of pending) {
		await db
			.update(syncQueue)
			.set({ status: "syncing" })
			.where(eq(syncQueue.id, item.id));
	}

	const authToken = await secureGet(StorageKey.AUTH_TOKEN);

	let response: Response;
	try {
		response = await fetch(`${baseUrl}/api/sync/push`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify({ mutations: pending.map(serializeItem) }),
		});
	} catch (networkErr) {
		// Network unavailable — revert to pending for retry
		for (const item of pending) {
			await db
				.update(syncQueue)
				.set({ status: "pending" })
				.where(eq(syncQueue.id, item.id));
		}
		throw networkErr;
	}

	if (response.status === 401) {
		const refreshed = await attemptTokenRefresh(baseUrl);
		if (!refreshed) {
			state.authError = true;
			audit.warn("SYNC", "SYNC_AUTH_ERROR", { clinicBaseUrl: baseUrl });
			for (const item of pending) {
				await db
					.update(syncQueue)
					.set({ status: "pending" })
					.where(eq(syncQueue.id, item.id));
			}
			return 0;
		}
		// Retry once with new token
		return pushPending(clinicId, baseUrl);
	}

	if (!response.ok) {
		audit.error("SYNC", "SYNC_PUSH_FAILED", {
			clinicId,
			httpStatus: response.status,
		});
		for (const item of pending) {
			await incrementRetry(item);
		}
		return 0;
	}

	type PushResultItem = {
		id: string;
		result: "accepted" | "conflict" | "rejected";
	};
	const results: PushResultItem[] = await response.json();
	let pushed = 0;

	for (const res of results) {
		const item = pending.find((p) => p.id === res.id);
		if (!item) continue;

		if (res.result === "accepted") {
			await db
				.update(syncQueue)
				.set({ status: "synced" })
				.where(eq(syncQueue.id, item.id));
			pushed++;
		} else if (res.result === "conflict") {
			audit.warn("SYNC", "SYNC_CONFLICT_DETECTED", {
				entityType: item.entityType,
				entityId: item.entityId,
			});
			await incrementRetry(item);
		} else {
			// 'rejected' — validation error or permanent failure
			audit.error("SYNC", "SYNC_PUSH_REJECTED", {
				entityType: item.entityType,
				entityId: item.entityId,
			});
			await db
				.update(syncQueue)
				.set({ status: "failed" })
				.where(eq(syncQueue.id, item.id));
		}
	}

	audit.info("SYNC", "SYNC_PUSH_COMPLETE", {
		pushed,
		failed: pending.length - pushed,
	});
	return pushed;
}

// ---------------------------------------------------------------------------
// Internal — pull
// ---------------------------------------------------------------------------

async function pullChanges(
	clinicId: string,
	baseUrl: string,
): Promise<{ pulled: number; conflicts: number }> {
	const lastSyncAt = await secureGet(StorageKey.LAST_SYNC_AT);
	const since = lastSyncAt ?? new Date(0).toISOString();
	const authToken = await secureGet(StorageKey.AUTH_TOKEN);

	let response: Response;
	try {
		response = await fetch(
			`${baseUrl}/api/sync/pull?since=${encodeURIComponent(since)}&clinic_id=${clinicId}`,
			{
				headers: { Authorization: `Bearer ${authToken}` },
			},
		);
	} catch {
		return { pulled: 0, conflicts: 0 };
	}

	if (!response.ok) return { pulled: 0, conflicts: 0 };

	type ServerChange = {
		entity_type: EntityType;
		id: string;
		data: Record<string, unknown>;
		server_updated_at: number;
		deleted: boolean;
	};

	const changes: ServerChange[] = await response.json();
	let pulled = 0;
	let conflicts = 0;

	await db.transaction(async (tx) => {
		for (const change of changes) {
			if (change.entity_type !== "appointment") continue; // extend per entity type

			const [local] = await tx
				.select()
				.from(appointments)
				.where(eq(appointments.serverId, change.id));

			if (!local) {
				// New record from server — insert
				if (!change.deleted) {
					await tx.insert(appointments).values({
						id: randomUUID(),
						clinicId,
						doctorName: String(change.data.doctor_name ?? ""),
						date: String(change.data.date ?? ""),
						time: String(change.data.time ?? ""),
						status: "pending",
						createdAt: new Date(change.server_updated_at),
						updatedAt: new Date(change.server_updated_at),
						serverId: change.id,
						serverUpdatedAt: new Date(change.server_updated_at),
						syncedAt: new Date(),
					});
					pulled++;
				}
				continue;
			}

			const serverTs = change.server_updated_at;
			const localServerTs = local.serverUpdatedAt?.getTime() ?? 0;
			const serverIsNewer = serverTs > localServerTs;

			// Check if there is a pending local mutation for this entity
			const [pendingMutation] = await tx
				.select()
				.from(syncQueue)
				.where(
					and(
						eq(syncQueue.entityId, local.id),
						eq(syncQueue.status, "pending"),
					),
				);

			if (change.deleted) {
				if (!pendingMutation) {
					// Server deleted, no local mutation — apply soft delete
					await tx
						.update(appointments)
						.set({ deletedAt: new Date(), syncedAt: new Date() })
						.where(eq(appointments.id, local.id));
					pulled++;
				}
				// If there is a local pending mutation, local wins — do not delete
				continue;
			}

			if (!serverIsNewer) continue; // Local is up-to-date

			if (!pendingMutation) {
				// Server is newer, no local conflict — overwrite
				await tx
					.update(appointments)
					.set({
						...buildAppointmentUpdate(change.data),
						serverUpdatedAt: new Date(serverTs),
						syncedAt: new Date(),
					})
					.where(eq(appointments.id, local.id));
				pulled++;
			} else {
				// Three-way merge: server wins on overlapping fields
				conflicts++;
				const serverFields = buildAppointmentUpdate(change.data);
				const localPayload = JSON.parse(pendingMutation.payloadJson) as Record<
					string,
					unknown
				>;

				// Fields changed locally but NOT in the server delta are preserved
				const mergedUpdate: Record<string, unknown> = { ...serverFields };
				for (const key of Object.keys(localPayload)) {
					if (!(key in serverFields)) {
						mergedUpdate[key] = localPayload[key];
					}
				}

				audit.debug("SYNC", "SYNC_CONFLICT_RESOLVED", {
					entityType: change.entity_type,
					entityId: local.id,
					winner: "server",
					overlappingFields: Object.keys(serverFields).filter(
						(k) => k in localPayload,
					),
				});

				await tx
					.update(appointments)
					.set({
						...(mergedUpdate as unknown as typeof appointments.$inferInsert),
						serverUpdatedAt: new Date(serverTs),
						syncedAt: new Date(),
					})
					.where(eq(appointments.id, local.id));
			}
		}
	});

	audit.info("SYNC", "SYNC_PULL_COMPLETE", {
		received: changes.length,
		applied: pulled,
	});

	return { pulled, conflicts };
}

// ---------------------------------------------------------------------------
// Internal — token refresh
// ---------------------------------------------------------------------------

async function attemptTokenRefresh(baseUrl: string): Promise<boolean> {
	const refreshToken = await secureGet(StorageKey.REFRESH_TOKEN);
	if (!refreshToken) return false;

	try {
		const res = await fetch(`${baseUrl}/auth/refresh`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refresh_token: refreshToken }),
		});

		if (!res.ok) {
			audit.error("AUTH", "TOKEN_REFRESH_FAILED", { httpStatus: res.status });
			return false;
		}

		const { access_token, refresh_token } = await res.json();
		await secureSet(StorageKey.AUTH_TOKEN, access_token);
		await secureSet(StorageKey.REFRESH_TOKEN, refresh_token);
		audit.info("AUTH", "TOKEN_REFRESHED");
		return true;
	} catch {
		audit.error("AUTH", "TOKEN_REFRESH_FAILED", { httpStatus: 0 });
		return false;
	}
}

// ---------------------------------------------------------------------------
// Internal — retry / backoff
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;

async function incrementRetry(item: SyncQueueItem): Promise<void> {
	const next = item.retryCount + 1;
	if (next >= MAX_RETRIES) {
		await db
			.update(syncQueue)
			.set({ status: "dead", retryCount: next })
			.where(eq(syncQueue.id, item.id));
		audit.error("SYNC", "SYNC_ITEM_DEAD", {
			entityType: item.entityType,
			entityId: item.entityId,
			retryCount: next,
		});
	} else {
		await db
			.update(syncQueue)
			.set({ status: "failed", retryCount: next })
			.where(eq(syncQueue.id, item.id));
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeItem(item: SyncQueueItem) {
	return {
		id: item.id,
		entity_type: item.entityType,
		entity_id: item.entityId,
		operation: item.operation,
		payload: JSON.parse(item.payloadJson),
		client_updated_at: item.createdAt,
	};
}

function buildAppointmentUpdate(data: Record<string, unknown>) {
	const update: Partial<typeof appointments.$inferInsert> = {};
	if (data.doctor_name !== undefined)
		update.doctorName = String(data.doctor_name);
	if (data.doctor_specialty !== undefined)
		update.doctorSpecialty = String(data.doctor_specialty);
	if (data.date !== undefined) update.date = String(data.date);
	if (data.time !== undefined) update.time = String(data.time);
	if (data.status !== undefined)
		update.status = data.status as typeof update.status;
	if (data.notes !== undefined) update.notes = String(data.notes);
	return update;
}
