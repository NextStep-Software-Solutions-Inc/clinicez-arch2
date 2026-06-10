import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ColorValue,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import {
  MaterialSymbol,
  SFSymbol,
  useFocusEffect,
  useNavigation,
  useTheme,
  type MaterialSymbolProps,
  type SFSymbolProps,
} from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import EmptyState from '@ui/EmptyState';
import ThemedText from '@ui/ThemedText';
import { usePatientId } from 'hooks/usePatientId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  FileBrowserFile,
  FileBrowserFolder,
  FileItemKind,
  deleteItem,
  formatBytes,
  listFolderContents,
  refreshFileTypes,
  syncPendingFiles,
} from '../../services/files';
import type { FilesScreenProps } from './files/navigationTypes';

// ─── types ────────────────────────────────────────────────────────────────────
type BrowserItem = FileBrowserFolder | FileBrowserFile;
type BrowserContents = Awaited<ReturnType<typeof listFolderContents>>;
type LoadMode = 'initial' | 'refresh' | 'search';
type SectionHeader = { kind: 'section'; title: string; id: string };
type ListEntry = BrowserItem | SectionHeader;

// ─── design tokens ─────────────────────────────────────────────────────────────
const BRAND = '#7C3AED';

// ─── per-type icon / colour map ───────────────────────────────────────────────
type TMeta = { color: string; android: MaterialSymbolProps['name']; ios: SFSymbolProps['name'] };

const TYPE_META: Record<string, TMeta> = {
  'file-type-xray': { color: '#3B82F6', android: 'health_and_safety', ios: 'waveform.path.ecg' },
  'file-type-lab-result': { color: '#10B981', android: 'science', ios: 'flask.fill' },
  'file-type-medical-certificate': { color: '#F59E0B', android: 'verified', ios: 'checkmark.seal.fill' },
  'file-type-prescription': { color: '#EF4444', android: 'medication', ios: 'cross.case.fill' },
  'file-type-id': { color: '#8B5CF6', android: 'badge', ios: 'person.crop.rectangle.fill' },
};
const FOLDER_META: TMeta = { color: '#F59E0B', android: 'folder', ios: 'folder.fill' };
const DEFAULT_META: TMeta = { color: '#6B7280', android: 'description', ios: 'doc.fill' };

function fileMeta(item: FileBrowserFile): TMeta {
  if (item.previewKind === 'image') return { color: '#EC4899', android: 'image', ios: 'photo.fill' };
  if (item.previewKind === 'pdf') return { color: '#EF4444', android: 'picture_as_pdf', ios: 'doc.richtext.fill' };
  return TYPE_META[item.fileTypeId ?? ''] ?? DEFAULT_META;
}

// ─── Icon helper ──────────────────────────────────────────────────────────────
function Icon({
  android, ios, color, size = 20,
}: {
  android: MaterialSymbolProps['name'];
  ios: SFSymbolProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return Platform.select({
    android: <MaterialSymbol name={android} size={size} color={color} />,
    ios: <SFSymbol name={ios} size={size - 3} color={color} />,
  });
}

// ─── StatusDot ────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const c =
    status === 'synced' ? '#10B981' :
      status === 'failed' ? '#EF4444' :
        status === 'syncing' ? '#3B82F6' : '#F59E0B';
  const l =
    status === 'synced' ? 'Backed up' :
      status === 'failed' ? 'Error' :
        status === 'syncing' ? 'Syncing' : 'On device';
  return (
    <View style={[styles.dot, { backgroundColor: c + '1A' }]}>
      <View style={[styles.dotInner, { backgroundColor: c }]} />
      <ThemedText style={[styles.dotLabel, { color: c }]}>{l}</ThemedText>
    </View>
  );
}

// ─── FileRow ──────────────────────────────────────────────────────────────────
function FileRow({
  item, onPress, onMove, onDelete,
}: {
  item: BrowserItem;
  onPress: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { colors, dark } = useTheme();
  const isFolder = item.kind === 'folder';
  const meta = isFolder ? FOLDER_META : fileMeta(item as FileBrowserFile);

  const dateStr =
    !isFolder && (item as FileBrowserFile).createdAt
      ? new Date((item as FileBrowserFile).createdAt!).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      })
      : '';

  const subtitle = isFolder
    ? `${(item as FileBrowserFolder).childCount} item${(item as FileBrowserFolder).childCount === 1 ? '' : 's'}`
    : [
      (item as FileBrowserFile).typeLabel,
      formatBytes((item as FileBrowserFile).sizeBytes),
      dateStr,
    ].filter(Boolean).join('  ·  ');

  const renderRightActions = () => (
    <View style={styles.swipeWrap}>
      <Pressable onPress={onMove} style={[styles.swipeBtn, { backgroundColor: BRAND }]}>
        {Icon({ android: 'drive_file_move', ios: 'folder.badge.plus', color: '#fff', size: 18 })}
        <ThemedText style={styles.swipeBtnLabel}>Move</ThemedText>
      </Pressable>
      <Pressable onPress={onDelete} style={[styles.swipeBtn, { backgroundColor: '#EF4444' }]}>
        {Icon({ android: 'delete', ios: 'trash', color: '#fff', size: 18 })}
        <ThemedText style={styles.swipeBtnLabel}>Delete</ThemedText>
      </Pressable>
    </View>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: dark ? '#1C1633' : '#fff', opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <View style={[styles.rowIcon, { backgroundColor: meta.color + '1A' }]}>
          {Icon({ android: meta.android, ios: meta.ios, color: meta.color, size: 22 })}
        </View>
        <View style={styles.rowBody}>
          <ThemedText style={styles.rowName} numberOfLines={1}>{item.name}</ThemedText>
          <ThemedText style={[styles.rowSub, { color: colors.text }]} numberOfLines={1}>{subtitle}</ThemedText>
        </View>
        {!isFolder
          ? <StatusDot status={(item as FileBrowserFile).syncStatus} />
          : <View style={{ opacity: 0.3 }}>{Icon({ android: 'chevron_right', ios: 'chevron.right', color: colors.text, size: 16 })}</View>
        }
      </Pressable>
    </Swipeable>
  );
}

// ─── FilesHeader ──────────────────────────────────────────────────────────────
function FilesHeader({
  contents, folderId, query, isSearching, isSyncing,
  onChangeQuery, onCreateFolder, onOpenFolder, onOpenRoot, onOpenUpload, onSync,
}: {
  contents: BrowserContents | null;
  folderId?: string;
  query: string;
  isSearching: boolean;
  isSyncing: boolean;
  onChangeQuery: (v: string) => void;
  onCreateFolder: () => void;
  onOpenFolder: (id: string) => void;
  onOpenRoot: () => void;
  onOpenUpload: () => void;
  onSync: () => void;
}) {
  const { colors, dark } = useTheme();
  const hasCrumbs = (contents?.breadcrumbs?.length ?? 0) > 0 || !!folderId;

  return (
    <View style={styles.header}>
      {(contents?.pendingSyncCount ?? 0) > 0 && (
        <Pressable
          onPress={onSync}
          disabled={isSyncing}
          style={({ pressed }) => [styles.syncBanner, { opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={styles.syncIconWrap}>
            {isSyncing
              ? <ActivityIndicator size="small" color="#B45309" />
              : Icon({ android: 'cloud_upload', ios: 'icloud.and.arrow.up', color: '#B45309', size: 17 })}
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.syncTitle, { color: dark ? '#FDE68A' : '#78350F' }]}>
              {contents!.pendingSyncCount} item{contents!.pendingSyncCount === 1 ? '' : 's'} waiting to back up
            </ThemedText>
            <ThemedText style={[styles.syncSub, { color: dark ? '#FCD34D' : '#92400E' }]}>Tap to sync now</ThemedText>
          </View>
          {Icon({ android: 'chevron_right', ios: 'chevron.right', color: '#B45309', size: 15 })}
        </Pressable>
      )}

      <View style={[styles.searchPill, { backgroundColor: dark ? '#1C1633' : '#fff', borderColor: colors.border }]}>
        {Icon({ android: 'search', ios: 'magnifyingglass', color: colors.text, size: 17 })}
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search files and folders…"
          placeholderTextColor={dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}
          style={[styles.searchInput, { color: colors.text }]}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {isSearching ? <ActivityIndicator size="small" color={BRAND} /> : null}
      </View>

      {hasCrumbs && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.crumbRow}
        >
          <Pressable
            onPress={onOpenRoot}
            style={[
              styles.crumb,
              !folderId
                ? { backgroundColor: BRAND }
                : { backgroundColor: dark ? '#1C1633' : '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
            ]}
          >
            {Icon({ android: 'home', ios: 'house.fill', color: !folderId ? '#fff' : BRAND, size: 13 })}
            <ThemedText style={[styles.crumbText, { color: !folderId ? '#fff' : colors.text }]}>All files</ThemedText>
          </Pressable>
          {(contents?.breadcrumbs ?? []).map((folder) => (
            <Pressable
              key={folder.id}
              onPress={() => onOpenFolder(folder.id)}
              style={[
                styles.crumb,
                folder.id === folderId
                  ? { backgroundColor: BRAND }
                  : { backgroundColor: dark ? '#1C1633' : '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
              ]}
            >
              <ThemedText style={[styles.crumbText, { color: folder.id === folderId ? '#fff' : colors.text }]}>
                {folder.name}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── FilesScreen ──────────────────────────────────────────────────────────────
export default function FilesScreen({ route }: FilesScreenProps<'FilesBrowserScreen'>) {
  const { colors, dark } = useTheme();
  const navigation = useNavigation('FilesBrowserScreen');
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight ? useBottomTabBarHeight() : 0;
  const fabBottom = 20 + insets.bottom + tabBarHeight;
  const folderId = route.params?.folderId;
  const [fabOpen, setFabOpen] = useState(false);
  const getTokenRef = useRef(getToken);
  const queryRef = useRef('');
  const loadedSearchRef = useRef('');
  const loadRequestIdRef = useRef(0);
  const [query, setQuery] = useState('');
  const [contents, setContents] = useState<BrowserContents | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  useEffect(() => { queryRef.current = query; }, [query]);

  const folderName = folderId
    ? (contents?.breadcrumbs?.length ? contents.breadcrumbs[contents.breadcrumbs.length - 1].name : 'Folder')
    : 'My Files';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: folderName,
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('StorageScreen', { folderId: folderId ?? null })}
          style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.7 : 1 }]}
        >
          {Icon({ android: 'cloud_sync', ios: 'icloud.and.arrow.up.fill', color: BRAND, size: 22 })}
        </Pressable>
      ),
    });
  }, [navigation, folderName, folderId]);

  const load = useCallback(
    async (mode: LoadMode = 'initial', searchQuery = queryRef.current) => {
      const requestId = loadRequestIdRef.current + 1;
      const nq = searchQuery.trim();
      loadRequestIdRef.current = requestId;

      if (mode === 'refresh') setIsRefreshing(true);
      else if (mode === 'search') setIsSearching(true);
      else setIsLoading(true);

      try {
        const token = getTokenRef.current;
        await refreshFileTypes(patientId, token);
        const value = await listFolderContents(patientId, folderId ?? null, nq, token);
        if (requestId !== loadRequestIdRef.current) return;
        loadedSearchRef.current = nq;
        setContents(value);
      } catch (error) {
        if (requestId === loadRequestIdRef.current) {
          Alert.alert('Files not available', error instanceof Error ? error.message : 'Unable to load your files.');
        }
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsSearching(false);
        }
      }
    },
    [folderId, patientId],
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const t = setTimeout(() => {
      const next = query.trim();
      if (next === loadedSearchRef.current) return;
      load('search', next);
    }, 350);
    return () => clearTimeout(t);
  }, [load, query]);

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
      await load('refresh', queryRef.current);
    } catch (error) {
      Alert.alert('Could not delete', error instanceof Error ? error.message : 'Unable to delete this item.');
    }
  };

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingFiles(patientId, getToken);
      if (result.skipped) {
        Alert.alert('Backup waiting', result.reason ?? 'Files will back up when connected.');
      } else if (result.failed > 0) {
        Alert.alert('Backup needs attention', `${result.synced} backed up, ${result.failed} failed.`);
      }
      await load('refresh', queryRef.current);
    } catch (error) {
      Alert.alert('Backup failed', error instanceof Error ? error.message : 'Unable to back up.');
    } finally {
      setIsSyncing(false);
    }
  }, [getToken, load, patientId]);

  const openUpload = useCallback(() => { navigation.navigate('FilesUploadScreen', { folderId: folderId ?? null }); }, [folderId, navigation]);
  const createFolder = useCallback(() => { navigation.navigate('FileFolderFormScreen', { parentId: folderId ?? null }); }, [folderId, navigation]);
  const openRoot = useCallback(() => { navigation.navigate('FilesBrowserScreen'); }, [navigation]);
  const openFolder = useCallback((id: string) => { navigation.navigate('FilesBrowserScreen', { folderId: id }); }, [navigation]);

  const pageBg = dark ? '#0F0A1E' : '#F5F3FF';

  if (isLoading && !contents) {
    return (
      <View style={[styles.center, { backgroundColor: pageBg }]}>
        <ActivityIndicator size="large" color={BRAND} />
        <ThemedText style={styles.loadingText}>Loading your files…</ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <FlatList<ListEntry>
        data={items}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => load('refresh')}
            tintColor={BRAND}
            colors={[BRAND]}
          />
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: 110 + tabBarHeight }]}
        ItemSeparatorComponent={({ leadingItem }) =>
          (leadingItem as ListEntry).kind === 'section' ? null : <View style={{ height: 8 }} />
        }
        ListHeaderComponent={
          <FilesHeader
            contents={contents}
            folderId={folderId}
            query={query}
            isSearching={isSearching}
            isSyncing={isSyncing}
            onChangeQuery={setQuery}
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
          if ((item as ListEntry).kind === 'section') {
            return <ThemedText style={styles.sectionHead}>{(item as SectionHeader).title}</ThemedText>;
          }
          const bItem = item as BrowserItem;
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
            />
          );
        }}
      />
      <ThemedText></ThemedText>

      {/* ── FAB ─────────────────────────────────────────────────────────────── */}
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
        <Pressable
          onPress={() => setFabOpen((s) => !s)}
          style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.9 : 1 }]}
        >
          {Icon({ android: fabOpen ? 'close' : 'add', ios: fabOpen ? 'xmark' : 'plus', color: '#fff', size: 28 })}
        </Pressable>

      </View>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 110 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, opacity: 0.6 },

  header: { gap: 12, marginBottom: 16 },

  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 16,
    padding: 14,
  },
  syncIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncTitle: { fontSize: 13, fontWeight: '700' },
  syncSub: { fontSize: 11, marginTop: 2, opacity: 0.85 },

  searchPill: {
    height: 48,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },

  crumbRow: { gap: 8, paddingVertical: 2 },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  crumbText: { fontSize: 13, fontWeight: '700' },

  sectionHead: {
    fontSize: 12,
    fontWeight: '800',
    opacity: 0.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
    marginLeft: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  rowIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, opacity: 0.6, marginTop: 2 },

  dot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dotInner: { width: 6, height: 6, borderRadius: 3 },
  dotLabel: { fontSize: 11, fontWeight: '700' },

  swipeWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
    marginLeft: 6,
  },
  swipeBtn: { width: 72, alignItems: 'center', justifyContent: 'center', gap: 3 },
  swipeBtnLabel: { color: '#fff', fontSize: 11, fontWeight: '700' },

  fabWrap: { position: 'absolute', right: 20, bottom: 36, alignItems: 'flex-end', zIndex: 9999, elevation: 20 },
  fabMenu: { marginBottom: 94, gap: 10, alignItems: 'flex-end' },
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
    bottom: 80
  },
});






