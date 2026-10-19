import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import { IconSlot } from '../ui/Icon';
import AuditTableRow from './AuditTableRow';
import AuditTableSkeleton from './AuditTableSkeleton';
import AuditEmptyState from './AuditEmptyState';
import { useVirtualList } from '../../utils/useVirtualList';
import { useBreakpoint } from '../../utils/useBreakpoint';
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
  scrollY?: number;
  viewportHeight?: number;
  listTopOffset?: number;
  viewMode?: 'cards' | 'table';
  onViewModeChange?: (mode: 'cards' | 'table') => void;
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
  scrollY = 0,
  viewportHeight = 800,
  listTopOffset = 0,
  viewMode: controlledViewMode,
  onViewModeChange,
}: AuditTableProps) {
  const { isCompact } = useBreakpoint();
  const [internalViewMode, setInternalViewMode] = useState<'cards' | 'table'>(
    isCompact ? 'cards' : 'table'
  );

  const effectiveViewMode = controlledViewMode ?? internalViewMode;
  const isTable = effectiveViewMode === 'table';

  const handleViewModeToggle = (mode: 'cards' | 'table') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  const itemHeight = isTable ? 52 : 160;
  const virtualWindow = useVirtualList({
    items,
    itemHeight,
    viewportHeight: viewportHeight || 800,
    scrollY: scrollY || 0,
    listTopOffset: listTopOffset || 0,
    itemsPerRow: 1,
    overscan: isTable ? 8 : 4,
  });

  if (loading && items.length === 0) {
    return <AuditTableSkeleton rows={8} />;
  }

  if (!loading && items.length === 0) {
    return <AuditEmptyState onResetFilters={onResetFilters} filterSummary={filterSummary} />;
  }

  return (
    <View style={styles.container}>
      {/* Top Bar with Record Counter & Responsive View Mode Toggle */}
      <View style={styles.tableTopBar}>
        <ThemedText style={styles.recordCountText}>
          {totalCount > 0 ? `${totalCount} records` : `${items.length} records`}
          {virtualWindow.isVirtualizing ? ' · Virtualized' : ''}
        </ThemedText>

        <View style={styles.viewToggleGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch to card view"
            onPress={() => handleViewModeToggle('cards')}
            style={[
              styles.toggleBtn,
              !isTable ? styles.toggleBtnActive : styles.toggleBtnInactive,
            ]}
          >
            <IconSlot
              value="dashboard"
              size={theme.sizes.iconSm}
              color={!isTable ? theme.colors.primary : theme.colors.textMuted}
            />
            <ThemedText
              style={[
                styles.toggleText,
                !isTable ? styles.toggleTextActive : styles.toggleTextInactive,
              ]}
            >
              Cards
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch to table view"
            onPress={() => handleViewModeToggle('table')}
            style={[
              styles.toggleBtn,
              isTable ? styles.toggleBtnActive : styles.toggleBtnInactive,
            ]}
          >
            <IconSlot
              value="clipboard"
              size={theme.sizes.iconSm}
              color={isTable ? theme.colors.primary : theme.colors.textMuted}
            />
            <ThemedText
              style={[
                styles.toggleText,
                isTable ? styles.toggleTextActive : styles.toggleTextInactive,
              ]}
            >
              Table
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Table Mode (9-Column Workstation Layout) */}
      {isTable ? (
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

            {/* Table Body with Top & Bottom Virtual Spacers */}
            <View style={styles.body}>
              {virtualWindow.paddingTop > 0 && (
                <View style={{ height: virtualWindow.paddingTop, width: '100%' }} />
              )}
              {virtualWindow.visibleItems.map((entry, index) => {
                const globalIndex = virtualWindow.startIndex + index;
                return (
                  <AuditTableRow
                    key={entry.id}
                    entry={entry}
                    onInspect={onInspect}
                    isEven={globalIndex % 2 === 1}
                    mode="table"
                  />
                );
              })}
              {virtualWindow.paddingBottom > 0 && (
                <View style={{ height: virtualWindow.paddingBottom, width: '100%' }} />
              )}
            </View>
          </View>
        </ScrollView>
      ) : (
        /* Mobile Responsive Card Mode */
        <View style={styles.cardListWrapper}>
          {virtualWindow.paddingTop > 0 && (
            <View style={{ height: virtualWindow.paddingTop, width: '100%' }} />
          )}
          {virtualWindow.visibleItems.map((entry, index) => {
            const globalIndex = virtualWindow.startIndex + index;
            return (
              <AuditTableRow
                key={entry.id}
                entry={entry}
                onInspect={onInspect}
                isEven={globalIndex % 2 === 1}
                mode="card"
              />
            );
          })}
          {virtualWindow.paddingBottom > 0 && (
            <View style={{ height: virtualWindow.paddingBottom, width: '100%' }} />
          )}
        </View>
      )}

      {/* Stream & Infinite Scroll Status */}
      {loadingEarlier && (
        <View style={styles.loadingEarlierBanner}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <ThemedText style={styles.loadingEarlierText}>
            Loading earlier audit records...
          </ThemedText>
        </View>
      )}

      {/* Pagination & Stream Footer */}
      <View style={styles.footer}>
        <View style={styles.metaContainer}>
          <ThemedText style={styles.metaText}>
            Showing {items.length} {totalCount > 0 ? `of ${totalCount}` : ''} entries · Page {pageNumber}
          </ThemedText>
          {!hasMore && items.length > 0 && (
            <ThemedText style={styles.allLoadedText}>
              All {items.length} audit records loaded
            </ThemedText>
          )}
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
  allLoadedText: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
  },
  paginationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tableTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  recordCountText: {
    color: theme.colors.textSecondary,
    ...theme.typography.captionBold,
  },
  viewToggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.xs,
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  toggleBtnInactive: {
    backgroundColor: theme.colors.transparent,
  },
  toggleText: {
    ...theme.typography.captionBold,
  },
  toggleTextActive: {
    color: theme.colors.primary,
  },
  toggleTextInactive: {
    color: theme.colors.textMuted,
  },
  cardListWrapper: {
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  loadingEarlierBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  loadingEarlierText: {
    color: theme.colors.textSecondary,
    ...theme.typography.caption,
  },
});
export default AuditTable;
