import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import ThemedText from '../ui/ThemedText';
import { TextInput } from '../ui/Text';
import Badge from '../ui/Badge';
import Icon, { IconName, resolveIconName } from '../ui/Icon';
import { theme, subscribeActiveTheme } from '../../constants/theme';
import {
  SettingsTabItem,
  SettingsTabKey,
  SettingsNavMode,
  filterSettingsTabs,
} from './types';

export const COLLAPSED_FILTER_WIDTH = 36;
export const EXPANDED_FILTER_WIDTH = 220;
export const FILTER_ANIMATION_DURATION_MS = 220;

export interface SettingsNavModeSwitcherProps {
  navMode: SettingsNavMode;
  onChangeNavMode: (mode: SettingsNavMode) => void;
}

/**
 * Minimalist icon-only layout mode segmented toggle.
 * Uses only `panelTop` (single-row horizontal bar) and `layoutSplit` (grouped vertical rail)
 * with accessible labels and web hover tooltips — zero text labels.
 */
export function SettingsNavModeSwitcher({
  navMode,
  onChangeNavMode,
}: SettingsNavModeSwitcherProps) {
  const [, setThemeVersion] = useState(0);
  useEffect(() => subscribeActiveTheme(() => setThemeVersion((v) => v + 1)), []);

  const isHorizontal = navMode === 'horizontal';
  const isVertical = navMode === 'vertical';

  return (
    <View
      style={styles.modeSwitcher}
      accessibilityRole="radiogroup"
      accessibilityLabel="Settings navigation layout mode"
      testID="settings-nav-mode-switcher"
    >
      <Pressable
        onPress={() => onChangeNavMode('horizontal')}
        accessibilityRole="radio"
        accessibilityState={{ selected: isHorizontal }}
        accessibilityLabel="Top tab bar"
        testID="nav-mode-horizontal"
        style={({ pressed, hovered }: any) => [
          styles.modeSegment,
          isHorizontal && styles.modeSegmentActive,
          hovered && !isHorizontal && styles.modeSegmentHover,
          pressed && styles.modeSegmentPressed,
        ]}
        {...({ title: 'Top tab bar' } as any)}
      >
        <Icon
          name="panelTop"
          size={theme.sizes.iconSm}
          color={isHorizontal ? theme.colors.primary : theme.colors.textMuted}
        />
      </Pressable>

      <Pressable
        onPress={() => onChangeNavMode('vertical')}
        accessibilityRole="radio"
        accessibilityState={{ selected: isVertical }}
        accessibilityLabel="Left sidebar menu"
        testID="nav-mode-vertical"
        style={({ pressed, hovered }: any) => [
          styles.modeSegment,
          isVertical && styles.modeSegmentActive,
          hovered && !isVertical && styles.modeSegmentHover,
          pressed && styles.modeSegmentPressed,
        ]}
        {...({ title: 'Left sidebar menu' } as any)}
      >
        <Icon
          name="layoutSplit"
          size={theme.sizes.iconSm}
          color={isVertical ? theme.colors.primary : theme.colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

export interface SettingsTabBarProps {
  tabs: SettingsTabItem[];
  activeTab: SettingsTabKey;
  onSelectTab: (tab: SettingsTabKey) => void;
  filterQuery?: string;
  onChangeFilterQuery?: (query: string) => void;
  navMode?: SettingsNavMode;
  onChangeNavMode?: (mode: SettingsNavMode) => void;
  canSwitchNavMode?: boolean;
  defaultFilterExpanded?: boolean;
}

export default function SettingsTabBar({
  tabs,
  activeTab,
  onSelectTab,
  filterQuery,
  onChangeFilterQuery,
  navMode = 'horizontal',
  onChangeNavMode,
  canSwitchNavMode = true,
  defaultFilterExpanded = false,
}: SettingsTabBarProps) {
  const [internalQuery, setInternalQuery] = useState('');
  const [, setThemeVersion] = useState(0);
  useEffect(() => subscribeActiveTheme(() => setThemeVersion((v) => v + 1)), []);

  const effectiveQuery = filterQuery !== undefined ? filterQuery : internalQuery;

  const handleQueryChange = useCallback(
    (next: string) => {
      if (filterQuery === undefined) {
        setInternalQuery(next);
      }
      onChangeFilterQuery?.(next);
    },
    [filterQuery, onChangeFilterQuery]
  );

  const [isFilterFocused, setIsFilterFocused] = useState(defaultFilterExpanded);
  const isFilterExpanded = isFilterFocused || Boolean(effectiveQuery.trim());

  const filterInputRef = useRef<any>(null);
  const filterWidthAnim = useRef(
    new Animated.Value(isFilterExpanded ? EXPANDED_FILTER_WIDTH : COLLAPSED_FILTER_WIDTH)
  ).current;

  useEffect(() => {
    const targetWidth = isFilterExpanded ? EXPANDED_FILTER_WIDTH : COLLAPSED_FILTER_WIDTH;
    if (Animated && typeof Animated.timing === 'function') {
      Animated.timing(filterWidthAnim, {
        toValue: targetWidth,
        duration: FILTER_ANIMATION_DURATION_MS,
        useNativeDriver: false,
      }).start();
    } else if (filterWidthAnim && typeof filterWidthAnim.setValue === 'function') {
      filterWidthAnim.setValue(targetWidth);
    }
  }, [isFilterExpanded, filterWidthAnim]);

  const handleExpandFilter = useCallback(() => {
    setIsFilterFocused(true);
    setTimeout(() => {
      filterInputRef.current?.focus?.();
    }, 16);
  }, []);

  const handleClearFilter = useCallback(() => {
    handleQueryChange('');
    filterInputRef.current?.focus?.();
  }, [handleQueryChange]);

  const filteredTabs = useMemo(
    () => filterSettingsTabs(tabs, effectiveQuery),
    [tabs, effectiveQuery]
  );

  const hasFilterText = Boolean(effectiveQuery.trim());

  return (
    <View
      style={[styles.container, { ...theme.shadows.sm }]}
      testID="settings-horizontal-tab-bar"
    >
      {/* Left Anchor: Icon-Only Layout Mode Switcher */}
      {canSwitchNavMode && onChangeNavMode ? (
        <SettingsNavModeSwitcher navMode={navMode} onChangeNavMode={onChangeNavMode} />
      ) : null}

      {/* Compact Expand-on-Click Filter Control (Right Beside Mode Switcher) */}
      <Animated.View
        testID="settings-filter-animated-shell"
        style={[
          styles.filterShell,
          isFilterExpanded ? styles.filterShellExpanded : styles.filterShellCollapsed,
          { width: filterWidthAnim },
        ]}
      >
        {isFilterExpanded ? (
          <View style={styles.filterInputRow}>
            <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.primary} />
            <TextInput
              ref={filterInputRef}
              value={effectiveQuery}
              onChangeText={handleQueryChange}
              onFocus={() => setIsFilterFocused(true)}
              onBlur={() => setIsFilterFocused(false)}
              placeholder="Filter settings..."
              placeholderTextColor={theme.colors.textLight}
              accessibilityLabel="Filter settings"
              testID="settings-filter-input"
              style={styles.filterTextInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {effectiveQuery.length > 0 ? (
              <Pressable
                onPress={handleClearFilter}
                accessibilityRole="button"
                accessibilityLabel="Clear settings filter"
                testID="settings-filter-clear"
                hitSlop={theme.spacing.xs}
                style={({ pressed }: any) => [
                  styles.clearFilterButton,
                  pressed && styles.controlPressed,
                ]}
              >
                <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Pressable
            onPress={handleExpandFilter}
            accessibilityRole="button"
            accessibilityLabel="Filter settings"
            testID="settings-filter-trigger"
            style={({ pressed, hovered }: any) => [
              styles.filterCollapsedTrigger,
              hovered && styles.filterTriggerHover,
              pressed && styles.controlPressed,
            ]}
            {...({ title: 'Filter settings' } as any)}
          >
            <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
          </Pressable>
        )}
      </Animated.View>

      <View style={styles.controlsDivider} />

      {/* Single-Row Non-Wrapping Native Horizontal Tab Strip */}
      <View style={styles.scrollViewport}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          alwaysBounceHorizontal={false}
          overScrollMode="never"
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          testID="settings-tabs-scroll-view"
        >
          {filteredTabs.length === 0 ? (
            <View style={styles.emptyFilterRow}>
              <ThemedText variant="small" color={theme.colors.textMuted} numberOfLines={1}>
                No matching settings sections
              </ThemedText>
              <Pressable
                onPress={() => handleQueryChange('')}
                accessibilityRole="button"
                accessibilityLabel="Reset settings filter"
                style={({ pressed }: any) => [
                  styles.resetFilterChip,
                  pressed && styles.controlPressed,
                ]}
              >
                <ThemedText variant="captionBold" color={theme.colors.primary} numberOfLines={1}>
                  Reset
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            filteredTabs.map((tab, index) => {
              const isActive = activeTab === tab.key;
              const prevGroup = index > 0 ? filteredTabs[index - 1]?.groupKey : undefined;
              const showGroupDivider =
                !hasFilterText && Boolean(prevGroup && tab.groupKey && prevGroup !== tab.groupKey);

              return (
                <React.Fragment key={tab.key}>
                  {showGroupDivider ? <View style={styles.groupDivider} /> : null}
                  <Pressable
                    onPress={() => onSelectTab(tab.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={tab.label}
                    testID={`settings-tab-${tab.key}`}
                    style={({ pressed, hovered }: any) => [
                      styles.tabItem,
                      isActive && styles.tabItemActive,
                      hovered && !isActive && styles.tabItemHover,
                      pressed && styles.controlPressed,
                    ]}
                  >
                    <Icon
                      name={(resolveIconName(tab.icon) ?? 'settings') as IconName}
                      size={theme.sizes.iconSm}
                      color={isActive ? theme.colors.primaryDark : theme.colors.textMuted}
                    />
                    <ThemedText
                      variant="smallBold"
                      color={isActive ? theme.colors.primaryDark : theme.colors.textSecondary}
                      numberOfLines={1}
                      style={styles.tabLabelText}
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
                    {isActive ? <View style={styles.activeBottomIndicator} /> : null}
                  </Pressable>
                </React.Fragment>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
    minHeight: theme.sizes.controlLg,
    zIndex: 1,
    ...theme.shadows.sm,
  },
  filterShell: {
    height: COLLAPSED_FILTER_WIDTH,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    overflow: 'hidden',
    flexShrink: 0,
    justifyContent: 'center',
  },
  filterShellCollapsed: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
  },
  filterShellExpanded: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primary,
  },
  filterCollapsedTrigger: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTriggerHover: {
    backgroundColor: theme.colors.primarySubtle,
  },
  filterInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
    height: '100%',
  },
  filterTextInput: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSizes.sm,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  clearFilterButton: {
    padding: 2,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsDivider: {
    width: 1,
    height: 20,
    backgroundColor: theme.colors.border,
    flexShrink: 0,
  },
  scrollViewport: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ overscrollBehaviorX: 'none' } as any) : null),
  },
  scrollContent: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  groupDivider: {
    width: 1,
    height: 18,
    backgroundColor: theme.colors.border,
    marginHorizontal: 2,
    flexShrink: 0,
  },
  tabItem: {
    position: 'relative',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    flexShrink: 0,
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.transparent,
  },
  tabItemHover: {
    backgroundColor: theme.colors.primarySubtle,
  },
  tabItemActive: {
    backgroundColor: theme.colors.primaryLight,
    ...theme.shadows.brandSubtle,
  },
  tabLabelText: {
    flexShrink: 0,
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : null),
  },
  activeBottomIndicator: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: 0,
    height: 2,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  emptyFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  resetFilterChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
  },
  modeSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: 2,
    gap: 2,
    flexShrink: 0,
  },
  modeSegment: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSegmentActive: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    ...theme.shadows.brandSubtle,
  },
  modeSegmentHover: {
    backgroundColor: theme.colors.primarySubtle,
  },
  modeSegmentPressed: {
    opacity: 0.85,
  },
  controlPressed: {
    opacity: 0.8,
  },
});
