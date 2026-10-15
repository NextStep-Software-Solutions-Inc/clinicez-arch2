import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';
import { safeAwait } from '@shared/safe';

/**
 * Checks for and automatically downloads over-the-air (OTA) updates on standalone native apps.
 * In development builds (__DEV__), expo-updates does not query the remote channel.
 */
export function useOTAUpdate() {
  useEffect(() => {
    async function onFetchUpdateAsync() {
      const [update, error] = await safeAwait(Updates.checkForUpdateAsync());

      if (error) {
        // In local network testing or offline mode, non-fatal
        return;
      }

      if (update?.isAvailable) {
        const [, fetchError] = await safeAwait(Updates.fetchUpdateAsync());
        if (fetchError) {
          return;
        }

        Alert.alert(
          'Update Available',
          'A new version of the Clinic app has been downloaded. Would you like to restart the app to apply the update now?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Restart',
              onPress: () => {
                Updates.reloadAsync();
              },
            },
          ],
        );
      }
    }

    if (!__DEV__) {
      onFetchUpdateAsync();
    }
  }, []);
}
