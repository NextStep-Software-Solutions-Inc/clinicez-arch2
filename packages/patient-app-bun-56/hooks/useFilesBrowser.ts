import useSWR from 'swr';
import { useCallback, useEffect } from 'react';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useNavigation } from '@react-navigation/native';
import { listFolderContents, refreshFileTypes } from '../services/files/filesService';
import { initializeMakAndFrkIfNeeded } from '../services/files/frkService';

export function useFrkCheck(patientId: string) {
  const { getToken } = useClerkAuth();
  const navigation = useNavigation();

  useEffect(() => {
    let active = true;
    initializeMakAndFrkIfNeeded(patientId, getToken)
      .then((res) => {
        if (!active) return;
        if (res.status === 'generated') {
          navigation.navigate('Main', {
            screen: 'BottomTabs',
            params: {
              screen: 'FilesScreen',
              params: {
                screen: 'FRKSetupScreen',
                params: { frk: res.frk },
              },
            },
          });
        } else if (res.status === 'needs_frk') {
          navigation.navigate('Main', {
            screen: 'BottomTabs',
            params: {
              screen: 'FilesScreen',
              params: {
                screen: 'FRKEntryScreen',
                params: { encryptedMAK: res.encryptedMAK },
              },
            },
          });
        }
      })
      .catch((err) => console.log('FRK check failed:', err));

    return () => {
      active = false;
    };
  }, [patientId, getToken, navigation]);
}

export function useFilesBrowser(patientId: string, folderId: string | null, query: string = '') {
  const { getToken } = useClerkAuth();

  const { data, error, mutate, isValidating } = useSWR(
    ['files-browser', patientId, folderId, query],
    async () => {
      // Fire-and-forget network sync so it doesn't block the instant SQLite read.
      // This enforces the offline-first architecture.
      refreshFileTypes(patientId, getToken).catch(console.log);

      // Instantly load from local SQLite
      return listFolderContents(patientId, folderId, query, getToken);
    },
    {
      keepPreviousData: true, // Prevents flashing empty state while typing in search
    }
  );

  const refresh = useCallback(() => {
    return mutate();
  }, [mutate]);

  return {
    contents: data,
    isLoading: !data && !error,
    isRefreshing: isValidating,
    error,
    refresh,
  };
}
