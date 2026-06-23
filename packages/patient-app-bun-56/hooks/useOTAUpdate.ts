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
          'A new version of the app has been downloaded. Would you like to go to Settings to apply the update?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to Settings',
              onPress: () => {
                const { navigationRef } = require('navigation/Navigation');
                if (navigationRef.isReady()) {
                  navigationRef.navigate('Main', { screen: 'SettingsScreen' });
                }
              },
            },
          ]
        );

        // Schedule a local push notification
        // This will also be saved to the notification inbox as 'system' because of NotificationContext
        await safeAwait(scheduleLocalNotification(
          'App Update Available',
          'A new update has been downloaded. Tap here to go to settings and apply it.',
          { route: 'SettingsScreen', type: 'system', category: 'system' }
        ));
      }
    }

    if (!__DEV__) {
      onFetchUpdateAsync();
    }
  }, []);
}
