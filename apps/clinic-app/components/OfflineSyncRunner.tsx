import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { offlineSyncService } from '../services/offlineSyncService';
import { notify } from '../utils/feedback';

/** How often queued items are retried while the app is active (items in backoff are skipped until due). */
const SYNC_INTERVAL_MS = 60_000;

/**
 * Renders nothing. While a signed-in session is open it drains the offline outbox whenever the device regains
 * connectivity and on a timer, so "it will sync automatically" is actually true.
 * Automatically halts timer when backgrounded to prevent battery drain and wake locks.
 */
export function OfflineSyncRunner() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let isAppActive = AppState.currentState === 'active';

    const run = async () => {
      if (cancelled || !isAppActive || offlineSyncService.getPendingCount() === 0) return;
      const report = await offlineSyncService.syncPendingOutbox();
      const synced = report.syncedPatients + report.syncedAttachments;
      if (!cancelled && synced > 0) {
        notify.success(`${synced} saved item${synced > 1 ? 's' : ''} synced to the server.`);
      }
    };

    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => void run(), SYNC_INTERVAL_MS);
    };

    const stopTimer = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false && isAppActive) {
        void run();
      }
    });

    const handleAppState = (nextState: AppStateStatus) => {
      isAppActive = nextState === 'active';
      if (isAppActive) {
        void run();
        startTimer();
      } else {
        stopTimer();
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppState);

    if (isAppActive) {
      startTimer();
      void run();
    }

    return () => {
      cancelled = true;
      stopTimer();
      unsubscribeNet();
      appStateSub.remove();
    };
  }, []);

  return null;
}
