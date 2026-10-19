import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
import { ProgressBar, Divider } from '@ui/Primitives';
import Screen from '../../../components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
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
  formatBytes,
  getFileConfig,
} from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { useFilesBrowser, useFrkCheck } from '../../../hooks/useFilesBrowser';
import { FileRow } from '../../../components/files/FileRow.web';
import RenameModal from '../../../components/ui/RenameModal';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';
import type { ColorToken } from '../../../constants/theme';
import useSWR from 'swr';

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
  const { isDesktop } = useBreakpoint();

  const folderId = route.params?.folderId;
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    kind: 'file' | 'folder';
    id: string;
    initialName: string;
  } | null>(null);

  // Hook checks and browser state
  useFrkCheck(patientId);
  const { contents, isLoading, isRefreshing, refresh, mutate } = useFilesBrowser(
    patientId,
    folderId ?? null,
    query
  );

  // Storage config for quota bar
  const { data: fileConfig } = useSWR(
    ['files-config-overview', patientId],
    () => getFileConfig(patientId, getToken),
    { revalidateOnFocus: false }
  );

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
      dialog.alert('Rename Error', e instanceof Error ? e.message : 'Unable to rename item.');
    }
  };

  const handleDelete = async (kind: FileItemKind, id: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete item?',
      message: `Are you sure you want to delete this ${kind}?`,
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
      dialog.alert('Delete Failed', error instanceof Error ? error.message : 'Unable to delete item.');
    }
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingFiles(patientId, getToken);
      if (result.skipped) {
        dialog.alert('Backup Waiting', result.reason ?? 'Files will back up when internet is connected.');
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
      navigation.push('FilesBrowserScreen', { folderId: id });
    },
    [navigation]
  );

  // Sorting
  const sortedFolders = useMemo(() => {
    const list = [...(contents?.folders ?? [])];
    list.sort((a, b) => {
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [contents?.folders, sortBy]);

  const sortedFiles = useMemo(() => {
    const list = [...(contents?.files ?? [])];
    list.sort((a, b) => {
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'date-desc') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortBy === 'size-desc') return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [contents?.files, sortBy]);

  const usedBytes = fileConfig?.usedStorageBytes ?? 0;
  const quotaBytes = fileConfig?.quotaBytes ?? 500 * 1024 * 1024;
  const usedRatio = quotaBytes > 0 ? Math.min(1, usedBytes / quotaBytes) : 0;

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
            padding: spacing.xl,
            backgroundColor: isDraggingOver ? colors.surfaceHighlight : colors.background,
          },
        ]}
      >
        <View style={[styles.layoutWrapper, isDesktop && styles.layoutRow, { gap: spacing.xl }]}>
          {/* Main Browser Column */}
          <View style={[styles.mainColumn, { gap: spacing.lg }]}>
            {/* Action Bar (Upload, New Folder, Sync) */}
            <View style={[styles.actionRow, { gap: spacing.md }]}>
              <View style={[styles.leftActions, { gap: spacing.sm }]}>
                <Button
                  label="Upload"
                  variant="primary"
                  icon="upload"
                  onPress={openUpload}
                />
                <Button
                  label="New folder"
                  variant="outline"
                  icon="folderPlus"
                  onPress={createFolder}
                />
              </View>

              <View style={[styles.rightActions, { gap: spacing.sm }]}>
                {/* Grid / List Toggle */}
                <View
                  style={[
                    styles.toggleGroup,
                    {
                      borderColor: colors.border,
                      borderWidth: sizes.borderWidth,
                      borderRadius: radii.md,
                      backgroundColor: colors.card,
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
                    icon="activity"
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
                      if (curr === 'name-asc') return 'name-desc';
                      if (curr === 'name-desc') return 'date-desc';
                      if (curr === 'date-desc') return 'size-desc';
                      return 'name-asc';
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
                      paddingVertical: spacing.sm,
                      backgroundColor: colors.card,
                      gap: spacing.xs,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <AppIcon name="sort" size={sizes.iconSm} color="textSecondary" />
                  <ThemedText variant="smallBold" color="textSecondary">
                    {sortBy === 'name-asc'
                      ? 'Name (A-Z)'
                      : sortBy === 'name-desc'
                        ? 'Name (Z-A)'
                        : sortBy === 'date-desc'
                          ? 'Newest'
                          : 'Size'}
                  </ThemedText>
                </Pressable>

                <IconButton
                  icon="sync"
                  accessibilityLabel="Sync now"
                  color="primary"
                  onPress={handleSync}
                  disabled={isSyncing}
                />
              </View>
            </View>

            {/* Breadcrumbs + Search Filter Bar */}
            <View
              style={[
                styles.filterBar,
                {
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  backgroundColor: colors.card,
                  padding: spacing.sm,
                  gap: spacing.md,
                },
                shadows.sm,
              ]}
            >
              {/* Breadcrumb Trail */}
              <View style={[styles.crumbRow, { gap: spacing.xs }]}>
                <Pressable
                  onPress={openRoot}
                  accessibilityRole="button"
                  accessibilityLabel="Root folder"
                  style={styles.crumbBtn}
                >
                  <AppIcon name="home" size={sizes.iconSm} color={!folderId ? 'primary' : 'textMuted'} />
                  <ThemedText
                    variant="smallBold"
                    color={!folderId ? 'primary' : 'textSecondary'}
                    style={{ marginLeft: spacing.xxs }}
                  >
                    All files
                  </ThemedText>
                </Pressable>

                {contents?.breadcrumbs?.map((crumb, idx) => {
                  const isLast = idx === contents.breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={crumb.id}>
                      <ThemedText variant="caption" color="textLight">
                        /
                      </ThemedText>
                      <Pressable
                        onPress={() => (isLast ? undefined : openFolder(crumb.id))}
                        disabled={isLast}
                        accessibilityRole="button"
                        accessibilityLabel={crumb.name}
                        style={styles.crumbBtn}
                      >
                        <ThemedText
                          variant="smallBold"
                          color={isLast ? 'primary' : 'textSecondary'}
                        >
                          {crumb.name}
                        </ThemedText>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </View>

              {/* Search input field */}
              <View
                style={[
                  styles.searchField,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.border,
                    borderWidth: sizes.borderWidth,
                    borderRadius: radii.md,
                    paddingHorizontal: spacing.sm,
                    gap: spacing.xs,
                  },
                ]}
              >
                <AppIcon name="search" size={sizes.iconSm} color="textMuted" />
                <Input
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search files..."
                  containerStyle={{ marginBottom: 0, flex: 1 }}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
                    <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Browser Content */}
            {isLoading && !contents ? (
              <View style={[styles.centerLoading, { paddingVertical: spacing['5xl'], gap: spacing.md }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <ThemedText variant="body" color="textMuted">
                  Opening encrypted vault...
                </ThemedText>
              </View>
            ) : sortedFolders.length === 0 && sortedFiles.length === 0 ? (
              <Card padding="lg">
                <EmptyState
                  title={query ? 'No matching documents' : 'No documents in this folder'}
                  message={
                    query
                      ? 'Try searching with a different keyword or filename.'
                      : 'Drop files here to upload, or click "Upload" to select health documents.'
                  }
                  actionLabel={query ? undefined : 'Upload files'}
                  onActionPress={query ? undefined : openUpload}
                />
              </Card>
            ) : (
              <View style={{ gap: spacing.lg }}>
                {/* Folders List/Grid */}
                {sortedFolders.length > 0 && (
                  <View style={{ gap: spacing.sm }}>
                    <ThemedText variant="captionBold" color="textMuted" style={{ textTransform: 'uppercase' }}>
                      Folders ({sortedFolders.length})
                    </ThemedText>
                    {viewMode === 'list' ? (
                      <View style={{ gap: spacing.xs }}>
                        {sortedFolders.map((f) => (
                          <FileRow
                            key={f.id}
                            item={f}
                            onPress={() => openFolder(f.id)}
                            onMove={() =>
                              navigation.navigate('FileMoveScreen', {
                                itemKind: 'folder',
                                itemId: f.id,
                                currentFolderId: f.parentId,
                              })
                            }
                            onRename={() =>
                              setRenameTarget({
                                kind: 'folder',
                                id: f.id,
                                initialName: f.name,
                              })
                            }
                            onDelete={() => handleDelete('folder', f.id)}
                          />
                        ))}
                      </View>
                    ) : (
                      <View style={[styles.gridRow, { gap: spacing.md }]}>
                        {sortedFolders.map((folder) => (
                          <Pressable
                            key={folder.id}
                            onPress={() => openFolder(folder.id)}
                            style={({ pressed }) => [
                              styles.folderGridCard,
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
                                    backgroundColor: colors.warningBg,
                                  },
                                ]}
                              >
                                <AppIcon name="folder" color="warning" size={sizes.iconLg} />
                              </View>
                              <View style={{ flexDirection: 'row', gap: spacing.xxs }}>
                                <IconButton
                                  icon="edit"
                                  accessibilityLabel="Rename"
                                  size={sizes.iconSm}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    setRenameTarget({
                                      kind: 'folder',
                                      id: folder.id,
                                      initialName: folder.name,
                                    });
                                  }}
                                />
                                <IconButton
                                  icon="trash"
                                  accessibilityLabel="Delete"
                                  color="emergency"
                                  size={sizes.iconSm}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleDelete('folder', folder.id);
                                  }}
                                />
                              </View>
                            </View>
                            <ThemedText variant="bodyBold" numberOfLines={1}>
                              {folder.name}
                            </ThemedText>
                            <ThemedText variant="caption" color="textMuted">
                              {folder.childCount} items
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Files List/Grid */}
                {sortedFiles.length > 0 && (
                  <View style={{ gap: spacing.sm }}>
                    <ThemedText variant="captionBold" color="textMuted" style={{ textTransform: 'uppercase' }}>
                      Files ({sortedFiles.length})
                    </ThemedText>
                    {viewMode === 'list' ? (
                      <View style={{ gap: spacing.xs }}>
                        {sortedFiles.map((file) => (
                          <FileRow
                            key={file.id}
                            item={file}
                            onPress={() => navigation.navigate('FileViewerScreen', { fileId: file.id })}
                            onDownload={() => handleDownloadFile(file.id)}
                            onMove={() =>
                              navigation.navigate('FileMoveScreen', {
                                itemKind: 'file',
                                itemId: file.id,
                                currentFolderId: file.folderId,
                              })
                            }
                            onRename={() =>
                              setRenameTarget({
                                kind: 'file',
                                id: file.id,
                                initialName: file.name,
                              })
                            }
                            onDelete={() => handleDelete('file', file.id)}
                          />
                        ))}
                      </View>
                    ) : (
                      <View style={[styles.gridRow, { gap: spacing.md }]}>
                        {sortedFiles.map((file) => {
                          const meta = getFileMeta(file);
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
                                      handleDelete('file', file.id);
                                    }}
                                  />
                                </View>
                              </View>

                              <ThemedText variant="bodyBold" numberOfLines={2}>
                                {file.name}
                              </ThemedText>

                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Badge tone="neutral" label={meta.label} size="sm" />
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
                )}
              </View>
            )}
          </View>

          {/* Right Rail: Details & Storage Usage (>= 1024 Desktop) */}
          {isDesktop && (
            <View style={[styles.sideRail, { width: 320, gap: spacing.lg }]}>
              {/* Storage Overview Card */}
              <Card padding="lg" elevation="sm">
                <View style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ThemedText variant="h3">Storage Vault</ThemedText>
                    <IconButton
                      icon="externalLink"
                      accessibilityLabel="Open storage screen"
                      size={sizes.iconSm}
                      onPress={() => navigation.navigate('StorageScreen', { folderId: folderId ?? null })}
                    />
                  </View>

                  <ProgressBar value={usedRatio} tone={usedRatio > 0.85 ? 'danger' : 'primary'} />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <ThemedText variant="small" color="textMuted">
                      {formatBytes(usedBytes)} used
                    </ThemedText>
                    <ThemedText variant="smallBold">
                      {formatBytes(quotaBytes)} total
                    </ThemedText>
                  </View>

                  <Divider />

                  <View style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <AppIcon name="shield" size={sizes.iconSm} color="success" />
                      <ThemedText variant="small">End-to-end encrypted</ThemedText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <AppIcon name="lock" size={sizes.iconSm} color="primary" />
                      <ThemedText variant="small">Client-side Web Crypto</ThemedText>
                    </View>
                  </View>

                  <Button
                    label="Storage details"
                    variant="outline"
                    fullWidth
                    size="sm"
                    onPress={() => navigation.navigate('StorageScreen', { folderId: folderId ?? null })}
                  />
                </View>
              </Card>

              {/* Recovery Key Setup info */}
              <Card padding="md" elevation="sm">
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <AppIcon name="key" size={sizes.iconMd} color="primary" />
                    <ThemedText variant="bodyBold">Recovery Key</ThemedText>
                  </View>
                  <ThemedText variant="small" color="textMuted">
                    Your Master Access Key encrypts all documents. Make sure you have your 16-character key saved.
                  </ThemedText>
                  <Button
                    label="Unlock / Enter Key"
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      navigation.navigate('FRKEntryScreen', {
                        encryptedMAK: fileConfig?.encryptedMAK ?? '',
                      })
                    }
                  />
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
        title={renameTarget?.kind === 'folder' ? 'Rename Folder' : 'Rename File'}
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
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightActions: {
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
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  crumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  crumbBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
    height: 38,
  },
  centerLoading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  folderGridCard: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 200,
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
