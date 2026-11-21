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
    // 1. Immediately revalidate local SQLite state for 0ms visual responsiveness
    await mutate();

    // 2. Perform network sync: pull remote changes from other devices, drain upload queue
    if (!isRefreshingRef.current) {
      isRefreshingRef.current = true;
      try {
        await syncPendingFiles(patientId, getToken, true);
      } catch (e) {
        console.warn('[useFilesBrowser] Background sync error:', e);
      } finally {
        isRefreshingRef.current = false;
      }
    }

    // 3. Re-read SQLite after remote sync has reconciled to display new/deleted files
    return mutate();
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
