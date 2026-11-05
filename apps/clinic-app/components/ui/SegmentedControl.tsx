import React from 'react';
import { View, StyleSheet, Pressable, ViewStyle, ScrollView, Platform } from 'react-native';
import ThemedText from './ThemedText';
import Icon, { type IconName } from './Icon';
import { theme } from '../../constants/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional icon rendered inside the segment (alone when iconOnly is true, or before label). */
  icon?: IconName;
  /** When true, hides the visible text label and renders a compact icon-only segment using `label` for accessibility and hover tooltip. */
  iconOnly?: boolean;
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
 * Scrolls horizontally without wrapping when the options exceed available width.
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
          const isIconOnly = Boolean(option.iconOnly && option.icon);
          const a11yLabel =
            option.count !== undefined && option.count !== null
              ? `${option.label}, ${option.count}`
              : option.label;

          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={a11yLabel}
              {...(Platform.OS === 'web' && isIconOnly
                ? ({ title: option.label } as Record<string, unknown>)
                : {})}
              style={({ pressed }) => [
                styles.segment,
                isIconOnly && styles.segmentIconOnly,
                active && styles.segmentActive,
                pressed && !active && styles.segmentPressed,
              ]}
            >
              {option.icon ? (
                <Icon
                  name={option.icon}
                  size={theme.sizes.iconSm}
                  color={active ? theme.colors.text : theme.colors.textSecondary}
                />
              ) : null}
              {!isIconOnly ? (
                <ThemedText
                  variant="smallBold"
                  numberOfLines={1}
                  style={styles.labelText}
                  color={active ? theme.colors.text : theme.colors.textSecondary}
                >
                  {option.label}
                </ThemedText>
              ) : null}
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
                    numberOfLines={1}
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
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  track: {
    flexGrow: 0,
  },
  group: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    flexShrink: 0,
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
    flexWrap: 'nowrap',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  segmentIconOnly: {
    minWidth: theme.sizes.controlSm,
    paddingHorizontal: theme.spacing.sm,
  },
  labelText: {
    flexShrink: 0,
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
