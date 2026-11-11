import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import ThemedText from '../ui/ThemedText';
import { TextInput } from '../ui/Text';
import Badge from '../ui/Badge';
import Icon, { IconName, resolveIconName } from '../ui/Icon';
import { theme, subscribeActiveTheme } from '../../constants/theme';
import {
  SETTINGS_SECTION_CATALOG,
  SettingsNavMode,
  SettingsTabItem,
  SettingsTabKey,
  matchesSettingsFilter,
} from './types';
import { SettingsNavModeSwitcher } from './SettingsTabBar';

export const SETTINGS_VERTICAL_RAIL_WIDTH = 216;

export interface SettingsVerticalRailProps {
  tabs: SettingsTabItem[];
  activeTab: SettingsTabKey;
  onSelectTab: (tab: SettingsTabKey) => void;
  filterQuery: string;
  onChangeFilterQuery: (query: string) => void;
  navMode: SettingsNavMode;
  onChangeNavMode: (mode: SettingsNavMode) => void;
}

export default function SettingsVerticalRail({
  tabs,
  activeTab,
  onSelectTab,
  filterQuery,
  onChangeFilterQuery,
  navMode,
  onChangeNavMode,
}: SettingsVerticalRailProps) {
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isFilterHovered, setIsFilterHovered] = useState(false);
  const [, setThemeVersion] = useState(0);

  useEffect(() => subscribeActiveTheme(() => setThemeVersion((v) => v + 1)), []);

  const tabMap = useMemo(() => {
    const map = new Map<SettingsTabKey, SettingsTabItem>();
    for (const tab of tabs) {
      map.set(tab.key, tab);
    }
    return map;
  }, [tabs]);

  const visibleGroups = useMemo(() => {
    return SETTINGS_SECTION_CATALOG.map((group) => {
      const items = group.sections
        .map((section) => tabMap.get(section.key))
        .filter((item): item is SettingsTabItem => Boolean(item))
        .filter((item) => matchesSettingsFilter(item, filterQuery));
      return {
        key: group.key,
        label: group.label,
        items,
      };
    }).filter((group) => group.items.length > 0);
  }, [tabMap, filterQuery]);

  return (
    <View style={[styles.rail, { ...theme.shadows.sm }]} testID="settings-vertical-rail">
      {/* Top Bar: Minimalist Icon-Only Layout Switcher anchored at Top-Left + Full-Width Instant Filter */}
      <View style={styles.topBar}>
        <View style={styles.topHeaderRow}>
          <SettingsNavModeSwitcher navMode={navMode} onChangeNavMode={onChangeNavMode} />
          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.railTitle}>
            SECTIONS
          </ThemedText>
        </View>

        <View
          {...({
            onMouseEnter: () => setIsFilterHovered(true),
            onMouseLeave: () => setIsFilterHovered(false),
          } as any)}
          style={[
            styles.filterBox,
            isFilterHovered && !isInputFocused && styles.filterBoxHovered,
            isInputFocused && styles.filterBoxFocused,
          ]}
        >
          <Icon
            name="search"
            size={theme.sizes.iconSm}
            color={isInputFocused ? theme.colors.primary : theme.colors.textMuted}
          />
          <TextInput
            value={filterQuery}
            onChangeText={onChangeFilterQuery}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            placeholder="Filter settings..."
            placeholderTextColor={theme.colors.textLight}
            accessibilityLabel="Filter settings"
            testID="rail-filter-input"
            style={styles.filterInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {filterQuery.length > 0 ? (
            <Pressable
              onPress={() => onChangeFilterQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear settings filter"
              testID="rail-filter-clear"
              hitSlop={theme.spacing.xs}
              style={({ pressed }: any) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Grouped Vertical Section List */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {visibleGroups.length === 0 ? (
          <View style={styles.emptyBox} testID="rail-filter-empty">
            <Icon name="search" size={theme.sizes.iconMd} color={theme.colors.textLight} />
            <ThemedText
              variant="caption"
              color={theme.colors.textMuted}
              style={styles.emptyText}
            >
              No settings match &ldquo;{filterQuery.trim()}&rdquo;.
            </ThemedText>
            <Pressable
              onPress={() => onChangeFilterQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear settings filter"
              style={({ pressed }: any) => [styles.resetChip, pressed && styles.pressed]}
            >
              <ThemedText variant="captionBold" color={theme.colors.primary}>
                Clear filter
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          visibleGroups.map((group) => (
            <View key={group.key} style={styles.groupSection} testID={`rail-group-${group.key}`}>
              <ThemedText
                variant="captionBold"
                color={theme.colors.textMuted}
                style={styles.groupHeader}
                numberOfLines={1}
              >
                {group.label.toUpperCase()}
              </ThemedText>

              <View style={styles.groupItems}>
                {group.items.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => onSelectTab(tab.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={tab.label}
                      testID={`rail-tab-${tab.key}`}
                      style={({ pressed, hovered }: any) => [
                        styles.railItem,
                        isActive && styles.railItemActive,
                        hovered && !isActive && styles.railItemHover,
                        pressed && styles.pressed,
                      ]}
                    >
                      {isActive ? <View style={styles.activeAccentBar} /> : null}
                      <Icon
                        name={(resolveIconName(tab.icon) ?? 'settings') as IconName}
                        size={theme.sizes.iconSm}
                        color={isActive ? theme.colors.primaryDark : theme.colors.textMuted}
                      />
                      <ThemedText
                        variant="smallBold"
                        color={isActive ? theme.colors.primaryDark : theme.colors.textSecondary}
                        numberOfLines={1}
                        style={styles.railItemLabel}
                      >
                        {tab.label}
                      </ThemedText>
                      {tab.badge !== undefined && tab.badge !== null ? (
                        <Badge
                          label={String(tab.badge)}
                          variant={isActive ? 'primary' : 'neutral'}
                          size="sm"
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: SETTINGS_VERTICAL_RAIL_WIDTH,
    flexShrink: 0,
    backgroundColor: theme.colors.surface,
    borderRightWidth: theme.sizes.borderWidth,
    borderRightColor: theme.colors.border,
    flexDirection: 'column',
    zIndex: 1,
    ...theme.shadows.sm,
  },
  topBar: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    minHeight: theme.sizes.controlMd,
  },
  railTitle: {
    letterSpacing: 0.6,
  },
  filterBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    height: 36,
    gap: theme.spacing.xs,
  },
  filterBoxHovered: {
    borderColor: theme.colors.primaryBorder,
  },
  filterBoxFocused: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primary,
  },
  filterInput: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSizes.sm,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  clearButton: {
    padding: 2,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  groupSection: {
    gap: theme.spacing.xs,
  },
  groupHeader: {
    paddingHorizontal: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  groupItems: {
    gap: 2,
  },
  railItem: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    minHeight: 36,
  },
  railItemHover: {
    backgroundColor: theme.colors.primarySubtle,
  },
  railItemActive: {
    backgroundColor: theme.colors.primaryLight,
    ...theme.shadows.brandSubtle,
  },
  activeAccentBar: {
    position: 'absolute',
    left: 0,
    top: theme.spacing.xs,
    bottom: theme.spacing.xs,
    width: 3,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  railItemLabel: {
    flex: 1,
    minWidth: 0,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  emptyText: {
    textAlign: 'center',
  },
  resetChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
  },
  pressed: {
    opacity: 0.8,
  },
});
