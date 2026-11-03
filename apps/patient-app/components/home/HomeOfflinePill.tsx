import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface HomeOfflinePillProps {
  /** Optional override to force-render for testing or offline simulations */
  isOfflineOverride?: boolean;
  /** Bottom offset in pixels from screen bottom */
  bottomOffset?: number;
}

export default function HomeOfflinePill({
  isOfflineOverride,
  bottomOffset = 80,
}: HomeOfflinePillProps) {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();

  const [isOffline, setIsOffline] = useState(() => {
    if (isOfflineOverride !== undefined) return isOfflineOverride;
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return !navigator.onLine;
    }
    return false;
  });

  useEffect(() => {
    if (isOfflineOverride !== undefined) {
      setIsOffline(isOfflineOverride);
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // Native platforms: lazy load NetInfo so non-native / test environments don't trip codegen
    let unsubscribe: (() => void) | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const NetInfo = require('@react-native-community/netinfo');
      if (NetInfo?.addEventListener) {
        unsubscribe = NetInfo.addEventListener((state: any) => {
          setIsOffline(state.isConnected === false);
        });
      }
    } catch {
      // In test or non-native environment
    }

    return () => {
      unsubscribe?.();
    };
  }, [isOfflineOverride]);

  if (!isOffline) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.floatingContainer,
        {
          bottom: bottomOffset,
          paddingHorizontal: spacing.lg,
        },
      ]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.surfaceInverse,
            borderRadius: radii.full,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
          },
          shadows.md,
        ]}
      >
        <View style={[styles.leftGroup, { gap: spacing.xs }]}>
          <AppIcon name="cloudOff" size={sizes.iconSm} color="primaryLight" />
          <ThemedText variant="caption" color="textInverted" numberOfLines={1}>
            No network connection
          </ThemedText>
        </View>

        <View
          style={[
            styles.badgeWrap,
            {
              backgroundColor: colors.transparent,
              marginLeft: spacing.sm,
            },
          ]}
        >
          <ThemedText variant="captionBold" color="primaryLight" style={styles.badgeText}>
            OFFLINE
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 420,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  badgeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
