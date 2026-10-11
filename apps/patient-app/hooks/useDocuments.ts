import { useCallback, useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from 'contexts/AuthContext';
import { ApiError } from 'services/api/apiClient';
import { DOCUMENTS_SYNCED_EVENT, pullDocumentChanges } from 'services/sync/documentsSyncService';
import { dialog } from '@utils/dialog';
import { usePatientId } from './usePatientId';

export interface LocalQuery<T> {
  data: T;
  /** False until the first local read completed. */
  loaded: boolean;
}

/**
 * Reads synced documents from local SQLite. Reloads when the screen gains focus and whenever a
 * sync stored new rows (`documents-synced`), so screens never fetch over the network themselves.
 */
export function useLocalQuery<T>(
  load: () => Promise<T>,
  initial: T,
  deps: readonly unknown[],
): LocalQuery<T> {
  const [state, setState] = useState<LocalQuery<T>>({ data: initial, loaded: false });

  const reload = useCallback(() => {
    load()
      .then((data) => setState({ data, loaded: true }))
      .catch((err) => console.warn('[useLocalQuery] Failed to read documents:', err));
  }, deps);

  useFocusEffect(reload);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(DOCUMENTS_SYNCED_EVENT, reload);
    return () => subscription.remove();
  }, [reload]);

  return state;
}

/** Pull-to-refresh: runs the incremental document pull and reports progress. */
export function useDocumentsPull() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await pullDocumentChanges(patientId, getToken);
    } catch (err) {
      dialog.alert(
        'Could not refresh',
        err instanceof ApiError ? err.firstMessage : 'Check your connection and try again.',
      );
    } finally {
      setRefreshing(false);
    }
  }, [patientId, getToken]);

  return { refreshing, refresh };
}
