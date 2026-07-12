import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';
import { scheduleLocalNotification } from 'services/notifications/notificationService';
import { safeAwait } from 'utils/safe';

export function useOTAUpdate() {
  useEffect(() => {
    async function onFetchUpdateAsync() {
      const [update, error] = await safeAwait(Updates.checkForUpdateAsync());

      if (error) {
        console.error('Error fetching latest Expo update:', error);
        return;
      }

      if (update?.isAvailable) {
        await safeAwait(Updates.fetchUpdateAsync());

        // Show an in-app alert informing the user
        Alert.alert(
          'Update Available',
          'A new version of the app has been downloaded. Would you like to restart the app to apply the update now?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Restart',
              onPress: () => {
                Updates.reloadAsync();
              },
            },
          ]
        );

        // Schedule a local push notification if they choose 'Later'
        await safeAwait(scheduleLocalNotification(
          'App Update Available',
          'A new update has been downloaded. You can apply it anytime in Settings.',
          { route: 'SettingsScreen', type: 'system', category: 'system' }
        ));
      }
    }

    if (!__DEV__) {
      onFetchUpdateAsync();
    }
  }, []);
}
