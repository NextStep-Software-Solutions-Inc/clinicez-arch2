import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import type { SearchItem } from '@shared/safe';
import ThemedText from '../ui/ThemedText';
import Icon, { IconName } from '../ui/Icon';
import Badge from '../ui/Badge';
import { theme, subscribeActiveTheme } from '../../constants/theme';

export interface SearchResultItemRowProps {
  item: SearchItem;
  isActive: boolean;
  onSelect: () => void;
  onHover?: () => void;
}

export function resolveCategoryIcon(category: string): IconName {
  const normalized = (category || '').toLowerCase().trim();
  switch (normalized) {
    case 'patients':
      return 'patients';
    case 'consultations':
      return 'consultations';
    case 'appointments':
      return 'appointments';
    case 'queue':
      return 'ticket';
    case 'billing':
      return 'billing';
    case 'laborders':
    case 'resultreview':
      return 'lab';
    case 'settings':
      return 'settings';
    case 'quick actions':
      return 'zap';
    default:
      return 'search';
  }
}

export default function SearchResultItemRow({
  item,
  isActive,
  onSelect,
  onHover,
}: SearchResultItemRowProps) {
  const [, setThemeVersion] = useState(0);

  useEffect(() => {
    return subscribeActiveTheme(() => {
      setThemeVersion((v) => v + 1);
    });
  }, []);

  const iconName = resolveCategoryIcon(item.category);
  const badgeText = item.badgeText || item.badge?.text;
  const badgeVariant = item.badgeVariant || item.badge?.variant || 'neutral';

  return (
    <Pressable
      id={`search-item-${item.id}`}
      nativeID={`search-item-${item.id}`}
      role="option"
      accessibilityRole="menuitem"
      aria-selected={isActive}
      onPress={onSelect}
      onHoverIn={onHover}
      style={[
        styles.row,
        isActive
          ? [
              styles.rowActive,
              {
                backgroundColor: theme.colors.primarySubtle,
                borderColor: theme.colors.primaryBorder,
                ...theme.shadows.brandSubtle,
              },
            ]
          : {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.transparent,
            },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          isActive
            ? [
                styles.iconContainerActive,
                {
                  backgroundColor: theme.colors.primaryLight,
                  borderColor: theme.colors.primaryBorder,
                },
              ]
            : {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.transparent,
              },
        ]}
      >
        <Icon
          name={iconName}
          size={theme.sizes.iconMd}
          color={isActive ? theme.colors.primary : theme.colors.textSecondary}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText
            variant="bodyBold"
            color={isActive ? theme.colors.primaryDark : theme.colors.text}
            numberOfLines={1}
            style={styles.titleText}
          >
            {item.title}
          </ThemedText>
          {badgeText ? (
            <Badge label={badgeText} variant={badgeVariant} size="xs" />
          ) : null}
        </View>
        {item.subtitle ? (
          <ThemedText variant="small" color={theme.colors.textSecondary} numberOfLines={1}>
            {item.subtitle}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.trailing}>
        <View
          style={[
            styles.categoryBadge,
            isActive
              ? {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.primaryBorder,
                }
              : {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.border,
                },
          ]}
        >
          <ThemedText
            variant="caption"
            color={isActive ? theme.colors.primary : theme.colors.textMuted}
          >
            {item.category}
          </ThemedText>
        </View>
        {isActive ? (
          <Icon name="arrowRight" size={theme.sizes.iconSm} color={theme.colors.primary} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.transparent,
    minHeight: 60,
  },
  rowActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
    ...theme.shadows.brandSubtle,
  },
  iconContainer: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.transparent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  titleText: {
    flexShrink: 1,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexShrink: 0,
  },
  categoryBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
});
