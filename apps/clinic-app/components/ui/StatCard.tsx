import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import ThemedText from './ThemedText';
import Icon, { IconSlot, resolveIconName } from './Icon';
import { theme } from '../../constants/theme';
import { useUiDensity } from '../../context/UiDensityContext';

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  /** IconName (e.g. "patients"). Legacy emoji glyphs are still resolved for old call sites. */
  icon?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  valueColor?: string;
  style?: ViewStyle;
}

export default function StatCard({
  label,
  value,
  subtext,
  icon,
  trend,
  valueColor,
  style,
}: StatCardProps) {
  const { multiplier, cardPadding } = useUiDensity();
  const densityCardStyle =
    multiplier !== 1
      ? {
          padding: cardPadding,
          borderRadius: Math.max(6, Math.round(theme.radii.lg * multiplier)),
          minWidth: Math.max(100, Math.round(140 * multiplier)),
        }
      : null;
  const iconTileDim =
    multiplier !== 1
      ? Math.max(20, Math.round((theme.sizes.controlSm - theme.spacing.xs) * multiplier))
      : theme.sizes.controlSm - theme.spacing.xs;
  const iconSize = multiplier < 0.8 ? 14 : theme.sizes.iconSm;

  return (
    <View style={[styles.card, densityCardStyle, style]}>
      <View style={styles.topRow}>
        <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.label}>
          {label}
        </ThemedText>
        {resolveIconName(icon) ? (
          <View style={[styles.iconTile, multiplier !== 1 && { width: iconTileDim, height: iconTileDim }]}>
            <IconSlot value={icon} size={iconSize} color={theme.colors.primary} />
          </View>
        ) : null}
      </View>

      <ThemedText
        variant="h1"
        style={[styles.value, valueColor ? { color: valueColor } : {}]}
      >
        {value}
      </ThemedText>

      <View style={styles.bottomRow}>
        {trend ? (
          <View style={styles.trend}>
            <Icon
              name={trend.isPositive ? 'arrowUp' : 'arrowDown'}
              size={theme.fontSizes.xs}
              color={trend.isPositive ? theme.colors.success : theme.colors.emergency}
            />
            <ThemedText
              variant="captionBold"
              color={trend.isPositive ? theme.colors.success : theme.colors.emergency}
            >
              {trend.value}
            </ThemedText>
          </View>
        ) : null}

        {subtext ? (
          <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
            {subtext}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    minWidth: 140,
    gap: theme.spacing.xs,
    ...theme.shadows.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  label: {
    flex: 1,
  },
  iconTile: {
    width: theme.sizes.controlSm - theme.spacing.xs,
    height: theme.sizes.controlSm - theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: theme.colors.text,
    marginVertical: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  trend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
