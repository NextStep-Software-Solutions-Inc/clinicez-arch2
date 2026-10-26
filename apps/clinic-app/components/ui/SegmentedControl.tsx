import React from 'react';
import { View, StyleSheet, Pressable, ViewStyle, ScrollView } from 'react-native';
import ThemedText from './ThemedText';
import { theme } from '../../constants/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional count shown after the label (e.g. queue filter totals or loaded/total like "50/5000"). */
  count?: number | string;
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
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
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
                {option.count !== undefined ? `  ${option.count}` : ''}
              </ThemedText>
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
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  segmentPressed: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
});
