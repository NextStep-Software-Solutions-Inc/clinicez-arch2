import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import useSWR from 'swr';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Input from '@ui/Input';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import { AppIcon, type IconName } from '@ui/Icon';
import { ProgressBar } from '@ui/Primitives';
import Screen from '../../../components/layout/Screen';
import { usePatientId } from 'hooks/usePatientId';
import {
  formatBytes,
  getFileConfig,
  getTypeExtensions,
  importFiles,
  listAllFolders,
  refreshDocumentTypes,
} from '../../../services/files';
import type { PickedFileInput, WebPickedFile } from '../../../services/files';
import type { FilesScreenProps } from './navigationTypes';
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
function typeMeta(id: string): TMeta {
  return TYPE_META[id] ?? DEFAULT_TYPE;
}

export default function FilesUploadScreenWeb({ route }: FilesScreenProps<'FilesUploadScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const initialFolderId = route.params?.folderId ?? null;

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolderId);
  const [pickedFiles, setPickedFiles] = useState<PickedFileInput[]>([]);
  const [documentTypes, setDocumentTypes] = useState<Awaited<ReturnType<typeof refreshDocumentTypes>>>([]);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof getFileConfig>> | null>(null);
  const [folders, setFolders] = useState<Awaited<ReturnType<typeof listAllFolders>>>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const { data: uploadConfig, error: uploadError } = useSWR(
    ['files-upload-config', patientId],
    async () => {
      const [types, value, folderList] = await Promise.all([
        refreshDocumentTypes(patientId, getToken),
        getFileConfig(patientId, getToken),
        listAllFolders(patientId),
      ]);
      return { types, config: value, folders: folderList };
    },
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (uploadConfig) {
      setDocumentTypes(uploadConfig.types);
      setConfig(uploadConfig.config);
      setFolders(uploadConfig.folders);
      setSelectedTypeId((current) => current ?? uploadConfig.types[0]?.id ?? null);
    }
  }, [uploadConfig]);

  useEffect(() => {
    if (uploadError) {
      dialog.alert('Files not ready', uploadError instanceof Error ? uploadError.message : 'Unable to prepare your files.');
    }
  }, [uploadError]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('file-sync-progress', ({ fileId, progress }) => {
      setProgressMap((prev) => ({ ...prev, [fileId]: progress }));
    });
    return () => sub.remove();
  }, []);

  const totalSize = useMemo(
    () => pickedFiles.reduce((sum, item) => sum + (item.sizeBytes ?? (item.file as WebPickedFile).size ?? 0), 0),
    [pickedFiles]
  );

  const addBrowserFiles = (fileList: FileList | File[]) => {
    const newItems: PickedFileInput[] = Array.from(fileList).map((file) => ({
      file,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    }));
    setPickedFiles((current) => [...current, ...newItems]);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      addBrowserFiles(event.target.files);
      event.target.value = '';
    }
  };

  const triggerBrowse = () => {
    fileInputRef.current?.click();
  };

  const triggerCamera = () => {
    cameraInputRef.current?.click();
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

  const handleImport = async () => {
    if (!pickedFiles.length) return;

    if (typeof window !== 'undefined' && window.isSecureContext === false && window.location.hostname !== 'localhost') {
      dialog.alert('HTTPS Required', 'Client-side encryption requires a secure HTTPS connection.');
      return;
    }

    setIsSaving(true);
    try {
      const finalFiles = pickedFiles.map((f) => ({
        ...f,
        name: f.name?.trim() || (f.file as WebPickedFile).name,
      }));

      await importFiles({
        patientId,
        folderId: selectedFolderId,
        documentTypeId: selectedTypeId,
        files: finalFiles,
        getToken,
      });

      navigation.goBack();
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('recovery key') || msg.toLowerCase().includes('mak')) {
        dialog.alert('Recovery Key Needed', 'Enter your File Recovery Key before uploading files.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enter Key',
            onPress: () =>
              navigation.navigate('FRKEntryScreen', {
                encryptedMAK: config?.encryptedMAK ?? '',
              }),
          },
        ]);
      } else {
        dialog.alert('Upload Failed', msg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const selectedFolderName = useMemo(() => {
    if (!selectedFolderId) return 'All files (root)';
    const match = folders.find((f) => f.id === selectedFolderId);
    return match ? match.name : 'Selected folder';
  }, [folders, selectedFolderId]);

  const usedPct = config && config.quotaBytes > 0 ? Math.min(1, config.usedStorageBytes / config.quotaBytes) : 0;

  return (
    <Screen width="form" scroll={true}>
      {/* Hidden input elements */}
      {React.createElement('input', {
        type: 'file',
        multiple: true,
        style: { display: 'none' },
        ref: fileInputRef,
        onChange: handleFileInputChange,
      })}
      {React.createElement('input', {
        type: 'file',
        accept: 'image/*',
        capture: 'environment',
        style: { display: 'none' },
        ref: cameraInputRef,
        onChange: handleFileInputChange,
      })}

      <View style={{ gap: spacing.xl }}>
        {/* Destination folder & Quota banner */}
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
                SAVING TO FOLDER
              </ThemedText>
              <ThemedText variant="bodyBold" color="primary" style={{ marginTop: spacing.xxs }}>
                {selectedFolderName}
              </ThemedText>
            </View>
            {config ? (
              <View style={{ alignItems: 'flex-end', width: 120 }}>
                <ThemedText variant="captionBold" color="textMuted">
                  {formatBytes(config.quotaBytes - config.usedStorageBytes)} free
                </ThemedText>
                <View style={{ width: '100%', marginTop: spacing.xs }}>
                  <ProgressBar value={usedPct} tone={usedPct > 0.9 ? 'danger' : 'primary'} />
                </View>
              </View>
            ) : null}
          </View>

          {/* Folder switch selector if folders exist */}
          {folders.length > 0 && (
            <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: sizes.borderWidth, borderColor: colors.border }}>
              <ThemedText variant="captionBold" color="textMuted" style={{ marginBottom: spacing.xs }}>
                Select folder:
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
                <Pressable
                  onPress={() => setSelectedFolderId(null)}
                  accessibilityRole="button"
                  style={[
                    styles.folderPill,
                    {
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                      borderWidth: sizes.borderWidth,
                      borderColor: selectedFolderId === null ? colors.primary : colors.border,
                      backgroundColor: selectedFolderId === null ? colors.primary : colors.surfaceSubtle,
                    },
                  ]}
                >
                  <ThemedText variant="smallBold" color={selectedFolderId === null ? colors.onPrimary : 'text'}>
                    All files
                  </ThemedText>
                </Pressable>
                {folders.map((f) => {
                  const isSel = f.id === selectedFolderId;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => setSelectedFolderId(f.id)}
                      accessibilityRole="button"
                      style={[
                        styles.folderPill,
                        {
                          borderRadius: radii.full,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.xs,
                          borderWidth: sizes.borderWidth,
                          borderColor: isSel ? colors.primary : colors.border,
                          backgroundColor: isSel ? colors.primary : colors.surfaceSubtle,
                        },
                      ]}
                    >
                      <ThemedText variant="smallBold" color={isSel ? colors.onPrimary : 'text'}>
                        {f.name}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </Card>

        {/* Drag & Drop Zone */}
        <View
          {...({
            onDragOver: (e: any) => {
              e.preventDefault();
              setIsDragging(true);
            },
            onDragLeave: () => {
              setIsDragging(false);
            },
            onDrop: (e: any) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer?.files?.length) {
                addBrowserFiles(e.dataTransfer.files);
              }
            },
          } as any)}
          style={[
            styles.dropZone,
            {
              backgroundColor: isDragging ? colors.surfaceHighlight : colors.card,
              borderColor: isDragging ? colors.primary : colors.border,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderRadius: radii.xl,
              padding: spacing.xl,
              gap: spacing.md,
            },
            shadows.sm,
          ]}
        >
          <View
            style={[
              styles.dropIconWrap,
              {
                width: sizes.avatarLg,
                height: sizes.avatarLg,
                borderRadius: radii.full,
                backgroundColor: isDragging ? colors.primaryLight : colors.surfaceSubtle,
              },
            ]}
          >
            <AppIcon name="upload" size={sizes.iconXl} color={isDragging ? 'primary' : 'textMuted'} />
          </View>

          <View style={{ alignItems: 'center', gap: spacing.xs }}>
            <ThemedText variant="h3" style={{ textAlign: 'center' }}>
              Drag & drop medical documents here
            </ThemedText>
            <ThemedText variant="small" color="textMuted" style={{ textAlign: 'center' }}>
              Supports PDFs, high-res images, diagnostic scans, and clinical reports
            </ThemedText>
          </View>

          <View style={[styles.dropButtonsRow, { gap: spacing.md }]}>
            <Button
              label="Browse files"
              variant="primary"
              icon="upload"
              onPress={triggerBrowse}
            />
            <Button
              label="Take photo"
              variant="outline"
              icon="camera"
              onPress={triggerCamera}
            />
          </View>
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

        {/* Selected files to upload */}
        <View style={{ gap: spacing.sm }}>
          <ThemedText variant="smallBold" color="textSecondary">
            {pickedFiles.length > 0 ? `${pickedFiles.length} FILE${pickedFiles.length === 1 ? '' : 'S'} TO UPLOAD` : 'SELECTED FILES'}
          </ThemedText>
          {pickedFiles.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {pickedFiles.map((item, index) => {
                const meta = typeMeta(selectedTypeId ?? '');
                const progress = Object.values(progressMap)[index] ?? 0;
                return (
                  <Card key={`${(item.file as WebPickedFile).name}-${index}`} padding="md">
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
                          value={item.name ?? (item.file as WebPickedFile).name}
                          onChangeText={(text) => updateFileName(index, text)}
                          placeholder="File name"
                          containerStyle={{ marginBottom: spacing.xs }}
                        />
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <ThemedText variant="caption" color="textMuted">
                            {formatBytes(item.sizeBytes ?? (item.file as WebPickedFile).size)}
                          </ThemedText>
                          {isSaving && progress > 0 ? (
                            <ThemedText variant="captionBold" color="primary">
                              {Math.round(progress * 100)}%
                            </ThemedText>
                          ) : null}
                        </View>
                        {isSaving && progress > 0 ? (
                          <View style={{ marginTop: spacing.xs }}>
                            <ProgressBar value={progress} />
                          </View>
                        ) : null}
                      </View>
                      {!isSaving && (
                        <Pressable
                          onPress={() => removeFile(index)}
                          accessibilityRole="button"
                          accessibilityLabel="Remove file"
                          style={{ padding: spacing.xs }}
                        >
                          <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
                        </Pressable>
                      )}
                    </View>
                  </Card>
                );
              })}
            </View>
          ) : (
            <Card padding="lg">
              <View style={[styles.emptyFiles, { gap: spacing.sm }]}>
                <AppIcon name="document" size={sizes.iconXl} color="textMuted" />
                <ThemedText variant="small" color="textMuted" style={{ textAlign: 'center' }}>
                  No files selected. Drop files above or click "Browse files".
                </ThemedText>
              </View>
            </Card>
          )}
        </View>

        {/* Upload Action Button */}
        <Button
          label={
            isSaving
              ? 'Encrypting & uploading...'
              : `Upload to Vault${pickedFiles.length ? ` · ${formatBytes(totalSize)}` : ''}`
          }
          variant="primary"
          loading={isSaving}
          disabled={!pickedFiles.length || isSaving}
          fullWidth
          onPress={handleImport}
          icon="upload"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  destCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  destIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropZone: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
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
