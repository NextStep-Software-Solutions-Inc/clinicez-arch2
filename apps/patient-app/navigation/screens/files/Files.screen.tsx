import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import * as Sharing from 'expo-sharing';
import EmptyState from '@ui/EmptyState';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import RenameModal from '../../../components/ui/RenameModal';
import { usePatientId } from 'hooks/usePatientId';
import { useContentInsets } from '../../../hooks/useContentInsets';
import {
  FileBrowserFile,
  FileBrowserFolder,
  FileItemKind,
  deleteItem,
  syncPendingFiles,
  preparePreviewFile,
  renameFile,
  renameFolder,
  listFolderContents,
} from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { useFilesBrowser, useFrkCheck } from '../../../hooks/useFilesBrowser';
import { FileRow } from '../../../components/files/FileRow';
import { FilesHeader } from '../../../components/files/FilesHeader';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';

type BrowserItem = FileBrowserFolder | FileBrowserFile;
type SectionHeader = { kind: 'section'; title: string; id: string };
type ListEntry = BrowserItem | SectionHeader;

export default function FilesScreen({ route }: FilesScreenProps<'FilesBrowserScreen'>) {
  const { colors, spacing, radii, sizes, typography, shadows } = useAppTheme();
  const navigation = useNavigation<any>('FilesBrowserScreen');
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const contentInsets = useContentInsets();
  const { runWithAutoLockPaused } = useAppAuth();
  const folderId = route.params?.folderId;

  const [fabOpen, setFabOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ kind: 'file' | 'folder'; id: string; initialName: string } | null>(null);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Hook checks and browser state
  useFrkCheck(patientId);
  const { contents, isLoading, isRefreshing, refresh, mutate } = useFilesBrowser(patientId, folderId ?? null, query);

  const folderName = folderId
    ? (contents?.breadcrumbs?.length ? contents.breadcrumbs[contents.breadcrumbs.length - 1].name : 'Folder')
    : 'My Files';

  const handleRenameSave = async (newName: string) => {
    if (!renameTarget) return;
    try {
      if (renameTarget.kind === 'folder') {
        await renameFolder(patientId, renameTarget.id, newName);
      } else {
        await renameFile(patientId, renameTarget.id, newName);
      }
      setRenameTarget(null);
      const newContents = await listFolderContents(patientId, folderId ?? null, query, getToken);
      await mutate(newContents, { revalidate: false });
      syncPendingFiles(patientId, getToken).then(() => mutate()).catch(console.error);
    } catch (e) {
      dialog.alert('Error', e instanceof Error ? e.message : 'Unable to rename item.');
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLargeTitleEnabled: !isSearching,
      headerTitle: isSearching ? () => (
        <View style={styles.searchHeaderWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search files and folders…"
            placeholderTextColor={colors.textLight}
            autoFocus
            style={[
              styles.searchHeaderInput,
              typography.body,
              {
                color: colors.text,
                backgroundColor: colors.card,
                borderRadius: radii.md,
                borderWidth: sizes.borderWidth,
                borderColor: colors.border,
                paddingHorizontal: spacing.md,
              },
            ]}
          />
        </View>
      ) : folderName,
      headerRight: () => (
        <View style={[styles.headerRightWrap, { gap: spacing.xs }]}>
          <Pressable
            onPress={() => {
              if (isSearching) {
                setQuery('');
                setIsSearching(false);
              } else {
                setIsSearching(true);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={isSearching ? 'Close search' : 'Search files'}
            style={({ pressed }) => [{ padding: spacing.sm, opacity: pressed ? 0.7 : 1 }]}
          >
            <AppIcon name={isSearching ? 'close' : 'search'} color="text" size={sizes.iconLg} />
          </Pressable>
          {!isSearching && (
            <Pressable
              onPress={() => navigation.navigate('StorageScreen', { folderId: folderId ?? null })}
              accessibilityRole="button"
              accessibilityLabel="Storage overview"
              style={({ pressed }) => [{ padding: spacing.sm, opacity: pressed ? 0.7 : 1 }]}
            >
              <AppIcon name="cloud" color="primary" size={sizes.iconLg} />
            </Pressable>
          )}
        </View>
      ),
    });
  }, [navigation, folderName, folderId, colors, isSearching, query, radii, sizes, spacing, typography]);

  const items = useMemo<ListEntry[]>(() => {
    const folders = contents?.folders ?? [];
    const files = contents?.files ?? [];
    const result: ListEntry[] = [];
    if (folders.length > 0) {
      result.push({ kind: 'section', title: 'Folders', id: '__folders__' });
      result.push(...folders);
    }
    if (files.length > 0) {
      result.push({ kind: 'section', title: 'Files', id: '__files__' });
      result.push(...files);
    }
    return result;
  }, [contents]);

  const handleDelete = async (kind: FileItemKind, id: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete item?',
      message: 'This item will be deleted.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteItem(patientId, kind, id);
      const newContents = await listFolderContents(patientId, folderId ?? null, query, getToken);
      await mutate(newContents, { revalidate: false });
      syncPendingFiles(patientId, getToken).then(() => mutate()).catch(console.error);
    } catch (error) {
      dialog.alert('Could not delete', error instanceof Error ? error.message : 'Unable to delete this item.');
    }
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingFiles(patientId, getToken);
      if (result.skipped) {
        dialog.alert('Backup waiting', result.reason ?? 'Files will back up when connected.');
      } else if (result.failed > 0) {
        dialog.alert('Backup needs attention', `${result.synced} backed up, ${result.failed} failed.`);
      }
      refresh();
    } catch (error) {
      dialog.alert('Backup failed', error instanceof Error ? error.message : 'Unable to back up.');
    } finally {
      setIsSyncing(false);
    }
  }, [getToken, patientId, refresh]);

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
      } catch (error) {
        dialog.alert('Could not share file', error instanceof Error ? error.message : 'Unable to share this file.');
      }
    },
    [patientId, runWithAutoLockPaused, getToken]
  );

  const openUpload = useCallback(() => {
    navigation.navigate('FilesUploadScreen', { folderId: folderId ?? null });
  }, [folderId, navigation]);

  const createFolder = useCallback(() => {
    navigation.navigate('FileFolderFormScreen', { parentId: folderId ?? null });
  }, [folderId, navigation]);

  const openRoot = useCallback(() => {
    navigation.navigate('FilesBrowserScreen');
  }, [navigation]);

  const openFolder = useCallback(
    (id: string) => {
      navigation.navigate('FilesBrowserScreen', { folderId: id });
    },
    [navigation]
  );

  if (isLoading && !contents) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, gap: spacing.md }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <ThemedText variant="body" color="textMuted">
          Loading your files…
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList<ListEntry>
        data={items}
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
            padding: spacing.lg,
            paddingBottom: contentInsets.bottom + spacing['3xl'],
          },
        ]}
        ItemSeparatorComponent={({ leadingItem }) =>
          (leadingItem as ListEntry).kind === 'section' ? null : <View style={{ height: spacing.sm }} />
        }
        ListHeaderComponent={
          <FilesHeader
            contents={contents ?? null}
            folderId={folderId}
            isSyncing={isSyncing}
            onCreateFolder={createFolder}
            onOpenFolder={openFolder}
            onOpenRoot={openRoot}
            onOpenUpload={openUpload}
            onSync={handleSync}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title={query ? 'No matching files' : 'No files yet'}
            message={
              query
                ? 'Try a different search term.'
                : 'Add health documents or create folders to stay organized.'
            }
            actionLabel={query ? undefined : 'Add a file'}
            onActionPress={query ? undefined : openUpload}
          />
        }
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return (
              <ThemedText
                variant="captionBold"
                color="textMuted"
                style={[
                  styles.sectionHead,
                  {
                    marginTop: spacing.md,
                    marginBottom: spacing.xs,
                    marginLeft: spacing.xs,
                  },
                ]}
              >
                {item.title}
              </ThemedText>
            );
          }
          const bItem = item;
          return (
            <FileRow
              item={bItem}
              onPress={() => {
                if (bItem.kind === 'folder') {
                  navigation.push('FilesBrowserScreen', { folderId: bItem.id });
                } else {
                  navigation.navigate('FileViewerScreen', { fileId: bItem.id });
                }
              }}
              onErrorPress={() => {
                dialog.alert(
                  'Upload Failed',
                  (bItem as FileBrowserFile).syncError ?? 'This file failed to upload to the cloud.'
                );
              }}
              onRename={() => {
                setRenameTarget({
                  kind: bItem.kind as 'file' | 'folder',
                  id: bItem.id,
                  initialName: bItem.name,
                });
              }}
              onMove={() =>
                navigation.navigate('FileMoveScreen', {
                  itemKind: bItem.kind,
                  itemId: bItem.id,
                  currentFolderId:
                    bItem.kind === 'folder'
                      ? (bItem as FileBrowserFolder).parentId
                      : (bItem as FileBrowserFile).folderId,
                })
              }
              onDelete={() => handleDelete(bItem.kind, bItem.id)}
              onShare={() => shareFile(bItem.id)}
            />
          );
        }}
      />

      {/* Floating Action Button */}
      <View
        style={[styles.fabWrap, { right: spacing.xl, bottom: contentInsets.bottom + spacing.md }]}
        pointerEvents="box-none"
      >
        {fabOpen && (
          <View style={[styles.fabMenu, { marginBottom: spacing.sm, gap: spacing.sm }]}>
            <Pressable
              onPress={() => {
                setFabOpen(false);
                createFolder();
              }}
              accessibilityRole="button"
              accessibilityLabel="New folder"
              style={({ pressed }) => [
                styles.fabItem,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  gap: spacing.md,
                  opacity: pressed ? 0.8 : 1,
                },
                shadows.md,
              ]}
            >
              <AppIcon name="folderPlus" color="primary" size={sizes.iconMd} />
              <ThemedText variant="bodyBold">New folder</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                setFabOpen(false);
                openUpload();
              }}
              accessibilityRole="button"
              accessibilityLabel="Upload file"
              style={({ pressed }) => [
                styles.fabItem,
                {
                  backgroundColor: colors.primary,
                  borderRadius: radii.lg,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  gap: spacing.md,
                  opacity: pressed ? 0.85 : 1,
                },
                shadows.md,
              ]}
            >
              <AppIcon name="upload" color={colors.onPrimary} size={sizes.iconMd} />
              <ThemedText variant="bodyBold" color={colors.onPrimary}>
                Upload file
              </ThemedText>
            </Pressable>
          </View>
        )}
        <Pressable
          onPress={() => setFabOpen((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={fabOpen ? 'Close menu' : 'Add files or folders'}
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
            name={fabOpen ? 'close' : 'plus'}
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
        title={renameTarget?.kind === 'folder' ? 'Rename folder' : 'Rename file'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: {},
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHead: {
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  searchHeaderWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingRight: 8,
  },
  searchHeaderInput: {
    flex: 1,
    height: 38,
    paddingVertical: Platform.select({ ios: 6, android: 4 }),
  },
  headerRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  fabWrap: {
    position: 'absolute',
    alignItems: 'flex-end',
    zIndex: 9999,
  },
  fabMenu: {
    alignItems: 'flex-end',
  },
  fabItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});