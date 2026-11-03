import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface DailyMindfulMomentProps {
  tip?: string;
}

export default function DailyMindfulMoment({
  tip = 'Hydration check: drinking 500ml water after lunch helps stabilize cardiovascular pressure.',
}: DailyMindfulMomentProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: colors.surfaceSubtle,
          borderColor: colors.borderLight,
          borderWidth: sizes.borderWidth,
          borderRadius: radii.xl,
          padding: spacing.lg,
          gap: spacing.md,
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: colors.primaryLight,
            borderRadius: radii.md,
          },
        ]}
      >
        <AppIcon name="wellness" size={sizes.iconLg} color="primary" />
      </View>
      <View style={[styles.content, { gap: spacing.xs }]}>
        <ThemedText variant="captionBold" color="primaryText" style={styles.trackingWide}>
          DAILY MINDFUL MOMENT
        </ThemedText>
        <ThemedText variant="small" color="text">
          {tip}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  trackingWide: {
    letterSpacing: 0.8,
  },
});
