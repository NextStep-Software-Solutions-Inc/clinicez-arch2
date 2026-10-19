import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import ThemedView from './ThemedView';
import { useAppTheme } from '../../contexts/ThemeContext';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps) {
  const { colors, radii } = useAppTheme();
  return (
    <ThemedView
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius ?? radii.md,
          backgroundColor: colors.skeletonBase,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  const { colors, radii, spacing } = useAppTheme();
  return (
    <ThemedView
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.lg,
          padding: spacing.lg,
          gap: spacing.md,
        },
      ]}
    >
      <Skeleton height={18} width="62%" />
      <Skeleton height={12} width="86%" />
      <Skeleton height={12} width="72%" />
      <ThemedView style={[styles.row, { gap: spacing.md }]}>
        <Skeleton height={36} width="48%" radius={radii.md} />
        <Skeleton height={36} width="48%" radius={radii.md} />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    marginTop: 4,
  },
});
