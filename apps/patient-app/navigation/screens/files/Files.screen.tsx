import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import * as Sharing from 'expo-sharing';
import EmptyState from '@ui/EmptyState';
import Button from '@ui/Button';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { ActiveSearchBanner, SearchModal } from '@ui/SearchModal';
import RenameModal from '../../../components/ui/RenameModal';
import BottomTabsHeaderRight from '../../../components/BottomTabsHeaderRight';
import { usePatientId } from 'hooks/usePatientId';
import { useContentInsets } from '../../../hooks/useContentInsets';
import {
  FileBrowserFile,
  deleteItem,
  syncPendingFiles,
  preparePreviewFile,
  renameFile,
  listFolderContents,
} from '../../../services/files';
import { resetAndRetryFailedUploads } from '../../../services/sync/uploadQueueService';
import { formatRecordFileName } from '../../../services/files/recordPresentation';
import type { FilesScreenProps } from './navigationTypes';
import { useFilesBrowser } from '../../../hooks/useFilesBrowser';
import { FileRow } from '../../../components/files/FileRow';
import { FilesHeader } from '../../../components/files/FilesHeader';
import { CategoryPillBar } from '../../../components/records/CategoryPillBar';
import { RecordSkeletonList } from '../../../components/records/RecordSkeletonList';
import {
  CATEGORY_FILTERS,
  filterAndSearchRecords,
  matchesCategoryFilter,
  type CategoryFilterId,
} from '../../../services/records/categories';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

export default function FilesScreen({ route }: FilesScreenProps<'FilesBrowserScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>('FilesBrowserScreen');
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const contentInsets = useContentInsets();
  const { runWithAutoLockPaused } = useAppAuth();

  const [renameTarget, setRenameTarget] = useState<{ id: string; initialName: string } | null>(null);
  const [query, setQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryFilterId>('all');

  // Browser state
  const { contents, isLoading, isRefreshing, error, refresh, mutate } = useFilesBrowser(patientId, null, '');

  const headerTitleText = 'Health Records & Documents';
  const hasActiveSearch = query.trim().length > 0;

  const openSearchDialog = useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  const handleRenameSave = async (newName: string) => {
    if (!renameTarget) return;
    try {
      await renameFile(patientId, renameTarget.id, newName);
      setRenameTarget(null);
      const newContents = await listFolderContents(patientId, null, query, getToken);
      await mutate(newContents, { revalidate: false });
      syncPendingFiles(patientId, getToken).then(() => mutate()).catch(console.error);
    } catch (e) {
      dialog.alert('Error', e instanceof Error ? e.message : 'Unable to rename item.');
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLargeTitleEnabled: true,
      headerTitle: headerTitleText,
      headerRight: () => (
        <BottomTabsHeaderRight
          onOpenSearch={openSearchDialog}
          hasActiveSearch={hasActiveSearch}
        />
      ),
    });
  }, [navigation, headerTitleText, openSearchDialog, hasActiveSearch]);

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
  const filteredRecords = useMemo(() => {
    return filterAndSearchRecords(contents?.files ?? [], activeCategory, query);
  }, [contents?.files, activeCategory, query]);

  // Count failed uploads for retry alert
  const failedCount = useMemo(() => {
    return (contents?.files ?? []).filter((f) => f.syncStatus === 'failed').length;
  }, [contents?.files]);

  const handleDelete = async (id: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete record?',
      message: 'This health record will be permanently deleted.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteItem(patientId, id, getToken);
      const newContents = await listFolderContents(patientId, null, query, getToken);
      await mutate(newContents, { revalidate: false });
      syncPendingFiles(patientId, getToken).then(() => mutate()).catch(console.error);
    } catch (err) {
      dialog.alert('Could not delete', err instanceof Error ? err.message : 'Unable to delete this item.');
    }
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingFiles(patientId, getToken);
      if (result.skipped) {
        dialog.alert('Backup waiting', result.reason ?? 'Records will sync when internet is connected.');
      } else if (result.failed > 0) {
        dialog.alert('Sync needs attention', `${result.synced} synced, ${result.failed} failed.`);
      }
      refresh();
    } catch (err) {
      dialog.alert('Sync failed', err instanceof Error ? err.message : 'Unable to sync records.');
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
      dialog.alert('Retry failed', err instanceof Error ? err.message : 'Unable to retry uploads.');
    } finally {
      setIsSyncing(false);
    }
  }, [patientId, getToken, refresh]);

  const shareFile = useCallback(
    async (fileId: string) => {
      try {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          dialog.alert('No app available', 'This device cannot share files with other apps.');
          return;
        }
        const preview = await preparePreviewFile(patientId, fileId, getToken);
        await runWithAutoLockPaused(() =>
          Sharing.shareAsync(preview.uri, { mimeType: preview.mimeType, dialogTitle: preview.name })
        );
      } catch (err) {
        dialog.alert('Could not share file', err instanceof Error ? err.message : 'Unable to share this file.');
      }
    },
    [patientId, runWithAutoLockPaused, getToken]
  );

  const openUpload = useCallback(() => {
    navigation.navigate('FilesUploadScreen');
  }, [navigation]);

  // 1. Loading State (pulse skeleton cards)
  if (isLoading && !contents) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <RecordSkeletonList count={4} />
      </View>
    );
  }

  // 2. Error State
  if (error && !contents) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md }]}>
        <AppIcon name="alert" size={sizes.avatarMd} color="emergency" />
        <ThemedText variant="h3">Unable to load records</ThemedText>
        <ThemedText variant="body" color="textMuted" style={{ textAlign: 'center' }}>
          {error.message || 'An unexpected error occurred while loading your health records.'}
        </ThemedText>
        <Button label="Try Again" variant="outline" onPress={refresh} />
      </View>
    );
  }

  // 3 & 4. Content and Empty States
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList<FileBrowserFile>
        data={filteredRecords}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.background}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: spacing.md,
            paddingBottom: contentInsets.bottom + spacing['3xl'],
          },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <CategoryPillBar
              selectedCategory={activeCategory}
              onSelectCategory={setActiveCategory}
              counts={categoryCounts}
            />
            {hasActiveSearch ? (
              <View style={{ paddingHorizontal: spacing.lg }}>
                <ActiveSearchBanner
                  query={query}
                  onEdit={openSearchDialog}
                  onClear={() => setQuery('')}
                />
              </View>
            ) : null}
            <FilesHeader
              contents={contents ?? null}
              failedCount={failedCount}
              isSyncing={isSyncing}
              onSync={handleSync}
              onRetryFailed={handleRetryFailed}
              patientId={patientId}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState
              title={hasActiveSearch || activeCategory !== 'all' ? 'No matching records' : 'No health records yet'}
              message={
                hasActiveSearch || activeCategory !== 'all'
                  ? 'Try searching with another keyword or select a different category.'
                  : 'Add diagnostic lab results, prescriptions, and certificates to access them offline anytime.'
              }
              actionLabel={hasActiveSearch || activeCategory !== 'all' ? 'Reset Filters' : 'Add Record'}
              onActionPress={
                hasActiveSearch || activeCategory !== 'all'
                  ? () => {
                      setQuery('');
                      setActiveCategory('all');
                    }
                  : openUpload
              }
            />
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <FileRow
              item={item}
              onPress={() => {
                navigation.navigate('FileViewerScreen', { fileId: item.id });
              }}
              onErrorPress={() => {
                dialog.alert(
                  'Upload Failed',
                  item.syncError || item.lastSyncError || 'This record failed to upload to the cloud.'
                );
              }}
              onRename={() => {
                setRenameTarget({
                  id: item.id,
                  initialName: formatRecordFileName(item),
                });
              }}
              onDelete={() => handleDelete(item.id)}
              onShare={() => shareFile(item.id)}
            />
          </View>
        )}
      />

      {/* Floating Action Button */}
      <View
        style={[styles.fabWrap, { right: spacing.lg, bottom: spacing.lg }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={openUpload}
          accessibilityRole="button"
          accessibilityLabel="Add health record"
          style={({ pressed }) => [
            styles.fab,
            {
              width: sizes.avatarMd + 16,
              height: sizes.avatarMd + 16,
              borderRadius: radii.full,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
            },
            shadows.lg,
          ]}
        >
          <AppIcon
            name="plus"
            color={colors.onPrimary}
            size={sizes.iconLg}
          />
        </Pressable>
      </View>

      <RenameModal
        visible={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        initialName={renameTarget?.initialName ?? ''}
        onSave={handleRenameSave}
        title="Rename record"
      />

      <SearchModal
        visible={isSearchModalOpen}
        title="Search Health Records"
        placeholder="Search records, facility, notes..."
        value={query}
        onApply={setQuery}
        onClose={() => setIsSearchModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: {},
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fabWrap: {
    position: 'absolute',
    alignItems: 'flex-end',
    zIndex: 9999,
  },
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
