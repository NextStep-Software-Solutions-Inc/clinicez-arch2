import React, { memo } from 'react';
import {
  Platform,
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
    waitlist?: number;
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
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();

  const tabs: Array<{ id: AppointmentFilterTab; label: string; count?: number }> = counts
    ? [
        { id: 'all', label: 'All', count: counts.all },
        { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
        { id: 'past', label: 'Past', count: counts.past },
        { id: 'waitlist', label: 'Waitlist', count: counts.waitlist },
      ]
    : [];

  return (
    <View style={styles.container}>
      {/* Search Input Bar */}
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.full,
            paddingHorizontal: spacing.md,
            paddingVertical: Platform.OS === 'ios' ? 10 : 8,
          },
        ]}
      >
        <AppIcon name="search" size={18} color={colors.mutedText} />
        <TextInput
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search clinics, doctors, appointments..."
          placeholderTextColor={colors.mutedText}
          style={[
            styles.input,
            typography.bodyMd,
            {
              color: colors.navyText,
              marginLeft: spacing.sm,
            },
          ]}
          returnKeyType="search"
          accessibilityLabel="Search clinics, doctors, appointments"
        />

        {searchQuery.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search text"
            onPress={() => onSearchChange('')}
            hitSlop={8}
            style={styles.actionIcon}
          >
            <AppIcon name="close" size={16} color={colors.mutedText} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filter options"
            onPress={onFilterSlidersPress}
            hitSlop={8}
            style={styles.actionIcon}
          >
            <AppIcon name="sliders" size={18} color={colors.primaryDeep} />
          </Pressable>
        )}
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
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm + 1,
                    backgroundColor: isActive ? colors.primaryDeep : colors.surface,
                    borderColor: isActive ? colors.primaryDeep : colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
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
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
  },
  actionIcon: {
    padding: 4,
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
