import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ColorValue, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import {
  MaterialSymbol,
  SFSymbol,
  useNavigation,
  useTheme,
  type MaterialSymbolProps,
  type SFSymbolProps,
} from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { usePatientId } from 'hooks/usePatientId';
import { formatBytes, getFileConfig, getTypeExtensions, importFiles, listAllFolders, refreshFileTypes } from '../../../services/files';
import type { PickedFileInput } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

const BRAND = '#7C3AED';

type TMeta = { color: string; android: MaterialSymbolProps['name']; ios: SFSymbolProps['name'] };
const TYPE_META: Record<string, TMeta> = {
  'file-type-xray': { color: '#3B82F6', android: 'health_and_safety', ios: 'waveform.path.ecg' },
  'file-type-lab-result': { color: '#10B981', android: 'science', ios: 'flask.fill' },
  'file-type-medical-certificate': { color: '#F59E0B', android: 'verified', ios: 'checkmark.seal.fill' },
  'file-type-prescription': { color: '#EF4444', android: 'medication', ios: 'cross.case.fill' },
  'file-type-id': { color: '#8B5CF6', android: 'badge', ios: 'person.crop.rectangle.fill' },
};
const DEFAULT_TYPE: TMeta = { color: '#6B7280', android: 'description', ios: 'doc.fill' };
function typeMeta(id: string): TMeta { return TYPE_META[id] ?? DEFAULT_TYPE; }

function Icon({ android, ios, color, size = 20 }: { android: MaterialSymbolProps['name']; ios: SFSymbolProps['name']; color: ColorValue; size?: number }) {
  return Platform.select({
    android: <MaterialSymbol name={android} size={size} color={color} />,
    ios: <SFSymbol name={ios} size={size - 3} color={color} />,
  });
}

export default function FilesUploadScreen({ route }: FilesScreenProps<'FilesUploadScreen'>) {
  const { colors } = useTheme();
  const navigation = useNavigation('FilesUploadScreen');
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { runWithAutoLockPaused } = useAppAuth();
  const folderId = route.params?.folderId;
  const [pickedFiles, setPickedFiles] = useState<PickedFileInput[]>([]);
  const [fileTypes, setFileTypes] = useState<Awaited<ReturnType<typeof refreshFileTypes>>>([]);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof getFileConfig>> | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('All files');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    const [types, value, folders] = await Promise.all([
      refreshFileTypes(patientId, getToken),
      getFileConfig(patientId, getToken),
      listAllFolders(patientId),
    ]);
    setFileTypes(types);
    setConfig(value);
    setSelectedTypeId((current) => current ?? types[0]?.id ?? null);
    setFolderName(folders.find((f) => f.id === folderId)?.name ?? 'All files');
  }, [folderId, getToken, patientId]);

  useEffect(() => {
    load().catch((error) => Alert.alert('Files not ready', error instanceof Error ? error.message : 'Unable to prepare your files.'));
  }, [load]);

  const totalSize = useMemo(
    () => pickedFiles.reduce((sum, item) => sum + (item.sizeBytes ?? item.file.size ?? 0), 0),
    [pickedFiles],
  );

  const pickDocuments = async () => {
    const result = await runWithAutoLockPaused(() => File.pickFileAsync({ multipleFiles: true, mimeTypes: '*/*' }));
    if (result.canceled || !result.result) return;
    setPickedFiles(result.result.map((file) => ({ file, name: file.name, mimeType: file.type, sizeBytes: file.size })));
  };

  const pickImage = async (source: 'camera' | 'library') => {
    const permission = await runWithAutoLockPaused(() =>
      source === 'camera'
        ? ImagePicker.requestCameraPermissionsAsync()
        : ImagePicker.requestMediaLibraryPermissionsAsync(),
    );
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', source === 'camera' ? 'Camera access is needed.' : 'Photo access is needed.');
      return;
    }
    const result = await runWithAutoLockPaused(() =>
      source === 'camera'
        ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsMultipleSelection: true }),
    );
    if (result.canceled) return;
    setPickedFiles(
      result.assets.map((asset, index) => {
        const file = new File(asset.uri);
        return { file, name: asset.fileName ?? `Medical photo ${index + 1}.jpg`, mimeType: asset.mimeType ?? file.type, sizeBytes: asset.fileSize ?? file.size };
      }),
    );
  };

  const handleImport = async () => {
    setIsSaving(true);
    try {
      await importFiles({ patientId, folderId: folderId ?? null, fileTypeId: selectedTypeId, files: pickedFiles, getToken });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not add file', error instanceof Error ? error.message : 'Unable to save this file.');
    } finally {
      setIsSaving(false);
    }
  };

  const usedPct = config && config.quotaBytes > 0 ? Math.min(1, config.usedStorageBytes / config.quotaBytes) : 0;
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight() || 96 + insets.bottom;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight, }]}
    >
      {/* Destination banner */}
      <ThemedView style={[styles.destCard, { backgroundColor: colors.card }]}>
        <ThemedView style={[styles.destIcon, { backgroundColor: BRAND + '18' }]}>
          {Icon({ android: 'folder', ios: 'folder.fill', color: BRAND, size: 20 })}
        </ThemedView>
        <ThemedView style={{ flex: 1 }}>
          <ThemedText style={styles.destTitle}>Saving to</ThemedText>
          <ThemedText style={[styles.destFolder, { color: BRAND }]}>{folderName}</ThemedText>
        </ThemedView>
        {config ? (
          <ThemedView style={{ alignItems: 'flex-end' }}>
            <ThemedText style={[styles.quotaText, { color: colors.text }]}>
              {formatBytes(config.quotaBytes - config.usedStorageBytes)} free
            </ThemedText>
            <ThemedView style={styles.quotaBar}>
              <ThemedView style={[styles.quotaFill, { width: `${Math.round(usedPct * 100)}%`, backgroundColor: usedPct > 0.9 ? '#EF4444' : BRAND }]} />
            </ThemedView>
          </ThemedView>
        ) : null}
      </ThemedView>

      {/* Source picker */}
      <ThemedView style={styles.pickGrid}>
        {([
          { label: 'Browse', sub: 'From device', android: 'upload_file', ios: 'doc.badge.plus', color: BRAND, onPress: pickDocuments },
          { label: 'Photos', sub: 'From library', android: 'photo_library', ios: 'photo.on.rectangle', color: '#EC4899', onPress: () => pickImage('library') },
          { label: 'Camera', sub: 'Take a photo', android: 'photo_camera', ios: 'camera.fill', color: '#10B981', onPress: () => pickImage('camera') },
        ] as const).map((s) => (
          <Pressable
            key={s.label}
            onPress={s.onPress}
            style={({ pressed }) => [styles.pickCard, { backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 }]}
          >
            <ThemedView style={[styles.pickIconWrap, { backgroundColor: s.color + '18' }]}>
              {Icon({ android: s.android, ios: s.ios, color: s.color, size: 26 })}
            </ThemedView>
            <ThemedText style={styles.pickTitle}>{s.label}</ThemedText>
            <ThemedText style={[styles.pickSub, { color: colors.text }]}>{s.sub}</ThemedText>
          </Pressable>
        ))}
      </ThemedView>

      {/* Type selector */}
      <ThemedView style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Document type</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeList}>
          {fileTypes.map((type) => {
            const selected = type.id === selectedTypeId;
            const meta = typeMeta(type.id);
            return (
              <Pressable
                key={type.id}
                onPress={() => setSelectedTypeId(type.id)}
                style={[
                  styles.typeChip,
                  selected
                    ? { backgroundColor: meta.color, borderColor: meta.color }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <ThemedView style={[styles.typeChipIcon, { backgroundColor: selected ? 'rgba(255,255,255,0.2)' : meta.color + '18' }]}>
                  {Icon({ android: meta.android, ios: meta.ios, color: selected ? '#fff' : meta.color, size: 16 })}
                </ThemedView>
                <ThemedText style={[styles.typeLabel, { color: selected ? '#fff' : colors.text }]}>{type.label}</ThemedText>
                <ThemedText style={[styles.typeMeta, { color: selected ? 'rgba(255,255,255,0.78)' : colors.text }]}>
                  {getTypeExtensions(type).slice(0, 3).join(', ') || 'All types'}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </ThemedView>

      {/* Selected files */}
      <ThemedView style={styles.section}>
        <ThemedText style={styles.sectionTitle}>
          {pickedFiles.length > 0 ? `${pickedFiles.length} file${pickedFiles.length === 1 ? '' : 's'} selected` : 'Selected files'}
        </ThemedText>
        {pickedFiles.length > 0 ? (
          <ThemedView style={styles.selectedList}>
            {pickedFiles.map((item, index) => {
              const meta = typeMeta(selectedTypeId ?? '');
              return (
                <ThemedView key={item.file.uri + index} style={[styles.selectedRow, { backgroundColor: colors.card }]}>
                  <ThemedView style={[styles.selectedIcon, { backgroundColor: meta.color + '18' }]}>
                    {Icon({ android: meta.android, ios: meta.ios, color: meta.color, size: 18 })}
                  </ThemedView>
                  <ThemedView style={styles.selectedBody}>
                    <ThemedText style={styles.selectedName} numberOfLines={1}>{item.name ?? item.file.name}</ThemedText>
                    <ThemedText style={[styles.selectedMeta, { color: colors.text }]}>{formatBytes(item.sizeBytes ?? item.file.size)}</ThemedText>
                  </ThemedView>
                </ThemedView>
              );
            })}
          </ThemedView>
        ) : (
          <ThemedView style={[styles.emptyFiles, { backgroundColor: colors.card }]}>
            {Icon({ android: 'upload_file', ios: 'doc.badge.plus', color: colors.text, size: 28 })}
            <ThemedText style={[styles.emptyFilesText, { color: colors.text }]}>
              No files selected yet. Use the picker above.
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      {/* Save button */}
      <Pressable
        onPress={handleImport}
        disabled={!pickedFiles.length || isSaving}
        style={({ pressed }) => [
          styles.saveButton,
          { backgroundColor: BRAND, opacity: !pickedFiles.length || isSaving ? 0.45 : pressed ? 0.8 : 1 },
        ]}
      >
        {isSaving ? <ActivityIndicator color="#fff" /> : null}
        <ThemedText style={styles.saveText}>
          Save to Files{pickedFiles.length ? `  ·  ${formatBytes(totalSize)}` : ''}
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18 },

  destCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  destIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  destTitle: { fontSize: 11, fontWeight: '700', opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.5 },
  destFolder: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  quotaText: { fontSize: 11, fontWeight: '700', opacity: 0.65 },
  quotaBar: { width: 64, height: 5, borderRadius: 999, backgroundColor: 'rgba(124,58,237,0.15)', overflow: 'hidden', marginTop: 4 },
  quotaFill: { height: '100%', borderRadius: 999 },

  pickGrid: { flexDirection: 'row', gap: 10 },
  pickCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  pickIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pickTitle: { fontSize: 13, fontWeight: '800' },
  pickSub: { fontSize: 10, opacity: 0.65, textAlign: 'center' },

  section: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.55, marginLeft: 2 },

  typeList: { gap: 10, paddingVertical: 2 },
  typeChip: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    minWidth: 100,
  },
  typeChipIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: 13, fontWeight: '800' },
  typeMeta: { fontSize: 10, opacity: 0.72 },

  selectedList: { gap: 8 },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  selectedIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  selectedBody: { flex: 1 },
  selectedName: { fontSize: 14, fontWeight: '700' },
  selectedMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },

  emptyFiles: {
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  emptyFilesText: { fontSize: 13, opacity: 0.55, textAlign: 'center', lineHeight: 18 },

  saveButton: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

