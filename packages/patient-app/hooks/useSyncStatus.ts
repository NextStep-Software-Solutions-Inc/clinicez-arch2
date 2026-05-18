import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { getSyncStatus, syncAll } from "@/services/syncService";

type SyncStatusSnapshot = {
	pendingCount: number;
	lastSyncAt: Date | null;
	isSyncing: boolean;
	error: string | null;
	authError: boolean;
};

const POLL_INTERVAL_MS = 5_000;

/**
 * Polls sync status every 5 seconds while the app is in the foreground.
 * Triggers a sync automatically when the app returns to the foreground.
 * Returns a live snapshot of the sync state for badge / status indicators.
 */
export function useSyncStatus(): SyncStatusSnapshot {
	const [snapshot, setSnapshot] = useState<SyncStatusSnapshot>(getSyncStatus());

	useEffect(() => {
		// Poll on interval
		const interval = setInterval(() => {
			setSnapshot(getSyncStatus());
		}, POLL_INTERVAL_MS);

		// Trigger sync + update snapshot when app comes to foreground
		const sub = AppState.addEventListener(
			"change",
			(nextState: AppStateStatus) => {
				if (nextState === "active") {
					syncAll().catch(console.error);
					setSnapshot(getSyncStatus());
				}
			},
		);

		return () => {
			clearInterval(interval);
			sub.remove();
		};
	}, []);

	return snapshot;
}
