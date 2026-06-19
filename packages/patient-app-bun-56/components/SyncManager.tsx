import { useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncPendingProfileWrites } from '../services/api/syncService';
import { registerSyncTrigger } from '../db/index';

export default function SyncManager() {
  const { getToken, internalPatientId } = useAuth();

  useEffect(() => {
    if (!internalPatientId) return;

    // Trigger sync function
    const triggerSync = () => {
      syncPendingProfileWrites(internalPatientId, getToken).catch((err) => {
        console.warn('[SyncManager] Background profile sync failed:', err);
      });
    };

    // Register with DB interceptor for instant sync on writes
    registerSyncTrigger(triggerSync);

    // Run sync on mount / authentication
    triggerSync();

    // Set up connection listener
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        console.log('[SyncManager] Network connected. Triggering profile sync...');
        triggerSync();
      }
    });

    return () => {
      unsubscribe();
      registerSyncTrigger(null);
    };
  }, [internalPatientId, getToken]);

  return null;
}
