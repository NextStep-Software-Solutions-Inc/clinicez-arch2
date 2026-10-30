import { useEffect } from 'react';
import { Alert } from 'react-native';
import { safeAwait } from '@shared/safe';

function getUpdatesModule(): typeof import('expo-updates') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-updates');
  } catch {
    return null;
  }
}

let attemptedUpdateId: string | null = null;

/**
 * Checks for and automatically downloads over-the-air (OTA) updates on standalone native apps.
 * In development builds (__DEV__), expo-updates does not query the remote channel.
 */
export function useOTAUpdate() {
  useEffect(() => {
    async function onFetchUpdateAsync() {
      const Updates = getUpdatesModule();
      if (!Updates || !Updates.isEnabled) return;

      if ((Updates as any).isEmergencyLaunch) {
        console.warn(
          '[useOTAUpdate] Emergency fallback launch detected. Suppressing auto-update to prevent restart loop:',
          (Updates as any).emergencyLaunchReason
        );
        return;
      }

      const [update, error] = await safeAwait(Updates.checkForUpdateAsync());

      if (error) {
        // In local network testing or offline mode, non-fatal
        return;
      }

      if (update?.isAvailable) {
        const candidateId = update.manifest?.id;
        if (candidateId && candidateId === Updates.updateId) {
          return;
        }
        if (candidateId && candidateId === attemptedUpdateId) {
          console.warn(
            `[useOTAUpdate] Update ${candidateId} was already attempted and did not take effect. Skipping repeated prompt.`
          );
          return;
        }

        const [fetchResult, fetchError] = await safeAwait(Updates.fetchUpdateAsync());
        if (fetchError) {
          return;
        }

        if (fetchResult && !(fetchResult as any).isNew) {
          return;
        }

        const updateToActivate = fetchResult?.manifest?.id ?? candidateId;

        Alert.alert(
          'Update Available',
          'A new version of the Clinic app has been downloaded. Would you like to restart the app to apply the update now?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Restart',
              onPress: async () => {
                if (updateToActivate) {
                  attemptedUpdateId = updateToActivate;
                }
                try {
                  await Updates.reloadAsync();
                } catch (reloadErr) {
                  console.warn('[useOTAUpdate] reloadAsync failed:', reloadErr);
                }
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
