import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import IconButton from '@ui/IconButton';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import Input from '@ui/Input';
import EmptyState from '@ui/EmptyState';
import { AppIcon, type IconName } from '@ui/Icon';
import { Divider } from '@ui/Primitives';
import Screen from '../../../components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import {
  FileBrowserFile,
  deleteItem,
  syncPendingFiles,
  preparePreviewFile,
  renameFile,
  listFolderContents,
  formatBytes,
} from '../../../services/files';
import { resetAndRetryFailedUploads } from '../../../services/sync/uploadQueueService';
import type { FilesScreenProps } from './navigationTypes';
import { useFilesBrowser } from '../../../hooks/useFilesBrowser';
import { FileRow } from '../../../components/files/FileRow.web';
import { CategoryPillBar } from '../../../components/records/CategoryPillBar';
import { RecordsSyncBanner } from '../../../components/records/RecordsSyncBanner';
import { RecordSkeletonList } from '../../../components/records/RecordSkeletonList';
import { ProvenanceBadge } from '../../../components/records/ProvenanceBadge';
import { ClinicalUrgencyBadge } from '../../../components/records/ClinicalUrgencyBadge';
import {
  CATEGORY_FILTERS,
  filterAndSearchRecords,
  matchesCategoryFilter,
  type CategoryFilterId,
} from '../../../services/records/categories';
import RenameModal from '../../../components/ui/RenameModal';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';
import type { ColorToken } from '../../../constants/theme';

type SortOption = 'name-asc' | 'name-desc' | 'date-desc' | 'size-desc';

const TYPE_META: Record<string, { colorToken: ColorToken; icon: IconName }> = {
  'file-type-xray': { colorToken: 'info', icon: 'activity' },
  'file-type-lab-result': { colorToken: 'success', icon: 'lab' },
  'file-type-medical-certificate': { colorToken: 'warning', icon: 'document' },
  'file-type-prescription': { colorToken: 'emergency', icon: 'pill' },
  'file-type-id': { colorToken: 'purple', icon: 'badge' },
};
const DEFAULT_TYPE: { colorToken: ColorToken; icon: IconName } = { colorToken: 'textSecondary', icon: 'document' };

function typeMeta(id: string) {
  return TYPE_META[id] ?? DEFAULT_TYPE;
}

function getFileMeta(file: FileBrowserFile) {
  if (file.previewKind === 'image') return { colorToken: 'purple' as ColorToken, icon: 'image' as IconName, label: 'Image' };
  if (file.previewKind === 'pdf') return { colorToken: 'emergency' as ColorToken, icon: 'pdf' as IconName, label: 'PDF' };
  const base = typeMeta(file.documentTypeId ?? '');
  return { ...base, label: file.typeLabel || 'Document' };
}

export default function FilesScreenWeb({ route }: FilesScreenProps<'FilesBrowserScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { isDesktop, isCompact } = useBreakpoint();

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilterId>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    initialName: string;
  } | null>(null);

  // Browser state
  const { contents, isLoading, error, refresh, mutate } = useFilesBrowser(
    patientId,
    null,
    ''
  );

  const handleRenameSave = async (newName: string) => {
    if (!renameTarget) return;
    try {
      await renameFile(patientId, renameTarget.id, newName);
      setRenameTarget(null);
      const newContents = await listFolderContents(patientId, null, query, getToken);
      await mutate(newContents, { revalidate: false });
      syncPendingFiles(patientId, getToken).then(() => mutate()).catch(console.error);
    } catch (e) {
      dialog.alert('Rename Error', e instanceof Error ? e.message : 'Unable to rename item.');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete record?',
      message: 'Are you sure you want to permanently delete this health record?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteItem(patientId, id, getToken);
      const newContents = await listFolderContents(patientId, null, query, getToken);
      await mutate(newContents, { revalidate: false });
      syncPendingFiles(patientId, getToken).then(() => mutate()).catch(console.error);
    } catch (error) {
      dialog.alert('Delete Failed', error instanceof Error ? error.message : 'Unable to delete item.');
    }
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingFiles(patientId, getToken);
      if (result.skipped) {
        dialog.alert('Backup Waiting', result.reason ?? 'Records will sync when internet is connected.');
      } else if (result.failed > 0) {
        dialog.alert('Backup Needs Attention', `${result.synced} backed up, ${result.failed} failed.`);
      }
      refresh();
    } catch (error) {
      dialog.alert('Backup Failed', error instanceof Error ? error.message : 'Unable to back up.');
    } finally {
      setIsSyncing(false);
    }
  }, [getToken, patientId, refresh]);

  const handleRetryFailed = useCallback(async () => {
    setIsSyncing(true);
    try {
      await resetAndRetryFailedUploads(patientId, getToken);
      await refresh();
    } catch (err) {
      dialog.alert('Retry Failed', err instanceof Error ? err.message : 'Unable to retry uploads.');
    } finally {
      setIsSyncing(false);
    }
  }, [patientId, getToken, refresh]);

  const handleDownloadFile = useCallback(
    async (fileId: string) => {
      try {
        const preview = await preparePreviewFile(patientId, fileId, getToken);
        if (typeof document !== 'undefined') {
          const link = document.createElement('a');
          link.href = preview.uri;
          link.download = preview.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(preview.uri, '_blank');
        }
      } catch (error) {
        dialog.alert('Download Error', error instanceof Error ? error.message : 'Unable to download file.');
      }
    },
    [patientId, getToken]
  );

  const openUpload = useCallback(() => {
    navigation.navigate('FilesUploadScreen');
  }, [navigation]);

  // Derive counts per category pill
  const categoryCounts = useMemo(() => {
    const allFiles = contents?.files ?? [];
    const counts: Partial<Record<CategoryFilterId, number>> = {
      all: allFiles.length,
    };
    for (const file of allFiles) {
      for (const filter of CATEGORY_FILTERS) {
        if (filter.id !== 'all' && matchesCategoryFilter(file, filter.id)) {
          counts[filter.id] = (counts[filter.id] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [contents?.files]);

  // Client-side multi-field filter and search
  const filteredAndSortedRecords = useMemo(() => {
    const filtered = filterAndSearchRecords(contents?.files ?? [], activeCategory, query);
    filtered.sort((a, b) => {
      if (sortBy === 'name-desc') {
        const nameA = a.title || a.name || '';
        const nameB = b.title || b.name || '';
        return nameB.localeCompare(nameA);
      }
      if (sortBy === 'date-desc') {
        const dateA = new Date(a.documentDate || a.createdAt || 0).getTime();
        const dateB = new Date(b.documentDate || b.createdAt || 0).getTime();
        return dateB - dateA;
      }
      if (sortBy === 'size-desc') {
        return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
      }
      const nameA = a.title || a.name || '';
      const nameB = b.title || b.name || '';
      return nameA.localeCompare(nameB);
    });
    return filtered;
  }, [contents?.files, activeCategory, query, sortBy]);

  // Count failed uploads
  const failedCount = useMemo(() => {
    return (contents?.files ?? []).filter((f) => f.syncStatus === 'failed').length;
  }, [contents?.files]);

  // Drop events on root area
  const dropHandlers = {
    onDragOver: (e: any) => {
      e.preventDefault();
      setIsDraggingOver(true);
    },
    onDragLeave: () => {
      setIsDraggingOver(false);
    },
    onDrop: (e: any) => {
      e.preventDefault();
      setIsDraggingOver(false);
      openUpload();
    },
  };

  return (
    <Screen width="full" scroll={true} padded={false}>
      <View
        {...(dropHandlers as any)}
        style={[
          styles.container,
          {
            padding: isCompact ? spacing.md : spacing['2xl'],
            backgroundColor: isDraggingOver ? colors.surfaceHighlight : colors.background,
          },
        ]}
      >
        <View style={[styles.layoutWrapper, isDesktop && styles.layoutRow, { gap: spacing.xl }]}>
          {/* Main Browser Column */}
          <View style={[styles.mainColumn, { gap: spacing.lg }]}>
            {/* Page Header + Primary Actions */}
            <View style={[styles.headerRow, { gap: spacing.md }]}>
              <View style={styles.headerTextWrap}>
                <ThemedText variant={isCompact ? 'h1' : 'display'}>
                  Health Records & Documents
                </ThemedText>
                <ThemedText variant="body" color="textSecondary">
                  Access lab results, prescriptions, medical certificates, and uploaded clinical documents.
                </ThemedText>
              </View>

              <View style={[styles.headerActions, { gap: spacing.sm }]}>
                <Button
                  label="Sync Now"
                  variant="outline"
                  size={isCompact ? 'sm' : 'md'}
                  icon="sync"
                  loading={isSyncing}
                  onPress={handleSync}
                />
                <Button
                  label="Add Record"
                  variant="primary"
                  size={isCompact ? 'sm' : 'md'}
                  icon="plus"
                  onPress={openUpload}
                />
              </View>
            </View>

            {/* Search & View Controls Bar */}
            <View
              style={[
                styles.filterBar,
                {
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  backgroundColor: colors.card,
                  padding: spacing.md,
                  gap: spacing.sm,
                },
                shadows.sm,
              ]}
            >
              <Input
                leftIcon="search"
                value={query}
                onChangeText={setQuery}
                placeholder="Search records, facility, notes..."
                containerStyle={styles.searchInputContainer}
                right={
                  query ? (
                    <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
                      <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
                    </Pressable>
                  ) : undefined
                }
              />

              <View style={[styles.viewControlsRow, { gap: spacing.sm }]}>
                {/* Grid / List Toggle */}
                <View
                  style={[
                    styles.toggleGroup,
                    {
                      borderColor: colors.border,
                      borderWidth: sizes.borderWidth,
                      borderRadius: radii.md,
                      backgroundColor: colors.surfaceSubtle,
                    },
                  ]}
                >
                  <IconButton
                    icon="menu"
                    accessibilityLabel="List view"
                    color={viewMode === 'list' ? 'primary' : 'textMuted'}
                    tone={viewMode === 'list' ? 'filled' : 'plain'}
                    onPress={() => setViewMode('list')}
                  />
                  <IconButton
                    icon="grid"
                    accessibilityLabel="Grid view"
                    color={viewMode === 'grid' ? 'primary' : 'textMuted'}
                    tone={viewMode === 'grid' ? 'filled' : 'plain'}
                    onPress={() => setViewMode('grid')}
                  />
                </View>

                {/* Sort Toggle */}
                <Pressable
                  onPress={() => {
                    setSortBy((curr) => {
                      if (curr === 'date-desc') return 'name-asc';
                      if (curr === 'name-asc') return 'name-desc';
                      if (curr === 'name-desc') return 'size-desc';
                      return 'date-desc';
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort: ${sortBy}`}
                  style={({ pressed }) => [
                    styles.sortBtn,
                    {
                      borderColor: colors.border,
                      borderWidth: sizes.borderWidth,
                      borderRadius: radii.md,
                      paddingHorizontal: spacing.md,
                      minHeight: sizes.controlMd,
                      backgroundColor: colors.card,
                      gap: spacing.xs,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <AppIcon name="sort" size={sizes.iconSm} color="textSecondary" />
                  <ThemedText variant="smallBold" color="textSecondary">
                    {sortBy === 'date-desc'
                      ? 'Newest Date'
                      : sortBy === 'name-asc'
                        ? 'Name (A-Z)'
                        : sortBy === 'name-desc'
                          ? 'Name (Z-A)'
                          : 'File Size'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            {/* Category Filter Pills */}
            <CategoryPillBar
              selectedCategory={activeCategory}
              onSelectCategory={setActiveCategory}
              counts={categoryCounts}
            />

            {/* Sync and Offline Banner */}
            <RecordsSyncBanner
              patientId={patientId}
              pendingCount={contents?.pendingSyncCount ?? 0}
              failedCount={failedCount}
              isSyncing={isSyncing}
              onSync={handleSync}
              onRetryFailed={handleRetryFailed}
            />

            {/* Browser Content */}
            {isLoading && !contents ? (
              <RecordSkeletonList count={4} />
            ) : error && !contents ? (
              <Card padding="lg">
                <View style={[styles.centerLoading, { gap: spacing.md }]}>
                  <AppIcon name="alert" size={sizes.avatarMd} color="emergency" />
                  <ThemedText variant="h3">Unable to load records</ThemedText>
                  <ThemedText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
                    {error.message || 'An unexpected error occurred while accessing local records.'}
                  </ThemedText>
                  <Button label="Try Again" variant="outline" onPress={refresh} />
                </View>
              </Card>
            ) : filteredAndSortedRecords.length === 0 ? (
              <EmptyState
                icon="files"
                title={query || activeCategory !== 'all' ? 'No matching records' : 'No health records yet'}
                message={
                  query || activeCategory !== 'all'
                    ? 'Try searching with a different keyword or select another category.'
                    : 'Drop files here to upload, or click "Add Record" to attach clinical documents.'
                }
                actionLabel={query || activeCategory !== 'all' ? 'Reset Filters' : 'Add Record'}
                onActionPress={
                  query || activeCategory !== 'all'
                    ? () => {
                        setQuery('');
                        setActiveCategory('all');
                      }
                    : openUpload
                }
              />
            ) : (
              <View style={{ gap: spacing.lg }}>
                <View style={{ gap: spacing.sm }}>
                  <ThemedText variant="captionBold" color="textMuted" style={{ textTransform: 'uppercase' }}>
                    Records ({filteredAndSortedRecords.length})
                  </ThemedText>
                  {viewMode === 'list' ? (
                    <View style={{ gap: spacing.xs }}>
                      {filteredAndSortedRecords.map((file) => (
                        <FileRow
                          key={file.id}
                          item={file}
                          onPress={() => navigation.navigate('FileViewerScreen', { fileId: file.id })}
                          onDownload={() => handleDownloadFile(file.id)}
                          onRename={() =>
                            setRenameTarget({
                              id: file.id,
                              initialName: file.name,
                            })
                          }
                          onDelete={() => handleDelete(file.id)}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={[styles.gridRow, { gap: spacing.md }]}>
                      {filteredAndSortedRecords.map((file) => {
                        const meta = getFileMeta(file);
                        const displayTitle = file.title?.trim() || file.name;
                        const rawDate = file.documentDate || file.createdAt;
                        const dateStr = rawDate
                          ? new Date(rawDate).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '';

                        return (
                          <Pressable
                            key={file.id}
                            onPress={() => navigation.navigate('FileViewerScreen', { fileId: file.id })}
                            style={({ pressed }) => [
                              styles.fileGridCard,
                              {
                                backgroundColor: colors.card,
                                borderColor: colors.border,
                                borderWidth: sizes.borderWidth,
                                borderRadius: radii.lg,
                                padding: spacing.md,
                                gap: spacing.sm,
                                opacity: pressed ? 0.9 : 1,
                              },
                              shadows.sm,
                            ]}
                          >
                            <View style={styles.gridCardTop}>
                              <View
                                style={[
                                  styles.cardIconBox,
                                  {
                                    width: sizes.controlLg,
                                    height: sizes.controlLg,
                                    borderRadius: radii.md,
                                    backgroundColor: colors.surfaceSubtle,
                                  },
                                ]}
                              >
                                <AppIcon name={meta.icon} color={meta.colorToken} size={sizes.iconLg} />
                              </View>
                              <View style={{ flexDirection: 'row', gap: spacing.xxs }}>
                                <IconButton
                                  icon="download"
                                  accessibilityLabel="Download"
                                  color="primary"
                                  size={sizes.iconSm}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleDownloadFile(file.id);
                                  }}
                                />
                                <IconButton
                                  icon="trash"
                                  accessibilityLabel="Delete"
                                  color="emergency"
                                  size={sizes.iconSm}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleDelete(file.id);
                                  }}
                                />
                              </View>
                            </View>

                            <ThemedText variant="bodyBold" numberOfLines={2}>
                              {displayTitle}
                            </ThemedText>

                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                              <Badge tone="neutral" label={meta.label} size="sm" />
                              <ClinicalUrgencyBadge
                                urgency={(file as any).urgency}
                                isCritical={(file as any).isCritical}
                              />
                              <ProvenanceBadge
                                provenance={(file as any).provenance}
                                clinicId={file.clinicId}
                                facilityName={file.facilityName}
                                compact
                              />
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <ThemedText variant="caption" color="textMuted">
                                {file.facilityName || dateStr}
                              </ThemedText>
                              <ThemedText variant="caption" color="textMuted">
                                {formatBytes(file.sizeBytes)}
                              </ThemedText>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Right Rail: Health Records Hub (>= 1024 Desktop) */}
          {isDesktop && (
            <View style={[styles.sideRail, { width: 320, gap: spacing.lg }]}>
              <Card padding="lg" elevation="sm">
                <View style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <AppIcon name="shield" size={sizes.iconMd} color="primary" />
                    <ThemedText variant="h3">Health Records</ThemedText>
                  </View>
                  <ThemedText variant="small" color="textMuted">
                    Your clinical documents, lab results, and patient records are cached offline for instant access anywhere.
                  </ThemedText>
                  <Divider />
                  <View style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <AppIcon name="checkCircle" size={sizes.iconSm} color="success" />
                      <ThemedText variant="small">Offline availability</ThemedText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <AppIcon name="lock" size={sizes.iconSm} color="primary" />
                      <ThemedText variant="small">Server-side PMK encryption</ThemedText>
                    </View>
                  </View>
                </View>
              </Card>
            </View>
          )}
        </View>

        {/* Drop zone visual hint when dragging */}
        {isDraggingOver && (
          <View
            style={[
              styles.dragOverlay,
              {
                backgroundColor: colors.overlay,
                borderRadius: radii.xl,
              },
            ]}
          >
            <AppIcon name="upload" size={sizes.avatarLg} color={colors.onPrimary} />
            <ThemedText variant="h2" color={colors.onPrimary} style={{ marginTop: spacing.md }}>
              Drop files to upload
            </ThemedText>
          </View>
        )}
      </View>

      <RenameModal
        visible={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        initialName={renameTarget?.initialName ?? ''}
        onSave={handleRenameSave}
        title="Rename Record"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100%',
  },
  layoutWrapper: {
    width: '100%',
    maxWidth: 1400,
    marginHorizontal: 'auto',
  },
  layoutRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
  },
  sideRail: {},
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 240,
    gap: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchInputContainer: {
    marginBottom: 0,
    flex: 1,
    minWidth: 220,
  },
  viewControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerLoading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  fileGridCard: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 200,
  },
  gridCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardIconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
});
