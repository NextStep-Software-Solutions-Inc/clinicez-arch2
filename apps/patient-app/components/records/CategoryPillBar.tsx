import React from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';
import { CATEGORY_FILTERS, type CategoryFilterId } from '../../services/records/categories';

export interface CategoryPillBarProps {
  selectedCategory: CategoryFilterId;
  onSelectCategory: (id: CategoryFilterId) => void;
  counts?: Partial<Record<CategoryFilterId, number>>;
}

export const CategoryPillBar: React.FC<CategoryPillBarProps> = ({
  selectedCategory,
  onSelectCategory,
  counts,
}) => {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { isCompact } = useBreakpoint();

  const renderPills = () =>
    CATEGORY_FILTERS.map((cat) => {
      const isSelected = selectedCategory === cat.id;
      const count = counts?.[cat.id];

      return (
        <TouchableOpacity
          key={cat.id}
          onPress={() => onSelectCategory(cat.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: isSelected }}
          activeOpacity={0.75}
          style={[
            styles.pill,
            {
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs + 2,
              backgroundColor: isSelected ? colors.primary : colors.card,
              borderColor: isSelected ? colors.primary : colors.border,
              borderWidth: sizes.borderWidth,
              gap: spacing.xs,
            },
          ]}
        >
          <AppIcon
            name={cat.icon}
            size={sizes.iconSm}
            color={isSelected ? colors.onPrimary : colors.textSecondary}
          />
          <ThemedText
            variant="captionBold"
            style={{ color: isSelected ? colors.onPrimary : colors.textSecondary }}
          >
            {cat.label}
          </ThemedText>
          {count !== undefined && count > 0 && (
            <View
              style={[
                styles.badgeCount,
                {
                  backgroundColor: isSelected ? colors.primaryHover : colors.surfaceSubtle,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.xs,
                },
              ]}
            >
              <ThemedText
                variant="caption"
                style={{ color: isSelected ? colors.onPrimary : colors.textMuted }}
              >
                {count}
              </ThemedText>
            </View>
          )}
        </TouchableOpacity>
      );
    });

  if (Platform.OS === 'web' && !isCompact) {
    return (
      <View style={[styles.webContainer, { gap: spacing.sm, paddingVertical: spacing.xs }]}>
        {renderPills()}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        styles.nativeContainer,
        {
          gap: spacing.sm,
          paddingHorizontal: Platform.OS === 'web' ? 0 : spacing.lg,
        },
      ]}
    >
      {renderPills()}
    </ScrollView>
  );
};

export default CategoryPillBar;

const styles = StyleSheet.create({
  nativeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  webContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeCount: {
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
