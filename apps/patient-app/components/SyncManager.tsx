import { useAuth } from '../contexts/AuthContext';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { syncFullProfile } from '../services/api/syncService';
import { registerSyncTrigger } from '../db/index';

const PERIODIC_SYNC_INTERVAL_MS = 60_000; // Poll server every 60s while active to catch other devices' changes
const WRITE_DEBOUNCE_MS = 1_000; // 1s debounce to batch rapid local writes

/**
 * Global background sync coordinator for the patient app.
 *
 * Provides resilient, standardized two-way sync:
 * 1. Initial sync on startup / authentication.
 * 2. Automatic push + pull on local database mutations (debounced).
 * 3. Immediate sync on network reconnection.
 * 4. Multi-device sync: pulls changes made on other devices whenever the app
 *    or browser tab is focused / brought to foreground.
 * 5. Periodic background polling while active and online.
 */
export default function SyncManager() {
  const { getToken, internalPatientId } = useAuth();
  const getTokenRef = useRef(getToken);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!internalPatientId) return;

    const runSync = () => {
      syncFullProfile(internalPatientId, getTokenRef.current).catch((err) => {
        console.warn('[SyncManager] Profile sync cycle failed:', err);
      });
    };

    const triggerDebouncedSync = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        runSync();
      }, WRITE_DEBOUNCE_MS);
    };

    // 1. Register with DB interceptor for auto-sync on local writes
    registerSyncTrigger(triggerDebouncedSync);

    // 2. Initial two-way sync on mount / authentication
    runSync();

    // 3. Network connection listener: sync when device comes online
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        runSync();
      }
    });

    // 4. AppState / Window focus listener: sync when app/tab becomes active (multi-device synchronization)
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        runSync();
      }
    });

    let webFocusHandler: (() => void) | null = null;
    let webVisibilityHandler: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      webFocusHandler = () => {
        runSync();
      };
      webVisibilityHandler = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          runSync();
        }
      };
      window.addEventListener('focus', webFocusHandler);
      document.addEventListener('visibilitychange', webVisibilityHandler);
    }

    // 5. Periodic polling interval: sync every 60s while active to catch other devices' updates
    const intervalTimer = setInterval(() => {
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden) {
        return; // skip periodic sync if browser tab is hidden
      }
      runSync();
    }, PERIODIC_SYNC_INTERVAL_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      clearInterval(intervalTimer);
      unsubscribeNet();
      appStateSub.remove();
      if (webFocusHandler && typeof window !== 'undefined') {
        window.removeEventListener('focus', webFocusHandler);
      }
      if (webVisibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', webVisibilityHandler);
      }
      registerSyncTrigger(null);
    };
  }, [internalPatientId]);

  return null;
}
