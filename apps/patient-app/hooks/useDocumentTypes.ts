import useSWR from 'swr';
import { useCallback } from 'react';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { getActiveDocumentTypes, refreshDocumentTypes } from '../services/files/filesService';

/**
 * Offline-first hook for active backend `DocumentType` rows:
 * 1. Immediately returns locally cached SQLite `document_types` rows (0ms latency, works offline).
 * 2. Syncs `GET /api/v1/document-types` from the backend in the background on mount, focus, and
 *    network reconnect, reconciling local SQLite and updating the UI whenever backend types change.
 */
export function useDocumentTypes(patientId: string) {
  const { getToken } = useClerkAuth();

  const { data, error, mutate, isValidating } = useSWR(
    ['document-types', patientId],
    async () => {
      const cached = await getActiveDocumentTypes();

      // Background refresh from backend so local SQLite stays aligned with backend changes
      void refreshDocumentTypes(patientId, getToken)
        .then((allSynced) => {
          const activeSynced = allSynced.filter((row) => row.isActive);
          void mutate(activeSynced, { revalidate: false });
        })
        .catch(() => {});

      return cached;
    },
    {
      keepPreviousData: true,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  const refresh = useCallback(async () => {
    const allSynced = await refreshDocumentTypes(patientId, getToken, { force: true });
    const activeSynced = allSynced.filter((row) => row.isActive);
    await mutate(activeSynced, { revalidate: false });
    return activeSynced;
  }, [patientId, getToken, mutate]);

  return {
    documentTypes: data ?? [],
    isLoading: !data && !error,
    isRefreshing: isValidating,
    error,
    refresh,
  };
}
