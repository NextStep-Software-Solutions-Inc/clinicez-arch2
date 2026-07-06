import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  Alert,
} from 'react-native';
import { Theme, useNavigation, useTheme } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import * as Sharing from 'expo-sharing';
import EmptyState from '@ui/EmptyState';
import ThemedText from '@ui/ThemedText';
import CustomAlertModal from '../../../components/ui/CustomAlertModal';
import { usePatientId } from 'hooks/usePatientId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  FileBrowserFile,
  FileBrowserFolder,
  FileItemKind,
  deleteItem,
  syncPendingFiles,
  preparePreviewFile,
} from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import ThemedView from '@ui/ThemedView';

import { useFilesBrowser, useFrkCheck } from '../../../hooks/useFilesBrowser';
import { FileRow, Icon } from '../../../components/files/FileRow';
import { FilesHeader } from '../../../components/files/FilesHeader';

type BrowserItem = FileBrowserFolder | FileBrowserFile;
type SectionHeader = { kind: 'section'; title: string; id: string };
type ListEntry = BrowserItem | SectionHeader;

const BRAND = '#7C3AED';

export default function FilesScreen({ route }: FilesScreenProps<'FilesBrowserScreen'>) {
  const theme = useTheme();
  const navigation = useNavigation('FilesBrowserScreen');
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight?.() || 96;
  const fabBottom = 20 + insets.bottom + tabBarHeight;
  const { runWithAutoLockPaused } = useAppAuth();
  const folderId = route.params?.folderId;
  
  const [fabOpen, setFabOpen] = useState(false);
  const [alertModal, setAlertModal] = useState<{ title: string; message: string; icon?: string } | null>(null);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { colors, dark } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ─── Custom Hooks (100% SoC) ──────────────────────────────────────────────────
  useFrkCheck(patientId);
  const { contents, isLoading, isRefreshing, refresh } = useFilesBrowser(patientId, folderId ?? null, query);

  const folderName = folderId
    ? (contents?.breadcrumbs?.length ? contents.breadcrumbs[contents.breadcrumbs.length - 1].name : 'Folder')
    : 'My Files';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLargeTitleEnabled: !isSearching,
      headerTitle: isSearching ? () => (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', width: '100%', paddingRight: 8 }}>
            <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search files and folders…"
                placeholderTextColor={colors.border}
                autoFocus
                style={{
                    flex: 1,
                    color: colors.text,
                    fontSize: 16,
                    paddingVertical: Platform.select({ ios: 6, android: 4 }),
                    paddingHorizontal: 12,
                    backgroundColor: colors.card,
                    borderRadius: 10,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                    height: 36,
                }}
            />
        </View>
      ) : folderName,
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
            <Pressable
                onPress={() => {
                    if (isSearching) {
                        setQuery('');
                        setIsSearching(false);
                    } else {
                        setIsSearching(true);
                    }
                }}
                style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.7 : 1 }]}
            >
                {isSearching ? (
                    Icon({ android: 'close', ios: 'xmark', color: colors.text, size: 22 })
                ) : (
                    Icon({ android: 'search', ios: 'magnifyingglass', color: colors.text, size: 22 })
                )}
            </Pressable>
            {!isSearching && (
              <Pressable
                onPress={() => navigation.navigate('StorageScreen', { folderId: folderId ?? null })}
                style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.7 : 1 }]}
              >
                {Icon({ android: 'cloud', ios: 'icloud.and.arrow.up.fill', color: colors.primary, size: 22 })}
              </Pressable>
            )}
        </View>
      ),
    });
  }, [navigation, folderName, folderId, colors, isSearching, query]);

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
    try {
      await deleteItem(patientId, kind, id);
      refresh();
    } catch (error) {
      setAlertModal({ title: 'Could not delete', message: error instanceof Error ? error.message : 'Unable to delete this item.', icon: '🗑️' });
    }
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingFiles(patientId, getToken);
      if (result.skipped) {
        setAlertModal({ title: 'Backup waiting', message: result.reason ?? 'Files will back up when connected.', icon: '⏳' });
      } else if (result.failed > 0) {
        setAlertModal({ title: 'Backup needs attention', message: `${result.synced} backed up, ${result.failed} failed.`, icon: '⚠️' });
      }
      refresh();
    } catch (error) {
      setAlertModal({ title: 'Backup failed', message: error instanceof Error ? error.message : 'Unable to back up.', icon: '❌' });
    } finally {
      setIsSyncing(false);
    }
  }, [getToken, patientId, refresh]);

  const shareFile = useCallback(async (fileId: string) => {
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setAlertModal({ title: 'No app available', message: 'This device cannot share files with other apps.', icon: '🚫' });
        return;
      }
      const preview = await preparePreviewFile(patientId, fileId);
      await runWithAutoLockPaused(() => Sharing.shareAsync(preview.uri, { mimeType: preview.mimeType, dialogTitle: preview.name }));
    } catch (error) {
      setAlertModal({ title: 'Could not share file', message: error instanceof Error ? error.message : 'Unable to share this file.', icon: '⚠️' });
    }
  }, [patientId, runWithAutoLockPaused]);

  const openUpload = useCallback(() => { navigation.navigate('FilesUploadScreen', { folderId: folderId ?? null }); }, [folderId, navigation]);
  const createFolder = useCallback(() => { navigation.navigate('FileFolderFormScreen', { parentId: folderId ?? null }); }, [folderId, navigation]);
  const openRoot = useCallback(() => { navigation.navigate('FilesBrowserScreen'); }, [navigation]);
  const openFolder = useCallback((id: string) => { navigation.navigate('FilesBrowserScreen', { folderId: id }); }, [navigation]);

  if (isLoading && !contents) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={BRAND} />
        <ThemedText style={styles.loadingText}>Loading your files…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
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
        contentContainerStyle={[styles.listContent, { paddingBottom: 110 + tabBarHeight }]}
        ItemSeparatorComponent={({ leadingItem }) =>
          (leadingItem as ListEntry).kind === 'section' ? null : <View style={{ height: 8 }} />
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
            message={query ? 'Try a different search term.' : 'Add health documents or create folders to stay organized.'}
            actionLabel={query ? undefined : 'Add a file'}
            onActionPress={query ? undefined : openUpload}
          />
        }
        renderItem={({ item }) => {
          if ((item).kind === 'section') {
            return <ThemedText style={styles.sectionHead}>{item.title}</ThemedText>;
          }
          const bItem = item;
          return (
            <FileRow
              item={bItem}
              onPress={() => {
                if (bItem.kind === 'folder') {
                  navigation.push('FilesBrowserScreen', { folderId: bItem.id });
                } else if (
                  (bItem as FileBrowserFile).previewKind === 'image' ||
                  (bItem as FileBrowserFile).previewKind === 'pdf'
                ) {
                  navigation.navigate('FileViewerScreen', { fileId: bItem.id });
                } else {
                  navigation.navigate('ExternalOpenConsentScreen', { fileId: bItem.id });
                }
              }}
              onErrorPress={() => {
                setAlertModal({
                  title: 'Upload Failed',
                  message: (bItem as FileBrowserFile).syncError ?? 'This file failed to upload to the cloud.',
                  icon: '❌',
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

      <View style={[styles.fabWrap, { bottom: fabBottom }]} pointerEvents="box-none">
        {fabOpen && (
          <View style={styles.fabMenu}>
            <Pressable
              onPress={() => { setFabOpen(false); createFolder(); }}
              style={({ pressed }) => [
                styles.fabItem,
                { backgroundColor: dark ? '#1C1633' : '#fff', opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {Icon({ android: 'create_new_folder', ios: 'folder.badge.plus', color: BRAND, size: 20 })}
              <ThemedText style={[styles.fabItemLabel, { color: colors.text }]}>New folder</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => { setFabOpen(false); openUpload(); }}
              style={({ pressed }) => [styles.fabItem, { backgroundColor: BRAND, opacity: pressed ? 0.85 : 1 }]}
            >
              {Icon({ android: 'upload_file', ios: 'square.and.arrow.up', color: '#fff', size: 20 })}
              <ThemedText style={styles.fabItemLabelWhite}>Upload file</ThemedText>
            </Pressable>
          </View>
        )}
        <Pressable onPress={() => setFabOpen((s) => !s)} style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.9 : 1 }]}>
          {Icon({ android: fabOpen ? 'close' : 'add', ios: fabOpen ? 'xmark' : 'plus', color: '#fff', size: 28 })}
        </Pressable>
      </View>

      <CustomAlertModal
        visible={alertModal !== null}
        onClose={() => setAlertModal(null)}
        title={alertModal?.title ?? ''}
        message={alertModal?.message ?? ''}
        icon={alertModal?.icon ?? '☁️'}
      />
    </ThemedView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    listContent: { padding: 16, paddingBottom: 110 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { fontSize: 14, opacity: 0.6 },
    sectionHead: {
      fontSize: 12,
      fontWeight: '800',
      opacity: 0.5,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginLeft: 4,
    },
    fabWrap: { position: 'absolute', right: 20, bottom: 36, alignItems: 'flex-end', zIndex: 9999, elevation: 20 },
    fabMenu: { marginBottom: 10, gap: 10, alignItems: 'flex-end' },
    fabItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 18,
      paddingVertical: 13,
      borderRadius: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
    },
    fabItemLabel: { fontSize: 14, fontWeight: '700' },
    fabItemLabelWhite: { color: '#fff', fontSize: 14, fontWeight: '700' },
    fab: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: BRAND,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: BRAND,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
      elevation: 8,
    },
  });