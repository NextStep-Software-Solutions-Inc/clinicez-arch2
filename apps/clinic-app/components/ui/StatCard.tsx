import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import ThemedText from './ThemedText';
import { theme } from '../../constants/theme';

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
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
  return (
    <View style={[styles.card, style]}>
      <View style={styles.topRow}>
        <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.label}>
          {label}
        </ThemedText>
        {icon ? <ThemedText style={styles.icon}>{icon}</ThemedText> : null}
      </View>

      <ThemedText
        variant="h1"
        style={[styles.value, valueColor ? { color: valueColor } : {}]}
      >
        {value}
      </ThemedText>

      <View style={styles.bottomRow}>
        {trend ? (
          <ThemedText
            variant="captionBold"
            style={[
              styles.trendText,
              { color: trend.isPositive ? theme.colors.success : theme.colors.emergency },
            ]}
          >
            {trend.isPositive ? '↑' : '↓'} {trend.value}{' '}
          </ThemedText>
        ) : null}

        {subtext ? (
          <ThemedText variant="caption" color={theme.colors.textLight} numberOfLines={1}>
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
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 120,
    gap: 4,
    ...theme.shadows.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  icon: {
    fontSize: 16,
  },
  value: {
    color: theme.colors.text,
    marginVertical: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendText: {
    fontSize: 11,
  },
});
