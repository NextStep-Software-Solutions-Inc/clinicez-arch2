import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View, ViewStyle, DimensionValue } from 'react-native';
import { theme } from '../../constants/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/** Pulsing placeholder block shown while real data loads (replaces fake sample data). */
export function Skeleton({
  width = '100%',
  height = theme.spacing.lg,
  radius = theme.radii.sm,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.colors.surfaceHighlight, opacity },
        style,
      ]}
    />
  );
}

/** A stack of skeleton rows, e.g. for a loading list. */
export function SkeletonList({ rows = 4, rowHeight = theme.sizes.controlLg }: { rows?: number; rowHeight?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} height={rowHeight} radius={theme.radii.md} />
      ))}
    </View>
  );
}

/** Skeleton shaped like a StatCard. */
export function SkeletonStat({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.stat, style]}>
      <Skeleton width="50%" height={theme.fontSizes.xs} />
      <Skeleton width="35%" height={theme.fontSizes['3xl']} radius={theme.radii.sm} />
      <Skeleton width="70%" height={theme.fontSizes.xs} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.sm,
  },
  stat: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    minWidth: 140,
    gap: theme.spacing.sm,
  },
});

export default Skeleton;
