import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import type { SearchItem } from '@shared/safe';
import ThemedText from '../ui/ThemedText';
import Icon, { IconName } from '../ui/Icon';
import Badge from '../ui/Badge';
import { theme } from '../../constants/theme';

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
      style={[styles.row, isActive && styles.rowActive]}
    >
      <View style={[styles.iconContainer, isActive && styles.iconContainerActive]}>
        <Icon
          name={iconName}
          size={theme.sizes.iconSm}
          color={isActive ? theme.colors.primary : theme.colors.textSecondary}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText variant="bodyBold" numberOfLines={1} style={styles.titleText}>
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
        <View style={styles.categoryBadge}>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
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
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    minHeight: 52,
  },
  rowActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderLeftColor: theme.colors.primary,
  },
  iconContainer: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs / 2,
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
    gap: theme.spacing.sm,
    flexShrink: 0,
  },
  categoryBadge: {
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
});
