import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export interface HomeOfflinePillBannerProps {
  isOnline: boolean;
  bottomOffset?: number;
}

function HomeOfflinePillBannerComponent({
  isOnline,
  bottomOffset = 10,
}: HomeOfflinePillBannerProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  if (isOnline) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.outerWrap,
        {
          bottom: bottomOffset,
          paddingHorizontal: spacing.lg,
        },
      ]}
    >
      <View
        style={[
          styles.pill,
          elevation.floatingBanner,
          {
            backgroundColor: colors.inverseSurface,
            borderRadius: radii.full,
            paddingHorizontal: spacing.base,
            paddingVertical: spacing.sm,
          },
        ]}
      >
        <View style={[styles.leftCluster, { gap: spacing.sm }]}>
          <AppIcon name="cloudOff" size={16} color={colors.inverseAccent} />
          <Text style={[typography.bodySmMedium, { color: colors.inverseText }]}>
            No network connection
          </Text>
        </View>

        <Text style={[typography.overline, { color: colors.inverseAccent }]}>OFFLINE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: 'center',
  },
  pill: {
    width: '100%',
    maxWidth: 560,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export const HomeOfflinePillBanner = memo(HomeOfflinePillBannerComponent);
export default HomeOfflinePillBanner;
