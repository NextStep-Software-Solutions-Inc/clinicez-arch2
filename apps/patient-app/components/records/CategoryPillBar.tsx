import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { FilterChipBar, type FilterChipItem } from '../ui/FilterChipBar';
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
  const { spacing } = useAppTheme();

  const items: ReadonlyArray<FilterChipItem<CategoryFilterId>> = useMemo(
    () =>
      CATEGORY_FILTERS.map((cat) => ({
        key: cat.id,
        label: cat.label,
        count: counts?.[cat.id],
      })),
    [counts]
  );

  return (
    <FilterChipBar
      items={items}
      selectedKey={selectedCategory}
      onSelect={onSelectCategory}
      contentContainerStyle={{
        paddingHorizontal: Platform.OS === 'web' ? 0 : spacing.lg,
      }}
    />
  );
};

export default CategoryPillBar;
