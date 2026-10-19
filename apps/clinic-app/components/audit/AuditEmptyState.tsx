import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import EmptyState from '../ui/EmptyState';

export interface AuditEmptyStateProps {
  onResetFilters: () => void;
  filterSummary?: string;
}

export function AuditEmptyState({ onResetFilters, filterSummary }: AuditEmptyStateProps) {
  const description = filterSummary
    ? `No forensic events found matching "${filterSummary}". Try adjusting your category pills, search terms, or date range.`
    : 'Try adjusting your search keywords, category pills, or date range filters.';

  return (
    <View style={styles.container}>
      <EmptyState
        icon="search"
        title="No audit records found"
        description={description}
        actionTitle="Reset Filters"
        onAction={onResetFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
export default AuditEmptyState;
