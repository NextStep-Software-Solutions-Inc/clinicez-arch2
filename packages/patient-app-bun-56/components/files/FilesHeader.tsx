import React, { useMemo } from 'react';
import { View, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme, Theme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { Icon } from './FileRow';
import { FileFolder } from '../../services/files';

export type BrowserContents = {
  breadcrumbs: FileFolder[];
  pendingSyncCount: number;
};

const BRAND = '#7C3AED';

export function FilesHeader({
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
  const theme = useTheme();
  const { colors, dark } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hasCrumbs = (contents?.breadcrumbs?.length ?? 0) > 0 || !!folderId;

  return (
    <ThemedView style={styles.header}>
      {(contents?.pendingSyncCount ?? 0) > 0 && (
        <Pressable
          onPress={onSync}
          disabled={isSyncing}
          style={({ pressed }) => [styles.syncBanner, { opacity: pressed ? 0.8 : 1 }]}
        >
          <ThemedView style={styles.syncIconWrap}>
            {isSyncing
              ? <ActivityIndicator size="small" color="#B45309" />
              : Icon({ android: 'cloud_upload', ios: 'icloud.and.arrow.up', color: '#B45309', size: 17 })}
          </ThemedView>
          <ThemedView style={{ flex: 1 }}>
            <ThemedText style={[styles.syncTitle, { color: dark ? '#FDE68A' : '#78350F' }]}>
              {contents!.pendingSyncCount} item{contents!.pendingSyncCount === 1 ? '' : 's'} waiting to back up
            </ThemedText>
            <ThemedText style={[styles.syncSub, { color: dark ? '#FCD34D' : '#92400E' }]}>Tap to sync now</ThemedText>
          </ThemedView>
          {Icon({ android: 'chevron_right', ios: 'chevron.right', color: '#B45309', size: 15 })}
        </Pressable>
      )}

      <ThemedView style={[styles.searchPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {Icon({ android: 'search', ios: 'magnifyingglass', color: colors.text, size: 17 })}
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search files and folders…"
          placeholderTextColor={colors.text}
          style={[styles.searchInput, { color: colors.text }]}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {isSearching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </ThemedView>

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
    </ThemedView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
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
  });
