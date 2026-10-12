import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import Icon from '../ui/Icon';
import ThemedText from '../ui/ThemedText';
import { CHART_LAYOUT_OPTIONS, type ChartLayoutMode } from './types';

interface ChartLayoutSwitcherProps {
  currentLayout: ChartLayoutMode;
  onSwitchLayout: (layout: ChartLayoutMode) => void;
  showLabels?: boolean;
}

export default function ChartLayoutSwitcher({
  currentLayout,
  onSwitchLayout,
  showLabels = false,
}: ChartLayoutSwitcherProps) {
  return (
    <View style={styles.container} accessibilityRole="toolbar" accessibilityLabel="Chart Layout Selector">
      {CHART_LAYOUT_OPTIONS.map((opt) => {
        const isActive = currentLayout === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onSwitchLayout(opt.id)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.optionBtn,
              isActive && styles.optionBtnActive,
              pressed && styles.optionBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Switch to ${opt.label}`}
          >
            <Icon
              name={opt.icon}
              size={theme.sizes.iconSm}
              color={isActive ? theme.colors.primaryDark : theme.colors.textSecondary}
            />
            {showLabels ? (
              <ThemedText
                variant="caption"
                color={isActive ? theme.colors.primaryDark : theme.colors.textSecondary}
                style={styles.label}
              >
                {opt.shortLabel}
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.md,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
  },
  optionBtnActive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  optionBtnPressed: {
    opacity: 0.7,
  },
  label: {
    marginLeft: theme.spacing.xs,
    fontWeight: '600',
  },
});
