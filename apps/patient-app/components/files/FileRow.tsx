import React, { useMemo, useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ColorValue, Platform, TouchableOpacity, DeviceEventEmitter } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme, Theme } from '@react-navigation/native';
import { AppIcon } from '@ui/Icon';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { CircularProgress } from '../ui/CircularProgress';
import { FileBrowserFile, FileBrowserFolder, formatBytes } from '../../services/files';

type BrowserItem = FileBrowserFolder | FileBrowserFile;
type ActionType = 'share' | 'move' | 'delete' | 'rename';

const getActionColors = (isDark: boolean): Record<ActionType, { bg: string; fg: string }> => ({
  share: {
    bg: isDark ? '#E2A85F' : '#FED7AA',
    fg: isDark ? '#763F19' : '#9A3412'
  },
  move: {
    bg: isDark ? '#94A3D7' : '#DBEAFE',
    fg: isDark ? '#2C3E75' : '#1E3A8A'
  },
  delete: {
    bg: isDark ? '#CD7F71' : '#FEE2E2',
    fg: isDark ? '#69251F' : '#991B1B'
  },
  rename: {
    bg: isDark ? '#4B5563' : '#E5E7EB',
    fg: isDark ? '#D1D5DB' : '#374151'
  },
});

type TMeta = { color: string; android: string; ios: string };

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
  return TYPE_META[item.documentTypeId ?? ''] ?? DEFAULT_META;
}

export function Icon({
  android, ios, color, size = 20,
}: {
  android?: string;
  ios?: string;
  color: ColorValue;
  size?: number;
}) {
  return <AppIcon android={android} ios={ios} size={size} color={color} />;
}

function StatusDot({ status }: { status: string }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

export function FileRow({
  item, onPress, onMove, onDelete, onShare, onRename, onErrorPress
}: {
  item: BrowserItem;
  onPress: () => void;
  onMove: () => void;
  onDelete: () => void;
  onShare: () => void;
  onRename?: () => void;
  onErrorPress?: () => void;
}) {
  const theme = useTheme();
  const { colors, dark } = theme;
  const isFolder = item.kind === 'folder';
  
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (isFolder || (item as FileBrowserFile).syncStatus !== 'syncing') return;

    const sub = DeviceEventEmitter.addListener('file-sync-progress', (e) => {
      if (e.fileId === item.id) {
        setUploadProgress(e.progress);
      }
    });
    return () => sub.remove();
  }, [isFolder, item.id, (item as FileBrowserFile).syncStatus]);

  const meta = isFolder ? FOLDER_META : fileMeta(item as FileBrowserFile);
  const styles = useMemo(() => createStyles(theme), [theme]);
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

  const swipeableRef = React.useRef<any>(null);

  const renderRightActions = () => (
    <ThemedView style={styles.swipeWrap}>
      {!isFolder && (
        <Pressable onPress={() => { swipeableRef.current?.close(); onShare(); }} style={[styles.swipeBtn, { backgroundColor: getActionColors(dark).share.bg }]}>
          {Icon({ android: 'share', ios: 'square.and.arrow.up', color: getActionColors(dark).share.fg, size: 18 })}
          <ThemedText style={[styles.swipeBtnLabel, { color: getActionColors(dark).share.fg }]}>Share</ThemedText>
        </Pressable>
      )}
      <Pressable onPress={() => { swipeableRef.current?.close(); onMove(); }} style={[styles.swipeBtn, { backgroundColor: getActionColors(dark).move.bg }]}>
        {Icon({ android: 'drive_file_move', ios: 'folder', color: getActionColors(dark).move.fg, size: 18 })}
        <ThemedText style={[styles.swipeBtnLabel, { color: getActionColors(dark).move.fg }]}>Move</ThemedText>
      </Pressable>
      {onRename && (
        <Pressable onPress={() => { swipeableRef.current?.close(); onRename(); }} style={[styles.swipeBtn, { backgroundColor: getActionColors(dark).rename.bg }]}>
          {Icon({ android: 'edit', ios: 'pencil', color: getActionColors(dark).rename.fg, size: 18 })}
          <ThemedText style={[styles.swipeBtnLabel, { color: getActionColors(dark).rename.fg }]}>Rename</ThemedText>
        </Pressable>
      )}
      <Pressable onPress={() => { swipeableRef.current?.close(); onDelete(); }} style={[styles.swipeBtn, { backgroundColor: getActionColors(dark).delete.bg }]}>
        {Icon({ android: 'delete', ios: 'trash', color: getActionColors(dark).delete.fg, size: 18 })}
        <ThemedText style={[styles.swipeBtnLabel, { color: getActionColors(dark).delete.fg }]}>Delete</ThemedText>
      </Pressable>
    </ThemedView>
  );

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
         
        ]}
      >
        <View style={[styles.rowIcon, { backgroundColor: meta.color + '1A' }]}>
          {Icon({ android: meta.android, ios: meta.ios, color: meta.color, size: 22 })}
        </View>
        <View style={styles.rowBody}>
          <ThemedText style={styles.rowName} numberOfLines={1}>{item.name}</ThemedText>
          <ThemedText style={[styles.rowSub, { color: colors.text }]} numberOfLines={1}>{subtitle}</ThemedText>
          {!isFolder && (item as FileBrowserFile).syncStatus === 'failed' && (item as FileBrowserFile).syncError && (
            <ThemedText style={[styles.rowSub, { color: getActionColors(dark).delete.fg, marginTop: 4 }]} numberOfLines={2}>
              {(item as FileBrowserFile).syncError}
            </ThemedText>
          )}
        </View>
        {!isFolder
          ? (item as FileBrowserFile).syncStatus === 'failed' ? (
              <Pressable onPress={onErrorPress} style={{ padding: 4, margin: -4 }} hitSlop={10}>
                <StatusDot status={(item as FileBrowserFile).syncStatus} />
              </Pressable>
            ) : (item as FileBrowserFile).syncStatus === 'syncing' ? (
              <CircularProgress progress={uploadProgress} size={28} color="#3B82F6" trackColor={dark ? "#1E3A8A" : "#EFF6FF"} />
            ) : <StatusDot status={(item as FileBrowserFile).syncStatus} />
          : <View style={{ opacity: 0.3 }}>{Icon({ android: 'chevron_right', ios: 'chevron.right', color: colors.text, size: 16 })}</View>
        }
      </Pressable>
    </Swipeable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      backgroundColor: theme.colors.card,
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
    swipeBtnLabel: { fontSize: 11, fontWeight: '700' },
  });
