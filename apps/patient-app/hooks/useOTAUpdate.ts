import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { scheduleLocalNotification } from 'services/notifications/notificationService';
import { safeAwait } from '@shared/safe';
import { dialog } from '@utils/dialog';

export interface OTAUpdateInfo {
  channel: string;
  runtimeVersion: string;
  updateId: string | null;
  isAvailable: boolean;
  isDownloading: boolean;
  isDownloaded: boolean;
  error: Error | null;
  isProduction: boolean;
  isNonProduction: boolean;
  isChecking: boolean;
  checkForUpdate: () => Promise<void>;
  downloadAndReload: () => Promise<void>;
}

let attemptedUpdateId: string | null = null;

export function useOTAUpdate(): OTAUpdateInfo {
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Derive channel from expo-updates or fallback to config extra / environment
  const channel =
    Updates.channel ??
    (Constants.expoConfig?.extra?.channel as string | undefined) ??
    (process.env.APP_BRANCH
      ? `br-${process.env.APP_BRANCH.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
      : 'production');

  const isProduction = channel === 'production' && !__DEV__;
  const isNonProduction = !isProduction;
  const runtimeVersion =
    typeof Updates.runtimeVersion === 'string'
      ? Updates.runtimeVersion
      : (Constants.expoConfig?.version ?? '1.0.0');
  const updateId = Updates.updateId ?? null;

  const downloadAndReload = useCallback(async (targetCandidateId?: string) => {
    if (!Updates.isEnabled || Platform.OS === 'web') return;
    setIsDownloading(true);
    const [fetchResult, fetchError] = await safeAwait(Updates.fetchUpdateAsync());
    setIsDownloading(false);

    if (fetchError) {
      const err = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      setError(err);
      console.warn('[useOTAUpdate] Failed to download update:', fetchError);
      dialog.alert(
        'Update Failed',
        'Unable to download the update. Please check your connection and try again.'
      );
      return;
    }

    if (fetchResult && !fetchResult.isNew) {
      console.log('[useOTAUpdate] Downloaded update is not newer than current bundle.');
      return;
    }

    setIsDownloaded(true);
    setError(null);

    const updateToActivate = fetchResult?.manifest?.id ?? targetCandidateId;

    dialog.alert(
      'Update Ready',
      'The update has been downloaded. Restart the app now to apply the changes.',
      [
        {
          text: 'Later',
          style: 'cancel',
          onPress: async () => {
            await safeAwait(
              scheduleLocalNotification(
                'App Update Available',
                'A new update has been downloaded. You can apply it anytime in Settings.',
                { route: 'SettingsScreen', type: 'system', category: 'system' }
              )
            );
          },
        },
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
      ]
    );
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!Updates.isEnabled || __DEV__ || Platform.OS === 'web') return;

    if (Updates.isEmergencyLaunch) {
      console.warn(
        '[useOTAUpdate] Emergency fallback launch detected. Suppressing auto-update to prevent restart loop:',
        Updates.emergencyLaunchReason
      );
      return;
    }

    setIsChecking(true);
    const [update, checkError] = await safeAwait(Updates.checkForUpdateAsync());
    setIsChecking(false);

    if (checkError) {
      const err = checkError instanceof Error ? checkError : new Error(String(checkError));
      setError(err);
      // Non-fatal during offline clinical usage or intermittent connectivity
      console.warn('[useOTAUpdate] Non-fatal update check failure:', checkError);
      return;
    }

    if (update?.isAvailable) {
      const candidateId = update.manifest?.id;
      if (candidateId && candidateId === Updates.updateId) {
        setIsAvailable(false);
        return;
      }
      if (candidateId && candidateId === attemptedUpdateId) {
        console.warn(
          `[useOTAUpdate] Update ${candidateId} was already attempted and did not take effect. Skipping repeated prompt.`
        );
        setIsAvailable(false);
        return;
      }

      setIsAvailable(true);
      setError(null);
      await downloadAndReload(candidateId);
    } else {
      setIsAvailable(false);
    }
  }, [downloadAndReload]);

  useEffect(() => {
    if (Updates.isEnabled && !__DEV__ && Platform.OS !== 'web') {
      void checkForUpdate();
    }
  }, [checkForUpdate]);

  return {
    channel,
    runtimeVersion,
    updateId,
    isAvailable,
    isDownloading,
    isDownloaded,
    error,
    isProduction,
    isNonProduction,
    isChecking,
    checkForUpdate,
    downloadAndReload,
  };
}
