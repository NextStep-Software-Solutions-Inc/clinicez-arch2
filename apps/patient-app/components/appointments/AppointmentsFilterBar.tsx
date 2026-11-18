import React, { memo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export type AppointmentFilterTab = 'all' | 'upcoming' | 'past' | 'waitlist';

export interface AppointmentsFilterBarProps {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  activeTab?: AppointmentFilterTab;
  onSelectTab?: (tab: AppointmentFilterTab) => void;
  counts?: {
    all: number;
    upcoming: number;
    past: number;
  };
  onFilterSlidersPress?: () => void;
  hideTabs?: boolean;
}

function AppointmentsFilterBarComponent({
  searchQuery,
  onSearchChange,
  activeTab = 'all',
  onSelectTab,
  counts,
  onFilterSlidersPress,
  hideTabs = false,
}: AppointmentsFilterBarProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  const tabs: Array<{ id: AppointmentFilterTab; label: string; count?: number }> = counts
    ? [
        { id: 'all', label: 'All', count: counts.all },
        { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
        { id: 'past', label: 'Past', count: counts.past },
        { id: 'waitlist', label: 'Waitlist' },
      ]
    : [];

  return (
    <View style={styles.container}>
      {/* Search Input Bar matching HomeSearchBar visual design */}
      <View
        style={[
          styles.searchBox,
          elevation.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderSubtle,
            borderRadius: radii.full,
            paddingLeft: spacing.base,
            paddingRight: spacing.xs,
          },
        ]}
      >
        <View style={[styles.inputCluster, { gap: spacing.sm }]}>
          <AppIcon name="search" size={18} color={colors.primary} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search clinics, doctors, appointments..."
            placeholderTextColor={colors.mutedText}
            style={[
              styles.input,
              typography.bodyMd,
              { color: colors.navyText },
            ]}
            returnKeyType="search"
            accessibilityLabel="Search clinics, doctors, appointments"
          />
        </View>

        <View style={[styles.actionsCluster, { gap: spacing.xxs }]}>
          {searchQuery.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search text"
              onPress={() => onSearchChange('')}
              hitSlop={6}
              style={({ pressed }) => [
                styles.iconBtn,
                { borderRadius: radii.full, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <AppIcon name="close" size={16} color={colors.mutedText} />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filter appointments"
            onPress={onFilterSlidersPress ?? (() => {})}
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

      {/* Filter Tabs Scroll/Row */}
      {!hideTabs && tabs.length > 0 && onSelectTab ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.tabsRow, { gap: spacing.sm, paddingTop: spacing.md }]}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const labelWithCount =
              tab.count !== undefined ? `${tab.label} (${tab.count})` : tab.label;

            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={labelWithCount}
                onPress={() => onSelectTab(tab.id)}
                style={({ pressed }) => [
                  styles.tabPill,
                  {
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.base + 2,
                    paddingVertical: spacing.sm + 1,
                    backgroundColor: isActive ? colors.primary : colors.surface,
                    borderColor: isActive ? colors.primary : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    typography.labelMd,
                    {
                      color: isActive ? colors.onPrimary : colors.navyText,
                      fontWeight: isActive ? '700' : '600',
                    },
                  ]}
                >
                  {labelWithCount}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

export const AppointmentsFilterBar = memo(AppointmentsFilterBarComponent);
export default AppointmentsFilterBar;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  searchBox: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  inputCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    minHeight: 46,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    minWidth: 0,
  },
  actionsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabPill: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
