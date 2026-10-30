import useSWR from 'swr';
import { useCallback, useEffect, useRef } from 'react';
import { useAuth as useClerkAuth } from '@clerk/expo';
import {
  listFolderContents,
  refreshDocumentTypes,
  syncPendingFiles,
} from '../services/files/filesService';

export function useFilesBrowser(patientId: string, folderId: string | null = null, query: string = '') {
  const { getToken } = useClerkAuth();
  const hasSyncedRef = useRef(false);
  const isRefreshingRef = useRef(false);

  const { data, error, mutate, isValidating } = useSWR(
    ['files-browser', patientId, folderId, query],
    async () => {
      // Instantly load from local SQLite (pure read, no infinite mutate loops)
      return listFolderContents(patientId, folderId, query, getToken);
    },
    {
      keepPreviousData: true, // Prevents flashing empty state while typing in search
    }
  );

  // Background network sync once on mount per patient
  useEffect(() => {
    if (!patientId || hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    refreshDocumentTypes(patientId, getToken).catch(console.log);
    syncPendingFiles(patientId, getToken)
      .then((res) => {
        if (res && res.synced > 0) {
          mutate();
        }
      })
      .catch(console.log);
  }, [patientId, getToken, mutate]);

  const refresh = useCallback(async () => {
    // Optimistically update the UI by reading the latest SQLite state immediately
    const mutatePromise = mutate();

    if (!isRefreshingRef.current) {
      isRefreshingRef.current = true;
      syncPendingFiles(patientId, getToken, true)
        .then((res) => {
          if (res && res.synced > 0) {
            mutate();
          }
        })
        .catch(console.log)
        .finally(() => {
          isRefreshingRef.current = false;
        });
    }

    return mutatePromise;
  }, [mutate, patientId, getToken]);

  return {
    contents: data,
    isLoading: !data && !error,
    isRefreshing: isValidating,
    error,
    refresh,
    mutate,
  };
}
