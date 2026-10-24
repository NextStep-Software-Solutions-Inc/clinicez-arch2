import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from './ThemedText';

export interface FilterChipItem<T extends string = string> {
  key: T;
  label: string;
  count?: number;
}

export interface FilterChipBarProps<T extends string = string> {
  items: ReadonlyArray<FilterChipItem<T>>;
  selectedKey: T;
  onSelect: (key: T) => void;
  /** Render `(0)` when `count === 0`. Defaults to false (only renders count when > 0). */
  showZeroCount?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Shared horizontally-scrollable filter chip strip used across Notifications,
 * Appointments, Health Records, and directory screens.
 *
 * Uses zero internal vertical padding by default so top and bottom spacing
 * around the chip bar are 100% symmetrical and controlled by parent layout.
 */
export function FilterChipBar<T extends string = string>({
  items,
  selectedKey,
  onSelect,
  showZeroCount = false,
  style,
  contentContainerStyle,
}: FilterChipBarProps<T>) {
  const { colors, spacing, radii, sizes } = useAppTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      style={[styles.scroll, style]}
      contentContainerStyle={[styles.row, { gap: spacing.sm }, contentContainerStyle]}
    >
      {items.map((item) => {
        const isActive = item.key === selectedKey;
        const hasCount =
          item.count !== undefined && (showZeroCount ? item.count >= 0 : item.count > 0);
        const displayLabel = hasCount ? `${item.label} (${item.count})` : item.label;

        return (
          <Pressable
            key={item.key}
            onPress={() => onSelect(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={(state) => {
              const hovered = !!(state as { hovered?: boolean }).hovered;
              return [
                styles.chip,
                {
                  backgroundColor: isActive
                    ? colors.primary
                    : hovered
                      ? colors.surfaceSubtle
                      : colors.card,
                  borderColor: isActive ? colors.primary : colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  opacity: state.pressed ? 0.85 : 1,
                },
              ];
            }}
          >
            <ThemedText
              variant="smallBold"
              numberOfLines={1}
              color={isActive ? 'onPrimary' : 'textSecondary'}
            >
              {displayLabel}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default FilterChipBar;

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    maxWidth: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
