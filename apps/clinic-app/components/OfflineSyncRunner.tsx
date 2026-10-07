import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { offlineSyncService } from '../services/offlineSyncService';
import { notify } from '../utils/feedback';

/** How often queued items are retried while the app is open (items in backoff are skipped until due). */
const SYNC_INTERVAL_MS = 30_000;

/**
 * Renders nothing. While a signed-in session is open it drains the offline outbox whenever the device regains
 * connectivity and on a timer, so "it will sync automatically" is actually true.
 */
export function OfflineSyncRunner() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled || offlineSyncService.getPendingCount() === 0) return;
      const report = await offlineSyncService.syncPendingOutbox();
      const synced = report.syncedPatients + report.syncedAttachments;
      if (!cancelled && synced > 0) {
        notify.success(`${synced} saved item${synced > 1 ? 's' : ''} synced to the server.`);
      }
    };

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void run();
    });
    const timer = setInterval(() => void run(), SYNC_INTERVAL_MS);
    void run();

    return () => {
      cancelled = true;
      unsubscribeNet();
      clearInterval(timer);
    };
  }, []);

  return null;
}
