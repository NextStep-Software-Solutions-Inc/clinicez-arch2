import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import type { CategoryOption } from '@shared/safe';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';

export interface SearchCategoryTabsProps {
  categories: CategoryOption[];
  activeCategory: string;
  onSelectCategory: (categoryKey: string) => void;
  resultCounts?: Record<string, number>;
}

export default function SearchCategoryTabs({
  categories,
  activeCategory,
  onSelectCategory,
  resultCounts,
}: SearchCategoryTabsProps) {
  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <View role="tablist" accessibilityRole="tablist" style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((cat) => {
          const isActive = activeCategory.toLowerCase() === cat.key.toLowerCase();
          const count = resultCounts?.[cat.key.toLowerCase()] ?? resultCounts?.[cat.key];

          return (
            <Pressable
              key={cat.key}
              role="tab"
              accessibilityRole="tab"
              aria-selected={isActive}
              accessibilityLabel={`${cat.label} category${count !== undefined ? `, ${count} results` : ''}`}
              onPress={() => onSelectCategory(cat.key)}
              style={({ pressed }) => [
                styles.tab,
                isActive ? styles.tabActive : styles.tabInactive,
                pressed && styles.tabPressed,
              ]}
            >
              <ThemedText
                variant={isActive ? 'smallBold' : 'small'}
                color={isActive ? theme.colors.onPrimary : theme.colors.textSecondary}
              >
                {cat.label}
              </ThemedText>

              {count !== undefined && count > 0 ? (
                <View
                  style={[
                    styles.countBadge,
                    isActive ? styles.countBadgeActive : styles.countBadgeInactive,
                  ]}
                >
                  <ThemedText
                    variant="caption"
                    color={isActive ? theme.colors.onPrimary : theme.colors.textMuted}
                  >
                    {count}
                  </ThemedText>
                </View>
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    minHeight: 30,
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tabInactive: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
  },
  tabPressed: {
    opacity: 0.8,
  },
  countBadge: {
    paddingHorizontal: theme.spacing.xs + 1,
    paddingVertical: 1,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
  },
  countBadgeActive: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: theme.colors.primaryDark,
  },
  countBadgeInactive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
});
