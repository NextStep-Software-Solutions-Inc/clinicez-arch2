import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon, { IconName, resolveIconName } from '../ui/Icon';
import { theme } from '../../constants/theme';
import { SettingsTabItem, SettingsTabKey } from './types';

interface SettingsTabBarProps {
  tabs: SettingsTabItem[];
  activeTab: SettingsTabKey;
  onSelectTab: (tab: SettingsTabKey) => void;
}

export default function SettingsTabBar({ tabs, activeTab, onSelectTab }: SettingsTabBarProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelectTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={({ pressed, hovered }: any) => [
                styles.tabItem,
                isActive && styles.tabItemActive,
                hovered && !isActive && styles.tabItemHover,
                pressed && styles.tabItemPressed,
              ]}
            >
              <Icon
                name={(resolveIconName(tab.icon) ?? 'settings') as IconName}
                size={theme.sizes.iconSm}
                color={isActive ? theme.colors.primary : theme.colors.textMuted}
              />
              <ThemedText
                variant={isActive ? 'smallBold' : 'small'}
                color={isActive ? theme.colors.primary : theme.colors.textSecondary}
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: 'transparent',
  },
  tabItemHover: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  tabItemActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  tabItemPressed: {
    opacity: 0.8,
  },
});
