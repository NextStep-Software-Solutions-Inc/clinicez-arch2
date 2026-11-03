import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export interface HomeSearchBarProps {
  onPressSearch: () => void;
  onPressVoice: () => void;
  onPressFilter: () => void;
}

function HomeSearchBarComponent({
  onPressSearch,
  onPressVoice,
  onPressFilter,
}: HomeSearchBarProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  return (
    <View
      style={[
        styles.bar,
        elevation.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
          borderRadius: radii.full,
          paddingLeft: spacing.base,
          paddingRight: spacing.sm,
        },
      ]}
    >
      <Pressable
        onPress={onPressSearch}
        accessibilityRole="search"
        accessibilityLabel="Search clinics, doctors, or symptoms"
        style={({ pressed }) => [
          styles.mainTrigger,
          { gap: spacing.sm, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <AppIcon name="search" size={18} color={colors.primary} />
        <Text
          numberOfLines={1}
          style={[typography.bodyMd, styles.placeholder, { color: colors.mutedText }]}
        >
          Search clinics, doctors, or symptoms...
        </Text>
      </Pressable>

      <View style={[styles.actions, { gap: spacing.xs }]}>
        <Pressable
          onPress={onPressVoice}
          accessibilityRole="button"
          accessibilityLabel="Search by voice or symptom query"
          hitSlop={6}
          style={({ pressed }) => [
            styles.iconBtn,
            { borderRadius: radii.full, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <AppIcon name="mic" size={18} color={colors.primary} />
        </Pressable>

        <Pressable
          onPress={onPressFilter}
          accessibilityRole="button"
          accessibilityLabel="Filter clinics, doctors, and services"
          hitSlop={6}
          style={({ pressed }) => [
            styles.iconBtn,
            { borderRadius: radii.full, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <AppIcon name="sliders" size={18} color={colors.navyText} />
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
  mainTrigger: {
    flex: 1,
    minHeight: 46,
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
});

export const HomeSearchBar = memo(HomeSearchBarComponent);
export default HomeSearchBar;
