import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { subscribeActiveTheme, theme } from '../../constants/theme';
import type { ProfileTabDefinition, ProfileTabKey } from './types';

export const PROFILE_TAB_SEARCH_KEYWORDS: Record<ProfileTabKey, readonly string[]> = {
  profile: ['name', 'email', 'phone', 'contact', 'specialty', 'title', 'personal info'],
  credentials: ['prc', 'ptr', 'pan', 'philhealth', 's2', 'license', 'signature', 'stamp', 'prescription'],
  preferences: [
    'dark mode',
    'light mode',
    'theme',
    'appearance',
    'color theme',
    'color',
    'accent',
    'branding',
    'palette',
    'match device',
    'text size',
    'screen spacing',
    'patient charts',
    'notification sounds',
    'audio',
    'mute',
  ],
  security: ['password', 'security', 'account', 'server', 'connection', 'sign out'],
};

export interface ProfileTabBarProps {
  tabs: ProfileTabDefinition[];
  activeTab: ProfileTabKey;
  onSelectTab: (tab: ProfileTabKey) => void;
}

export default function ProfileTabBar({
  tabs,
  activeTab,
  onSelectTab,
}: ProfileTabBarProps) {
  const [, setThemeTick] = useState(0);
  useEffect(() => subscribeActiveTheme(() => setThemeTick((t) => t + 1)), []);

  return (
    <View
      style={[
        styles.barContainer,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
      accessibilityRole="tablist"
    >
      <ScrollView
        horizontal
        bounces={false}
        alwaysBounceHorizontal={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        style={styles.scrollViewport}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const keywords = tab.keywords ?? PROFILE_TAB_SEARCH_KEYWORDS[tab.key];
          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelectTab(tab.key)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
              {...(Platform.OS === 'web' && keywords?.length
                ? ({ 'data-keywords': keywords.join(', ') } as any)
                : {})}
              style={({ hovered, pressed }: any) => [
                styles.tabPill,
                isActive && [
                  styles.tabPillActive,
                  {
                    backgroundColor: theme.colors.primarySubtle,
                    borderColor: theme.colors.primaryBorder,
                    borderBottomColor: theme.colors.primary,
                  },
                  theme.shadows.brandSubtle,
                ],
                hovered &&
                  !isActive && [
                    styles.tabPillHover,
                    {
                      backgroundColor: theme.colors.primarySubtle,
                      borderColor: theme.colors.primaryBorder,
                    },
                  ],
                pressed && styles.tabPillPressed,
              ]}
            >
              <Icon
                name={tab.icon}
                size={theme.sizes.iconSm}
                color={isActive ? theme.colors.primary : theme.colors.textMuted}
              />
              <ThemedText
                variant="smallBold"
                color={isActive ? theme.colors.primary : theme.colors.textSecondary}
                numberOfLines={1}
                style={styles.tabLabel}
              >
                {tab.label}
              </ThemedText>
              {tab.badge ? (
                <Badge
                  label={tab.badge}
                  variant={isActive ? 'primary' : 'neutral'}
                  size="xs"
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
  barContainer: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    ...theme.shadows.sm,
  },
  scrollViewport: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ overscrollBehaviorX: 'none' } as any) : {}),
  },
  scrollContent: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  tabPill: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    flexShrink: 0,
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.transparent,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.transparent,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.transparent,
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
  },
  tabPillHover: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  tabPillActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
    borderBottomColor: theme.colors.primary,
    ...theme.shadows.brandSubtle,
  },
  tabPillPressed: {
    opacity: 0.85,
  },
  tabLabel: {
    flexShrink: 0,
  },
});
