import React from 'react';
import { View, StyleSheet, Pressable, ViewStyle, ScrollView } from 'react-native';
import ThemedText from './ThemedText';
import { theme } from '../../constants/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional count shown after the label (e.g. queue filter totals or loaded/total like "50/5000"). */
  count?: number | string;
  /** Optional semantic badge variant for the count pill (default: 'primary' when active, 'neutral' when inactive). */
  badgeVariant?: 'primary' | 'emergency' | 'warning' | 'neutral';
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
}

/**
 * Single-select pill group used for page-level tabs and list filters.
 * Scrolls horizontally when the options do not fit (phones).
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, style]}
      contentContainerStyle={styles.track}
    >
      <View style={styles.group} accessibilityRole="tablist">
        {options.map((option) => {
          const active = option.value === value;
          const isEmergency = option.badgeVariant === 'emergency';
          const isWarning = option.badgeVariant === 'warning';

          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                option.count !== undefined && option.count !== null
                  ? `${option.label}, ${option.count}`
                  : option.label
              }
              style={({ pressed }) => [
                styles.segment,
                active && styles.segmentActive,
                pressed && !active && styles.segmentPressed,
              ]}
            >
              <ThemedText
                variant="smallBold"
                color={active ? theme.colors.text : theme.colors.textSecondary}
              >
                {option.label}
              </ThemedText>
              {option.count !== undefined && option.count !== null ? (
                <View
                  style={[
                    styles.countBadge,
                    active ? styles.countBadgeActive : styles.countBadgeInactive,
                    isEmergency && (active ? styles.countBadgeEmergencyActive : styles.countBadgeEmergency),
                    isWarning && (active ? styles.countBadgeWarningActive : styles.countBadgeWarning),
                  ]}
                >
                  <ThemedText
                    variant="badge"
                    style={[
                      styles.countText,
                      active ? styles.countTextActive : styles.countTextInactive,
                      isEmergency && (active ? styles.countTextEmergencyActive : styles.countTextEmergency),
                      isWarning && (active ? styles.countTextWarningActive : styles.countTextWarning),
                    ]}
                  >
                    {option.count}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  track: {
    flexGrow: 1,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  segment: {
    minHeight: theme.sizes.controlSm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  segmentActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  segmentPressed: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
  },
  countBadgeActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
  },
  countBadgeInactive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  countBadgeEmergency: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  countBadgeEmergencyActive: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergency,
  },
  countBadgeWarning: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  countBadgeWarningActive: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warning,
  },
  countText: {
    fontVariant: ['tabular-nums'],
  },
  countTextActive: {
    color: theme.colors.primaryDark,
  },
  countTextInactive: {
    color: theme.colors.textSecondary,
  },
  countTextEmergency: {
    color: theme.colors.emergencyText,
  },
  countTextEmergencyActive: {
    color: theme.colors.emergency,
  },
  countTextWarning: {
    color: theme.colors.warningText,
  },
  countTextWarningActive: {
    color: theme.colors.warning,
  },
});
