import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export interface HomeSearchBarProps {
  onPressSearch: () => void;
  onPressVoice: () => void;
  onPressFilter: () => void;
  /** Compact inline mode for workstation (>= 768px) top header row. */
  compact?: boolean;
}

function HomeSearchBarComponent({
  onPressSearch,
  onPressVoice,
  onPressFilter,
  compact = false,
}: HomeSearchBarProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  return (
    <View
      style={[
        compact ? styles.barCompact : styles.bar,
        compact ? undefined : elevation.card,
        {
          backgroundColor: colors.surface,
          borderColor: compact ? colors.border : colors.borderSubtle,
          borderRadius: radii.full,
          paddingLeft: compact ? spacing.md : spacing.base,
          paddingRight: spacing.xs,
        },
      ]}
    >
      <Pressable
        onPress={onPressSearch}
        accessibilityRole="search"
        accessibilityLabel="Search clinics, doctors, or symptoms"
        style={({ pressed }) => [
          compact ? styles.mainTriggerCompact : styles.mainTrigger,
          { gap: spacing.sm, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <AppIcon name="search" size={compact ? 16 : 18} color={colors.primary} />
        <Text
          numberOfLines={1}
          style={[
            compact ? typography.bodySm : typography.bodyMd,
            styles.placeholder,
            { color: colors.mutedText },
          ]}
        >
          Search clinics, doctors, or symptoms...
        </Text>
      </Pressable>

      <View style={[styles.actions, { gap: spacing.xxs }]}>
        <Pressable
          onPress={onPressVoice}
          accessibilityRole="button"
          accessibilityLabel="Search by voice or symptom query"
          hitSlop={6}
          style={({ pressed }) => [
            compact ? styles.iconBtnCompact : styles.iconBtn,
            { borderRadius: radii.full, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <AppIcon name="mic" size={compact ? 16 : 18} color={colors.primary} />
        </Pressable>

        <Pressable
          onPress={onPressFilter}
          accessibilityRole="button"
          accessibilityLabel="Filter clinics, doctors, and services"
          hitSlop={6}
          style={({ pressed }) => [
            compact ? styles.iconBtnCompact : styles.iconBtn,
            { borderRadius: radii.full, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <AppIcon name="sliders" size={compact ? 16 : 18} color={colors.navyText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 48,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barCompact: {
    width: '100%',
    minHeight: 42,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mainTrigger: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  mainTriggerCompact: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  placeholder: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnCompact: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const HomeSearchBar = memo(HomeSearchBarComponent);
export default HomeSearchBar;
