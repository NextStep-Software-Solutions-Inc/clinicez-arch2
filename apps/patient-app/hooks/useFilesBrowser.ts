import useSWR from 'swr';
import { useCallback } from 'react';
import { useAuth as useClerkAuth } from '@clerk/expo';
import {
  listFolderContents,
  refreshDocumentTypes,
  syncPendingFiles,
} from '../services/files/filesService';

export function useFilesBrowser(patientId: string, folderId: string | null = null, query: string = '') {
  const { getToken } = useClerkAuth();

  const { data, error, mutate, isValidating } = useSWR(
    ['files-browser', patientId, folderId, query],
    async () => {
      // Fire-and-forget network sync so it doesn't block the instant SQLite read.
      // This enforces the offline-first architecture.
      refreshDocumentTypes(patientId, getToken).catch(console.log);
      
      // Silently sync down remote files (and push local queue) without blocking the UI
      syncPendingFiles(patientId, getToken)
        .then(() => mutate())
        .catch(console.log);

      // Instantly load from local SQLite
      return listFolderContents(patientId, folderId, query, getToken);
    },
    {
      keepPreviousData: true, // Prevents flashing empty state while typing in search
    }
  );

  const refresh = useCallback(async () => {
    // Optimistically update the UI by reading the latest SQLite state immediately
    const mutatePromise = mutate();
    
    // Force retry failed files on manual pull-to-refresh (don't block the UI)
    syncPendingFiles(patientId, getToken, true)
      .then(() => mutate()) // Mutate again after network sync completes
      .catch(console.log);

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
