import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import AuditTableRow from './AuditTableRow';
import AuditTableSkeleton from './AuditTableSkeleton';
import AuditEmptyState from './AuditEmptyState';
import type { ClinicAuditEntryDto } from '../../services/clinicService';

export interface AuditTableProps {
  items: ClinicAuditEntryDto[];
  loading: boolean;
  loadingEarlier?: boolean;
  hasMore?: boolean;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  pageNumber?: number;
  totalCount?: number;
  onInspect: (entry: ClinicAuditEntryDto) => void;
  onNextPage?: () => void;
  onPreviousPage?: () => void;
  onLoadEarlier?: () => void;
  onResetFilters: () => void;
  filterSummary?: string;
}

export function AuditTable({
  items,
  loading,
  loadingEarlier = false,
  hasMore = false,
  hasPreviousPage = false,
  hasNextPage = false,
  pageNumber = 1,
  totalCount = 0,
  onInspect,
  onNextPage,
  onPreviousPage,
  onLoadEarlier,
  onResetFilters,
  filterSummary,
}: AuditTableProps) {
  if (loading && items.length === 0) {
    return <AuditTableSkeleton rows={8} />;
  }

  if (!loading && items.length === 0) {
    return <AuditEmptyState onResetFilters={onResetFilters} filterSummary={filterSummary} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableScrollContent}>
        <View style={styles.tableWrapper}>
          {/* Table Header */}
          <View style={styles.headerRow}>
            <View style={[styles.headerCell, styles.colTimestamp]}>
              <ThemedText style={styles.headerText}>Timestamp</ThemedText>
            </View>
            <View style={[styles.headerCell, styles.colCategory]}>
              <ThemedText style={styles.headerText}>Category</ThemedText>
            </View>
            <View style={[styles.headerCell, styles.colSeverity, styles.cellCenter]}>
              <ThemedText style={styles.headerText}>Severity</ThemedText>
            </View>
            <View style={[styles.headerCell, styles.colAction]}>
              <ThemedText style={styles.headerText}>Action</ThemedText>
            </View>
            <View style={[styles.headerCell, styles.colActor]}>
              <ThemedText style={styles.headerText}>Actor</ThemedText>
            </View>
            <View style={[styles.headerCell, styles.colTarget]}>
              <ThemedText style={styles.headerText}>Target</ThemedText>
            </View>
            <View style={[styles.headerCell, styles.colPatient]}>
              <ThemedText style={styles.headerText}>Patient (Masked)</ThemedText>
            </View>
            <View style={[styles.headerCell, styles.colOutcome, styles.cellCenter]}>
              <ThemedText style={styles.headerText}>Outcome</ThemedText>
            </View>
            <View style={[styles.headerCell, styles.colInspect, styles.cellCenter]}>
              <ThemedText style={styles.headerText}>Inspect</ThemedText>
            </View>
          </View>

          {/* Table Body */}
          <View style={styles.body}>
            {items.map((entry, index) => (
              <AuditTableRow
                key={entry.id}
                entry={entry}
                onInspect={onInspect}
                isEven={index % 2 === 1}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Pagination & Stream Footer */}
      <View style={styles.footer}>
        <View style={styles.metaContainer}>
          <ThemedText style={styles.metaText}>
            Showing {items.length} {totalCount > 0 ? `of ${totalCount}` : ''} entries · Page {pageNumber}
          </ThemedText>
        </View>

        <View style={styles.paginationControls}>
          {hasPreviousPage && onPreviousPage && (
            <Button
              title="Previous Page"
              variant="outline"
              size="sm"
              icon="chevronLeft"
              onPress={onPreviousPage}
            />
          )}

          {hasNextPage && onNextPage && (
            <Button
              title="Next Page"
              variant="outline"
              size="sm"
              icon="chevronRight"
              onPress={onNextPage}
            />
          )}

          {hasMore && onLoadEarlier && (
            <Button
              title="Load Earlier Activity"
              variant="secondary"
              size="sm"
              icon="clock"
              loading={loadingEarlier}
              onPress={onLoadEarlier}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  tableScrollContent: {
    minWidth: '100%',
  },
  tableWrapper: {
    minWidth: 1100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  headerCell: {
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  cellCenter: {
    alignItems: 'center',
  },
  headerText: {
    color: theme.colors.textMuted,
    ...theme.typography.captionBold,
    textTransform: 'uppercase',
  },
  colTimestamp: {
    width: 160,
  },
  colCategory: {
    width: 110,
  },
  colSeverity: {
    width: 100,
  },
  colAction: {
    width: 200,
  },
  colActor: {
    width: 160,
  },
  colTarget: {
    width: 150,
  },
  colPatient: {
    width: 140,
  },
  colOutcome: {
    width: 90,
  },
  colInspect: {
    width: 90,
  },
  body: {
    backgroundColor: theme.colors.surface,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceMuted,
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  metaContainer: {
    justifyContent: 'center',
  },
  metaText: {
    color: theme.colors.textSecondary,
    ...theme.typography.small,
  },
  paginationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
export default AuditTable;
