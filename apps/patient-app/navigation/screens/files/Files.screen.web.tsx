import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import * as Sharing from 'expo-sharing';
import ThemedText from '@ui/ThemedText';
import EmptyState from '@ui/EmptyState';
import { AppIcon } from '../../../components/ui/Icon';
import CustomAlertModal from '../../../components/ui/CustomAlertModal';
import RenameModal from '../../../components/ui/RenameModal';
import { usePatientId } from 'hooks/usePatientId';
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
} from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { useFilesBrowser, useFrkCheck } from '../../../hooks/useFilesBrowser';

const BRAND = '#7C3AED';

function getFileIcon(file: FileBrowserFile) {
  if (file.previewKind === 'image') return { icon: 'image', color: '#EC4899', label: 'Image' };
  if (file.previewKind === 'pdf') return { icon: 'picture_as_pdf', color: '#EF4444', label: 'PDF' };
  if (file.documentTypeId === 'file-type-lab-result') return { icon: 'science', color: '#10B981', label: 'Lab' };
  if (file.documentTypeId === 'file-type-prescription') return { icon: 'medication', color: '#F59E0B', label: 'Rx' };
  if (file.documentTypeId === 'file-type-xray') return { icon: 'health_and_safety', color: '#3B82F6', label: 'X-Ray' };
  return { icon: 'description', color: '#6366F1', label: 'Doc' };
}

export default function FilesScreenWeb({ route }: FilesScreenProps<'FilesBrowserScreen'>) {
  const { colors, dark: isDark } = useTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { runWithAutoLockPaused } = useAppAuth();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 1024;
  const isTablet = width >= 640 && width < 1024;

  const folderId = route.params?.folderId;
  const [query, setQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [alertModal, setAlertModal] = useState<{ title: string; message: string; icon?: string } | null>(null);
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

  const folderName = folderId
    ? contents?.breadcrumbs?.length
      ? contents.breadcrumbs[contents.breadcrumbs.length - 1].name
      : 'Folder'
    : 'Root Vault';

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
      setAlertModal({
        title: 'Rename Error',
        message: e instanceof Error ? e.message : 'Unable to rename item.',
        icon: '⚠️',
      });
    }
  };

  const handleDelete = async (kind: FileItemKind, id: string) => {
    try {
      await deleteItem(patientId, kind, id);
      const newContents = await listFolderContents(patientId, folderId ?? null, query, getToken);
      await mutate(newContents, { revalidate: false });
      syncPendingFiles(patientId, getToken).then(() => mutate()).catch(console.error);
    } catch (error) {
      setAlertModal({
        title: 'Delete Failed',
        message: error instanceof Error ? error.message : 'Unable to delete item.',
        icon: '🗑️',
      });
    }
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingFiles(patientId, getToken);
      if (result.skipped) {
        setAlertModal({
          title: 'Backup Waiting',
          message: result.reason ?? 'Files will back up when internet is connected.',
          icon: '⏳',
        });
      } else if (result.failed > 0) {
        setAlertModal({
          title: 'Backup Needs Attention',
          message: `${result.synced} backed up, ${result.failed} failed.`,
          icon: '⚠️',
        });
      }
      refresh();
    } catch (error) {
      setAlertModal({
        title: 'Backup Failed',
        message: error instanceof Error ? error.message : 'Unable to back up.',
        icon: '❌',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [getToken, patientId, refresh]);

  const handleShareFile = useCallback(
    async (fileId: string) => {
      try {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          setAlertModal({
            title: 'Sharing Not Available',
            message: 'Your browser or device does not support native direct sharing.',
            icon: '🚫',
          });
          return;
        }
        const preview = await preparePreviewFile(patientId, fileId, getToken);
        await runWithAutoLockPaused(() =>
          Sharing.shareAsync(preview.uri, {
            mimeType: preview.mimeType,
            dialogTitle: preview.name,
          })
        );
      } catch (error) {
        setAlertModal({
          title: 'Could Not Share',
          message: error instanceof Error ? error.message : 'Unable to share file.',
          icon: '⚠️',
        });
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
      navigation.push('FilesBrowserScreen', { folderId: id });
    },
    [navigation]
  );

  const folders = contents?.folders ?? [];
  const files = contents?.files ?? [];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: isDesktop ? 32 : 96 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.badgeRow}>
              <View style={styles.badgePill}>
                <ThemedText style={styles.badgePillText}>ENCRYPTED HEALTH VAULT</ThemedText>
              </View>
              {contents?.pendingSyncCount ? (
                <View style={styles.pendingSyncPill}>
                  <ThemedText style={styles.pendingSyncText}>
                    ● {contents.pendingSyncCount} pending sync
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText style={[styles.pageTitle, { color: colors.text }]}>
              Medical Files & Documents
            </ThemedText>
            <ThemedText style={[styles.pageSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Securely store, organize, and preview laboratory results, prescriptions, diagnostic scans, and clinical PDFs.
            </ThemedText>
          </View>

          {/* Action Toolbar */}
          <View style={styles.toolbarActions}>
            <Pressable
              onPress={openUpload}
              style={({ pressed }) => [styles.uploadBtn, pressed && { opacity: 0.85 }]}
            >
              <ThemedText style={styles.uploadBtnText}>☁️ Upload File</ThemedText>
            </Pressable>

            <Pressable
              onPress={createFolder}
              style={({ pressed }) => [
                styles.toolBtn,
                { borderColor: isDark ? '#334155' : '#CBD5E1' },
                pressed && { opacity: 0.75 },
              ]}
            >
              <ThemedText style={[styles.toolBtnText, { color: colors.text }]}>
                📁 New Folder
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={handleSync}
              disabled={isSyncing}
              style={({ pressed }) => [
                styles.toolBtn,
                { borderColor: isDark ? '#334155' : '#CBD5E1' },
                pressed && { opacity: 0.75 },
              ]}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <ThemedText style={styles.toolBtnTextPrimary}>🔄 Sync</ThemedText>
              )}
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('StorageScreen', { folderId: folderId ?? null })}
              style={({ pressed }) => [
                styles.toolBtn,
                { borderColor: isDark ? '#334155' : '#CBD5E1' },
                pressed && { opacity: 0.75 },
              ]}
            >
              <ThemedText style={[styles.toolBtnText, { color: colors.text }]}>
                💾 Storage
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Interactive Breadcrumbs Bar */}
        <View
          style={[
            styles.breadcrumbsBar,
            {
              backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
              borderColor: isDark ? '#334155' : '#E2E8F0',
            },
          ]}
        >
          <View style={styles.breadcrumbsList}>
            <Pressable onPress={openRoot} style={styles.crumbItem}>
              <ThemedText style={[styles.crumbText, !folderId && styles.crumbTextActive]}>
                📁 My Files
              </ThemedText>
            </Pressable>

            {contents?.breadcrumbs?.map((crumb, idx) => {
              const isLast = idx === contents.breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  <ThemedText style={styles.crumbSeparator}>/</ThemedText>
                  <Pressable
                    onPress={() => (isLast ? undefined : openFolder(crumb.id))}
                    disabled={isLast}
                    style={styles.crumbItem}
                  >
                    <ThemedText style={[styles.crumbText, isLast && styles.crumbTextActive]}>
                      {crumb.name}
                    </ThemedText>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>

          {/* Quick Search */}
          <View
            style={[
              styles.searchField,
              {
                backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                borderColor: isDark ? '#334155' : '#CBD5E1',
              },
            ]}
          >
            <ThemedText style={{ fontSize: 14 }}>🔍</ThemedText>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search files and folders..."
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              style={[styles.searchInput, { color: colors.text }]}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <ThemedText style={{ color: '#94A3B8', fontWeight: '700' }}>✕</ThemedText>
              </Pressable>
            )}
          </View>
        </View>

        {/* Loading State */}
        {isLoading && !contents ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <ThemedText style={styles.loadingSubtitle}>Opening medical vault...</ThemedText>
          </View>
        ) : folders.length === 0 && files.length === 0 ? (
          <EmptyState
            title={query ? 'No matching documents' : 'No documents in this folder'}
            message={
              query
                ? 'Try searching with a different term or keyword.'
                : 'Upload medical PDFs, laboratory results, or create subfolders to keep your records organized.'
            }
            actionLabel={query ? undefined : 'Upload File Now'}
            onActionPress={query ? undefined : openUpload}
          />
        ) : (
          <View style={styles.mainContent}>
            {/* Folders Section */}
            {folders.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeadingRow}>
                  <ThemedText style={[styles.sectionHeading, { color: colors.text }]}>
                    Folders ({folders.length})
                  </ThemedText>
                </View>

                <View
                  style={[
                    styles.grid,
                    isDesktop
                      ? styles.grid4Col
                      : isTablet
                        ? styles.grid3Col
                        : styles.grid1Col,
                  ]}
                >
                  {folders.map((folder) => (
                    <Pressable
                      key={folder.id}
                      onPress={() => openFolder(folder.id)}
                      style={({ pressed }) => [
                        styles.folderCard,
                        {
                          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                          borderColor: isDark ? '#334155' : '#E2E8F0',
                        },
                        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                      ]}
                    >
                      <View style={styles.folderCardTop}>
                        <View style={styles.folderIconBadge}>
                          <ThemedText style={{ fontSize: 24 }}>📁</ThemedText>
                        </View>
                        <View style={styles.folderActions}>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              setRenameTarget({
                                kind: 'folder',
                                id: folder.id,
                                initialName: folder.name,
                              });
                            }}
                            style={styles.cardActionIcon}
                          >
                            <ThemedText style={{ fontSize: 13 }}>✏️</ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              handleDelete('folder', folder.id);
                            }}
                            style={styles.cardActionIcon}
                          >
                            <ThemedText style={{ fontSize: 13 }}>🗑️</ThemedText>
                          </Pressable>
                        </View>
                      </View>

                      <ThemedText
                        style={[styles.folderName, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {folder.name}
                      </ThemedText>
                      <ThemedText style={[styles.folderChildCount, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        {folder.childCount} {folder.childCount === 1 ? 'item' : 'items'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Files Section */}
            {files.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeadingRow}>
                  <ThemedText style={[styles.sectionHeading, { color: colors.text }]}>
                    Files & Records ({files.length})
                  </ThemedText>
                </View>

                <View
                  style={[
                    styles.grid,
                    isDesktop
                      ? styles.grid3Col
                      : isTablet
                        ? styles.grid2Col
                        : styles.grid1Col,
                  ]}
                >
                  {files.map((file) => {
                    const meta = getFileIcon(file);
                    return (
                      <View
                        key={file.id}
                        style={[
                          styles.fileCard,
                          {
                            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                            borderColor: isDark ? '#334155' : '#E2E8F0',
                          },
                        ]}
                      >
                        <View style={styles.fileCardHeader}>
                          <View
                            style={[
                              styles.fileIconBadge,
                              { backgroundColor: `${meta.color}15` },
                            ]}
                          >
                            <AppIcon name={meta.icon as any} size={22} color={meta.color} />
                          </View>
                          <View style={styles.fileCardHeaderRight}>
                            <View
                              style={[
                                styles.fileTypeTag,
                                { backgroundColor: `${meta.color}18` },
                              ]}
                            >
                              <ThemedText
                                style={[styles.fileTypeTagText, { color: meta.color }]}
                              >
                                {meta.label}
                              </ThemedText>
                            </View>
                            <ThemedText style={[styles.fileSizeText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              {formatBytes(file.sizeBytes ?? 0)}
                            </ThemedText>
                          </View>
                        </View>

                        <Pressable
                          onPress={() =>
                            navigation.navigate('FileViewerScreen', { fileId: file.id })
                          }
                          style={styles.fileContentArea}
                        >
                          <ThemedText
                            style={[styles.fileName, { color: colors.text }]}
                            numberOfLines={2}
                          >
                            {file.name}
                          </ThemedText>
                        </Pressable>

                        {/* File Action Footer */}
                        <View
                          style={[
                            styles.fileCardFooter,
                            { borderTopColor: isDark ? '#334155' : '#F1F5F9' },
                          ]}
                        >
                          <Pressable
                            onPress={() =>
                              navigation.navigate('FileViewerScreen', { fileId: file.id })
                            }
                            style={styles.actionBtnPrimary}
                          >
                            <ThemedText style={styles.actionBtnPrimaryText}>Preview</ThemedText>
                          </Pressable>

                          <View style={styles.secondaryActions}>
                            <Pressable
                              onPress={() =>
                                navigation.navigate('FileMoveScreen', {
                                  itemKind: 'file',
                                  itemId: file.id,
                                  currentFolderId: file.folderId,
                                })
                              }
                              style={styles.iconActionBtn}
                              accessibilityLabel="Move file"
                            >
                              <ThemedText style={{ fontSize: 14 }}>↗️</ThemedText>
                            </Pressable>

                            <Pressable
                              onPress={() =>
                                setRenameTarget({
                                  kind: 'file',
                                  id: file.id,
                                  initialName: file.name,
                                })
                              }
                              style={styles.iconActionBtn}
                              accessibilityLabel="Rename file"
                            >
                              <ThemedText style={{ fontSize: 14 }}>✏️</ThemedText>
                            </Pressable>

                            <Pressable
                              onPress={() => handleDelete('file', file.id)}
                              style={styles.iconActionBtn}
                              accessibilityLabel="Delete file"
                            >
                              <ThemedText style={{ fontSize: 14 }}>🗑️</ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
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

      <CustomAlertModal
        visible={alertModal !== null}
        onClose={() => setAlertModal(null)}
        title={alertModal?.title ?? ''}
        message={alertModal?.message ?? ''}
        icon={alertModal?.icon}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  container: {
    maxWidth: 1280,
    width: '100%',
    marginHorizontal: 'auto',
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
  },
  headerLeft: {
    gap: 6,
    maxWidth: 680,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgePill: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgePillText: {
    color: '#3B82F6',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  pendingSyncPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingSyncText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '700',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  uploadBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  toolBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  toolBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  toolBtnTextPrimary: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  breadcrumbsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexWrap: 'wrap',
    gap: 12,
  },
  breadcrumbsList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  crumbItem: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  crumbText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  crumbTextActive: {
    fontWeight: '700',
    color: '#3B82F6',
  },
  crumbSeparator: {
    color: '#94A3B8',
    fontSize: 13,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 260,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  centerLoading: {
    paddingVertical: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  mainContent: {
    gap: 28,
  },
  sectionBlock: {
    gap: 14,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  grid4Col: {
    // 4 cards per row
  },
  grid3Col: {
    // 3 cards per row
  },
  grid2Col: {
    // 2 cards per row
  },
  grid1Col: {
    flexDirection: 'column',
  },
  folderCard: {
    flexBasis: '23.5%',
    flexGrow: 1,
    minWidth: 220,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  folderCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  folderIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderActions: {
    flexDirection: 'row',
    gap: 6,
  },
  cardActionIcon: {
    padding: 4,
    borderRadius: 4,
  },
  folderName: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  folderChildCount: {
    fontSize: 12,
  },
  fileCard: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 280,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  fileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCardHeaderRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  fileTypeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  fileTypeTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  fileSizeText: {
    fontSize: 11,
  },
  fileContentArea: {
    minHeight: 44,
    justifyContent: 'center',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  fileCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  actionBtnPrimary: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnPrimaryText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 12,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  iconActionBtn: {
    padding: 4,
    borderRadius: 4,
  },
});
