import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Input from '@ui/Input';
import Card from '@ui/Card';
import { AppIcon } from '@ui/Icon';
import Screen from '../../../components/layout/Screen';
import ProfileDatePicker from '../../../components/profile/ProfileDatePicker';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentTypes } from '../../../hooks/useDocumentTypes';
import {
  formatBytes,
  validateUploadFile,
  UPLOAD_ALLOWED_MIME_TYPES,
} from '../../../services/documents/uploadRules';
import {
  getDocumentTypeVisualMeta,
  inferCategoryFromDocumentType,
  inferDocumentTypeFromFileName,
  resolveDocumentTypeId,
} from '../../../services/files/documentTypeMapping';
import { enqueueOfflineRecordUpload } from '../../../services/sync/uploadQueueService';
import { compressWebBlobForUpload } from '../../../services/files/fileCompression';
import type { FilesScreenProps } from './navigationTypes';
import { useAppTheme } from '../../../contexts/ThemeContext';

export function sanitizeTitleFromFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const withSpaces = baseName.replace(/[_\-.]+/g, ' ');
  return withSpaces.trim().replace(/\s+/g, ' ').slice(0, 200) || 'Medical Record';
}

export default function FilesUploadScreenWeb({ route }: FilesScreenProps<'FilesUploadScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { documentTypes } = useDocumentTypes(patientId);

  const [pickedFile, setPickedFile] = useState<{
    file: File | Blob;
    name: string;
    mimeType: string;
    size: number;
  } | null>(null);

  const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [facilityName, setFacilityName] = useState('');
  const [notes, setNotes] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Keep selectedDocumentTypeId synchronized with active backend DocumentTypes
  useEffect(() => {
    if (!documentTypes.length) return;
    const stillValid = documentTypes.some((dt) => dt.id === selectedDocumentTypeId);
    if (!stillValid) {
      const preferred =
        documentTypes.find((dt) => dt.code.toLowerCase() === 'lab-result') ?? documentTypes[0];
      setSelectedDocumentTypeId(preferred.id);
    }
  }, [documentTypes, selectedDocumentTypeId]);

  const handleSelectedFile = (file: File) => {
    setErrorBanner(null);
    const mimeType = file.type || 'application/octet-stream';
    const validationError = validateUploadFile({ mimeType, size: file.size });

    if (validationError) {
      setErrorBanner(validationError);
      return;
    }

    setPickedFile({
      file,
      name: file.name,
      mimeType,
      size: file.size,
    });

    if (!title) {
      setTitle(sanitizeTitleFromFileName(file.name));
    }
    const inferred = inferDocumentTypeFromFileName(file.name, documentTypes);
    if (inferred) {
      setSelectedDocumentTypeId(inferred.id);
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      handleSelectedFile(event.target.files[0]);
      event.target.value = '';
    }
  };

  const triggerBrowse = () => {
    fileInputRef.current?.click();
  };

  const triggerCamera = () => {
    cameraInputRef.current?.click();
  };

  const handleSave = async () => {
    if (!pickedFile) {
      setErrorBanner('Please select a file to upload.');
      return;
    }
    if (!title.trim()) {
      setErrorBanner('Please enter a record title.');
      return;
    }

    setIsSaving(true);
    setErrorBanner(null);

    try {
      const selectedDocType =
        documentTypes.find((dt) => dt.id === selectedDocumentTypeId) ?? documentTypes[0] ?? null;
      const resolvedDocTypeId = selectedDocType
        ? selectedDocType.id
        : resolveDocumentTypeId(selectedDocumentTypeId, undefined, documentTypes);
      const category = inferCategoryFromDocumentType(selectedDocType);

      const preparedUpload = await compressWebBlobForUpload({
        blob: pickedFile.file,
        fileName: pickedFile.name,
        mimeType: pickedFile.mimeType,
      });

      await enqueueOfflineRecordUpload(
        {
          patientId,
          documentTypeId: resolvedDocTypeId,
          category,
          title: title.trim(),
          fileName: preparedUpload.fileName,
          mimeType: preparedUpload.mimeType,
          sizeBytes: preparedUpload.sizeBytes,
          documentDate: documentDate || undefined,
          facilityName: facilityName.trim() || undefined,
          notes: notes.trim() || undefined,
          fileBlob: preparedUpload.blob,
        },
        getToken
      );

      navigation.goBack();
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      setErrorBanner(msg || 'Unable to save record.');
      setIsSaving(false);
    }
  };

  return (
    <Screen width="form" scroll={true}>
      {/* Hidden file inputs */}
      {React.createElement('input', {
        type: 'file',
        accept: UPLOAD_ALLOWED_MIME_TYPES.join(','),
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

      <View style={{ gap: spacing.lg }}>
        {/* Error banner */}
        {errorBanner ? (
          <Card
            padding="md"
            style={{
              backgroundColor: colors.emergencyBg,
              borderColor: colors.emergencyBorder,
              borderWidth: sizes.borderWidth,
            }}
          >
            <View style={[styles.errorRow, { gap: spacing.sm }]}>
              <AppIcon name="alert" color="emergencyText" size={sizes.iconMd} />
              <ThemedText variant="bodyBold" color="emergencyText" style={styles.flex}>
                {errorBanner}
              </ThemedText>
            </View>
          </Card>
        ) : null}

        {/* Attachment Card / Drag & Drop Zone */}
        {pickedFile ? (
          <Card padding="md">
            <View style={[styles.selectedRow, { gap: spacing.md }]}>
              <View
                style={[
                  styles.selectedIcon,
                  {
                    width: sizes.controlLg,
                    height: sizes.controlLg,
                    borderRadius: radii.md,
                    backgroundColor: colors.surfaceSubtle,
                  },
                ]}
              >
                <AppIcon
                  name={pickedFile.mimeType === 'application/pdf' ? 'pdf' : 'image'}
                  color={pickedFile.mimeType === 'application/pdf' ? 'emergency' : 'purple'}
                  size={sizes.iconLg}
                />
              </View>
              <View style={styles.flex}>
                <ThemedText variant="bodyBold" numberOfLines={1}>
                  {pickedFile.name}
                </ThemedText>
                <ThemedText variant="caption" color="textMuted">
                  {formatBytes(pickedFile.size)} · {pickedFile.mimeType}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => setPickedFile(null)}
                accessibilityRole="button"
                accessibilityLabel="Remove file"
                style={{ padding: spacing.xs }}
              >
                <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
              </Pressable>
            </View>
          </Card>
        ) : (
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
                  handleSelectedFile(e.dataTransfer.files[0]);
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
                Drag & drop health record here
              </ThemedText>
              <ThemedText variant="small" color="textMuted" style={{ textAlign: 'center' }}>
                Supports PDF, JPEG, PNG, WEBP, HEIC up to 25 MB
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
        )}

        {/* Document Type selection (synced from backend & cached in SQLite) */}
        <View style={{ gap: spacing.sm }}>
          <ThemedText variant="smallBold" color="textSecondary">
            RECORD CATEGORY *
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.typeScroll}
            contentContainerStyle={[styles.typeList, { gap: spacing.sm }]}
          >
            {documentTypes.map((docType) => {
              const selected = docType.id === selectedDocumentTypeId;
              const visual = getDocumentTypeVisualMeta(docType);
              return (
                <Pressable
                  key={docType.id}
                  onPress={() => setSelectedDocumentTypeId(docType.id)}
                  accessibilityRole="button"
                  accessibilityLabel={docType.label}
                  accessibilityState={{ selected }}
                  style={[
                    styles.typeChip,
                    {
                      borderRadius: radii.lg,
                      borderWidth: sizes.borderWidth,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      gap: spacing.xs,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primaryLight : colors.card,
                    },
                  ]}
                >
                  <AppIcon
                    name={visual.icon}
                    color={selected ? 'primary' : visual.colorToken}
                    size={sizes.iconSm}
                  />
                  <ThemedText variant="smallBold" numberOfLines={1} color={selected ? 'primary' : 'text'}>
                    {docType.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Title */}
        <View style={{ gap: spacing.xs }}>
          <ThemedText variant="smallBold" color="textSecondary">
            RECORD TITLE *
          </ThemedText>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Complete Blood Count (CBC)"
            maxLength={200}
            containerStyle={{ marginBottom: 0 }}
          />
        </View>

        {/* Date */}
        <ProfileDatePicker
          label="RECORD DATE"
          value={documentDate}
          onChange={setDocumentDate}
          mode="date"
        />

        {/* Facility Name */}
        <View style={{ gap: spacing.xs }}>
          <ThemedText variant="smallBold" color="textSecondary">
            CLINIC / FACILITY NAME (OPTIONAL)
          </ThemedText>
          <Input
            value={facilityName}
            onChangeText={setFacilityName}
            placeholder="e.g. St. Luke's Medical Center"
            maxLength={200}
            containerStyle={{ marginBottom: 0 }}
          />
        </View>

        {/* Clinical Notes */}
        <View style={{ gap: spacing.xs }}>
          <ThemedText variant="smallBold" color="textSecondary">
            CLINICAL NOTES (OPTIONAL)
          </ThemedText>
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="Add clinical observations, physician remarks, or dosage instructions..."
            multiline
            numberOfLines={3}
            maxLength={1000}
            containerStyle={{ minHeight: 80, marginBottom: 0 }}
          />
        </View>

        {/* Save button */}
        <Button
          label={isSaving ? 'Saving record...' : 'Save Health Record'}
          variant="primary"
          loading={isSaving}
          disabled={!pickedFile || !title.trim() || isSaving}
          fullWidth
          onPress={handleSave}
          icon="upload"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  typeScroll: {
    flexGrow: 0,
  },
  typeList: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
