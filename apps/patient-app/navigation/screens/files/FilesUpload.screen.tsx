import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import useSWR from 'swr';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Input from '@ui/Input';
import Card from '@ui/Card';
import { AppIcon, type IconName } from '@ui/Icon';
import { ProgressBar } from '@ui/Primitives';
import { usePatientId } from 'hooks/usePatientId';
import { formatBytes, getFileConfig, getTypeExtensions, importFiles, listAllFolders, refreshDocumentTypes } from '../../../services/files';
import type { PickedFileInput } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
import { useContentInsets } from '../../../hooks/useContentInsets';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../../../contexts/ThemeContext';
import type { ColorToken } from '../../../constants/theme';

type TMeta = { colorToken: ColorToken; icon: IconName };
const TYPE_META: Record<string, TMeta> = {
  'file-type-xray': { colorToken: 'info', icon: 'activity' },
  'file-type-lab-result': { colorToken: 'success', icon: 'lab' },
  'file-type-medical-certificate': { colorToken: 'warning', icon: 'document' },
  'file-type-prescription': { colorToken: 'emergency', icon: 'pill' },
  'file-type-id': { colorToken: 'purple', icon: 'badge' },
};
const DEFAULT_TYPE: TMeta = { colorToken: 'textSecondary', icon: 'document' };
function typeMeta(id: string): TMeta { return TYPE_META[id] ?? DEFAULT_TYPE; }

export default function FilesUploadScreen({ route }: FilesScreenProps<'FilesUploadScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation('FilesUploadScreen');
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { runWithAutoLockPaused } = useAppAuth();
  const folderId = route.params?.folderId;
  const insets = useContentInsets();

  const [pickedFiles, setPickedFiles] = useState<PickedFileInput[]>([]);
  const [documentTypes, setDocumentTypes] = useState<Awaited<ReturnType<typeof refreshDocumentTypes>>>([]);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof getFileConfig>> | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('All files');
  const [isSaving, setIsSaving] = useState(false);

  const { data: uploadConfig, error: uploadError } = useSWR(
    ['files-upload-config', patientId],
    async () => {
      const [types, value, folders] = await Promise.all([
        refreshDocumentTypes(patientId, getToken),
        getFileConfig(patientId, getToken),
        listAllFolders(patientId),
      ]);
      return { types, config: value, folders };
    },
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (uploadConfig) {
      setDocumentTypes(uploadConfig.types);
      setConfig(uploadConfig.config);
      setSelectedTypeId((current) => current ?? uploadConfig.types[0]?.id ?? null);
      setFolderName(uploadConfig.folders.find((f: any) => f.id === folderId)?.name ?? 'All files');
    }
  }, [uploadConfig, folderId]);

  useEffect(() => {
    if (uploadError) {
      dialog.alert('Files not ready', uploadError instanceof Error ? uploadError.message : 'Unable to prepare your files.');
    }
  }, [uploadError]);

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
      dialog.alert('Permission needed', source === 'camera' ? 'Camera access is needed.' : 'Photo access is needed.');
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
        const hasExtension = asset.fileName && asset.fileName.includes('.');
        const resolvedName = hasExtension ? asset.fileName : file.name;
        return {
          file,
          name: resolvedName ?? `Medical photo ${index + 1}.jpg`,
          mimeType: asset.mimeType ?? file.type ?? (asset.type === 'image' ? 'image/jpeg' : (asset.type === 'video' ? 'video/mp4' : undefined)),
          sizeBytes: asset.fileSize ?? file.size,
        };
      }),
    );
  };

  const handleImport = async () => {
    setIsSaving(true);
    try {
      const finalFiles = pickedFiles.map((f) => ({
        ...f,
        name: f.name?.trim() || f.file.name,
      }));
      await importFiles({ patientId, folderId: folderId ?? null, documentTypeId: selectedTypeId, files: finalFiles, getToken });
      navigation.goBack();
    } catch (error) {
      dialog.alert('Could not add file', error instanceof Error ? error.message : 'Unable to save this file.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateFileName = (index: number, newName: string) => {
    setPickedFiles((current) => {
      const next = [...current];
      next[index] = { ...next[index], name: newName };
      return next;
    });
  };

  const removeFile = (index: number) => {
    setPickedFiles((current) => current.filter((_, i) => i !== index));
  };

  const usedPct = config && config.quotaBytes > 0 ? Math.min(1, config.usedStorageBytes / config.quotaBytes) : 0;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }]}
    >
      {/* Destination banner */}
      <Card padding="md" elevation="sm">
        <View style={[styles.destCard, { gap: spacing.md }]}>
          <View
            style={[
              styles.destIcon,
              {
                width: sizes.controlLg,
                height: sizes.controlLg,
                borderRadius: radii.md,
                backgroundColor: colors.primaryLight,
              },
            ]}
          >
            <AppIcon name="folder" color="primary" size={sizes.iconMd} />
          </View>
          <View style={styles.flex}>
            <ThemedText variant="captionBold" color="textMuted">
              SAVING TO
            </ThemedText>
            <ThemedText variant="bodyBold" color="primary" style={{ marginTop: spacing.xxs }}>
              {folderName}
            </ThemedText>
          </View>
          {config ? (
            <View style={{ alignItems: 'flex-end', width: 100 }}>
              <ThemedText variant="captionBold" color="textMuted">
                {formatBytes(config.quotaBytes - config.usedStorageBytes)} free
              </ThemedText>
              <View style={{ width: '100%', marginTop: spacing.xs }}>
                <ProgressBar value={usedPct} tone={usedPct > 0.9 ? 'danger' : 'primary'} />
              </View>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Source picker */}
      <View style={[styles.pickGrid, { gap: spacing.md }]}>
        {([
          { label: 'Browse', sub: 'From device', icon: 'upload' as IconName, colorToken: 'primary' as ColorToken, onPress: pickDocuments },
          { label: 'Photos', sub: 'From library', icon: 'image' as IconName, colorToken: 'purple' as ColorToken, onPress: () => pickImage('library') },
          { label: 'Camera', sub: 'Take a photo', icon: 'camera' as IconName, colorToken: 'success' as ColorToken, onPress: () => pickImage('camera') },
        ] as const).map((s) => (
          <Pressable
            key={s.label}
            onPress={s.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${s.label}: ${s.sub}`}
            style={({ pressed }) => [
              styles.pickCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: sizes.borderWidth,
                borderRadius: radii.lg,
                padding: spacing.md,
                gap: spacing.sm,
                opacity: pressed ? 0.8 : 1,
              },
              shadows.sm,
            ]}
          >
            <View
              style={[
                styles.pickIconWrap,
                {
                  width: sizes.avatarMd,
                  height: sizes.avatarMd,
                  borderRadius: radii.md,
                  backgroundColor: colors.surfaceSubtle,
                },
              ]}
            >
              <AppIcon name={s.icon} color={s.colorToken} size={sizes.iconLg} />
            </View>
            <ThemedText variant="bodyBold">{s.label}</ThemedText>
            <ThemedText variant="caption" color="textMuted">
              {s.sub}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Document type selection */}
      <View style={{ gap: spacing.sm }}>
        <ThemedText variant="smallBold" color="textSecondary">
          DOCUMENT TYPE
        </ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.typeList, { gap: spacing.sm }]}>
          {documentTypes.map((type: any) => {
            const selected = type.id === selectedTypeId;
            const meta = typeMeta(type.id);
            return (
              <Pressable
                key={type.id}
                onPress={() => setSelectedTypeId(type.id)}
                accessibilityRole="button"
                accessibilityLabel={type.label}
                style={[
                  styles.typeChip,
                  {
                    borderRadius: radii.lg,
                    borderWidth: sizes.borderWidth,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.md,
                    gap: spacing.xs,
                  },
                  selected
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.typeChipIcon,
                    {
                      width: sizes.controlSm,
                      height: sizes.controlSm,
                      borderRadius: radii.sm,
                      backgroundColor: selected ? colors.primaryHover : colors.surfaceSubtle,
                    },
                  ]}
                >
                  <AppIcon name={meta.icon} color={selected ? colors.onPrimary : meta.colorToken} size={sizes.iconSm} />
                </View>
                <ThemedText variant="smallBold" color={selected ? colors.onPrimary : 'text'}>
                  {type.label}
                </ThemedText>
                <ThemedText variant="caption" color={selected ? colors.onPrimary : 'textMuted'} style={{ opacity: selected ? 0.8 : 1 }}>
                  {getTypeExtensions(type).slice(0, 3).join(', ') || 'All types'}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Selected files */}
      <View style={{ gap: spacing.sm }}>
        <ThemedText variant="smallBold" color="textSecondary">
          {pickedFiles.length > 0 ? `${pickedFiles.length} FILE${pickedFiles.length === 1 ? '' : 'S'} SELECTED` : 'SELECTED FILES'}
        </ThemedText>
        {pickedFiles.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {pickedFiles.map((item, index) => {
              const meta = typeMeta(selectedTypeId ?? '');
              return (
                <Card key={`${item.file.name}-${index}`} padding="md">
                  <View style={[styles.selectedRow, { gap: spacing.md }]}>
                    <View
                      style={[
                        styles.selectedIcon,
                        {
                          width: sizes.controlMd,
                          height: sizes.controlMd,
                          borderRadius: radii.md,
                          backgroundColor: colors.surfaceSubtle,
                        },
                      ]}
                    >
                      <AppIcon name={meta.icon} color={meta.colorToken} size={sizes.iconMd} />
                    </View>
                    <View style={styles.flex}>
                      <Input
                        value={item.name ?? item.file.name}
                        onChangeText={(text) => updateFileName(index, text)}
                        placeholder="Enter file name"
                        containerStyle={{ marginBottom: spacing.xs }}
                      />
                      <ThemedText variant="caption" color="textMuted">
                        {formatBytes(item.sizeBytes ?? item.file.size)}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() => removeFile(index)}
                      accessibilityRole="button"
                      accessibilityLabel="Remove file"
                      style={{ padding: spacing.xs }}
                    >
                      <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
                    </Pressable>
                  </View>
                </Card>
              );
            })}
          </View>
        ) : (
          <Card padding="lg">
            <View style={[styles.emptyFiles, { gap: spacing.sm }]}>
              <AppIcon name="upload" size={sizes.iconXl} color="textMuted" />
              <ThemedText variant="small" color="textMuted" style={{ textAlign: 'center' }}>
                No files selected yet. Choose files from the options above.
              </ThemedText>
            </View>
          </Card>
        )}
      </View>

      {/* Save button */}
      <Button
        label={`Save to Files${pickedFiles.length ? ` · ${formatBytes(totalSize)}` : ''}`}
        variant="primary"
        loading={isSaving}
        disabled={!pickedFiles.length || isSaving}
        fullWidth
        onPress={handleImport}
        icon="upload"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {},
  destCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  destIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickGrid: {
    flexDirection: 'row',
  },
  pickCard: {
    flex: 1,
    alignItems: 'center',
  },
  pickIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeList: {
    paddingVertical: 2,
  },
  typeChip: {
    alignItems: 'center',
    minWidth: 104,
  },
  typeChipIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFiles: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
