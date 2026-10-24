import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';

export interface RecordsSyncBannerProps {
  patientId?: string;
  pendingCount?: number;
  failedCount?: number;
  isSyncing?: boolean;
  onSync?: () => void;
  onRetryFailed?: () => void;
}

export const RecordsSyncBanner: React.FC<RecordsSyncBannerProps> = ({
  pendingCount = 0,
  failedCount = 0,
  isSyncing = false,
  onSync,
  onRetryFailed,
}) => {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const netInfo = useNetInfo();

  // Web connectivity detection
  const [webOnline, setWebOnline] = useState(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleOnline = () => setWebOnline(true);
    const handleOffline = () => setWebOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isWeb = Platform.OS === 'web';
  const isOffline = isWeb ? !webOnline : netInfo.isConnected === false;
  const horizontalMargin = isWeb ? 0 : spacing.lg;

  // 1. Offline Mode Priority
  if (isOffline) {
    return (
      <View
        style={[
          styles.banner,
          {
            backgroundColor: colors.warningBg,
            borderColor: colors.warningBorder,
            borderWidth: sizes.borderWidth,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            marginHorizontal: horizontalMargin,
            marginBottom: spacing.sm,
          },
        ]}
      >
        <AppIcon name="wifiOff" size={sizes.iconSm} color="warningText" />
        <ThemedText variant="captionBold" color="warningText" style={styles.flex}>
          Offline Mode — Showing cached health records. Uploads will sync once reconnected.
        </ThemedText>
      </View>
    );
  }

  // 2. Failed Uploads Alert with Retry CTA
  if (failedCount > 0) {
    return (
      <View
        style={[
          styles.banner,
          {
            backgroundColor: colors.emergencyBg,
            borderColor: colors.emergencyBorder,
            borderWidth: sizes.borderWidth,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            marginHorizontal: horizontalMargin,
            marginBottom: spacing.sm,
          },
        ]}
      >
        <AppIcon name="alert" size={sizes.iconSm} color="emergencyText" />
        <ThemedText variant="captionBold" color="emergencyText" style={styles.flex}>
          {failedCount} upload{failedCount === 1 ? '' : 's'} failed to sync
        </ThemedText>
        {onRetryFailed && (
          <TouchableOpacity
            onPress={onRetryFailed}
            disabled={isSyncing}
            style={[
              styles.actionButton,
              {
                backgroundColor: colors.card,
                borderColor: colors.emergencyBorder,
                borderWidth: sizes.borderWidth,
                borderRadius: radii.sm,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
              },
            ]}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={colors.emergencyText} />
            ) : (
              <ThemedText variant="captionBold" color="emergencyText">
                Retry Now
              </ThemedText>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // 3. Pending Uploads Alert
  if (pendingCount > 0) {
    return (
      <View
        style={[
          styles.banner,
          {
            backgroundColor: colors.infoBg,
            borderColor: colors.infoBorder,
            borderWidth: sizes.borderWidth,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            marginHorizontal: horizontalMargin,
            marginBottom: spacing.sm,
          },
        ]}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={colors.infoText} />
        ) : (
          <AppIcon name="cloud" size={sizes.iconSm} color="infoText" />
        )}
        <ThemedText variant="captionBold" color="infoText" style={styles.flex}>
          {isSyncing
            ? 'Syncing records with cloud…'
            : `${pendingCount} record${pendingCount === 1 ? '' : 's'} waiting to sync`}
        </ThemedText>
        {!isSyncing && onSync && (
          <TouchableOpacity
            onPress={onSync}
            style={[
              styles.actionButton,
              {
                backgroundColor: colors.card,
                borderColor: colors.infoBorder,
                borderWidth: sizes.borderWidth,
                borderRadius: radii.sm,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
              },
            ]}
          >
            <ThemedText variant="captionBold" color="infoText">
              Sync Now
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return null;
};

export default RecordsSyncBanner;

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
