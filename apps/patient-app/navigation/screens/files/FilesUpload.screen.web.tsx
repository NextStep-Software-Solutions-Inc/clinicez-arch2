import React, { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Input from '@ui/Input';
import Card from '@ui/Card';
import { AppIcon, type IconName } from '@ui/Icon';
import Screen from '../../../components/layout/Screen';
import ProfileDatePicker from '../../../components/profile/ProfileDatePicker';
import { usePatientId } from 'hooks/usePatientId';
import {
  formatBytes,
  validateUploadFile,
  UPLOAD_ALLOWED_MIME_TYPES,
} from '../../../services/documents/uploadRules';
import { enqueueOfflineRecordUpload } from '../../../services/sync/uploadQueueService';
import type { HealthRecordCategory } from '../../../db/schema/localHealthRecords';
import type { FilesScreenProps } from './navigationTypes';
import { useAppTheme } from '../../../contexts/ThemeContext';
import type { ColorToken } from '../../../constants/theme';

interface CategoryOption {
  id: HealthRecordCategory;
  label: string;
  icon: IconName;
  colorToken: ColorToken;
}

const CATEGORIES: CategoryOption[] = [
  { id: 'lab_result', label: 'Lab Result', icon: 'lab', colorToken: 'success' },
  { id: 'imaging', label: 'Imaging / X-Ray', icon: 'activity', colorToken: 'info' },
  { id: 'prescription', label: 'Prescription', icon: 'pill', colorToken: 'emergency' },
  { id: 'vaccine_card', label: 'Vaccine Card', icon: 'badge', colorToken: 'purple' },
  { id: 'certificate', label: 'Certificate', icon: 'document', colorToken: 'warning' },
  { id: 'other', label: 'Other', icon: 'folder', colorToken: 'textSecondary' },
];

export function sanitizeTitleFromFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const withSpaces = baseName.replace(/[_\-.]+/g, ' ');
  return withSpaces.trim().replace(/\s+/g, ' ').slice(0, 200) || 'Medical Record';
}

function inferCategoryFromName(fileName: string): HealthRecordCategory | null {
  const lower = fileName.toLowerCase();
  if (lower.includes('cbc') || lower.includes('urinalysis') || lower.includes('blood') || lower.includes('lab')) {
    return 'lab_result';
  }
  if (lower.includes('xray') || lower.includes('cxr') || lower.includes('mri') || lower.includes('scan') || lower.includes('ultrasound')) {
    return 'imaging';
  }
  if (lower.includes('rx') || lower.includes('prescription')) {
    return 'prescription';
  }
  if (lower.includes('vaccine') || lower.includes('immunization') || lower.includes('vax')) {
    return 'vaccine_card';
  }
  if (lower.includes('cert') || lower.includes('clearance') || lower.includes('fit-to-work')) {
    return 'certificate';
  }
  return null;
}

export default function FilesUploadScreenWeb({ route }: FilesScreenProps<'FilesUploadScreen'>) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();

  const [pickedFile, setPickedFile] = useState<{
    file: File | Blob;
    name: string;
    mimeType: string;
    size: number;
  } | null>(null);

  const [category, setCategory] = useState<HealthRecordCategory>('lab_result');
  const [title, setTitle] = useState('');
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [facilityName, setFacilityName] = useState('');
  const [notes, setNotes] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

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
    const inferred = inferCategoryFromName(file.name);
    if (inferred) {
      setCategory(inferred);
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
      await enqueueOfflineRecordUpload(
        {
          patientId,
          documentTypeId: category,
          category,
          title: title.trim(),
          fileName: pickedFile.name,
          mimeType: pickedFile.mimeType,
          sizeBytes: pickedFile.size,
          documentDate: documentDate || undefined,
          facilityName: facilityName.trim() || undefined,
          notes: notes.trim() || undefined,
          fileBlob: pickedFile.file,
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

      <View style={{ gap: spacing.xl, paddingVertical: spacing.md }}>
        <View style={{ gap: spacing.xxs }}>
          <ThemedText variant="h2" color="primary">
            Add Health Record
          </ThemedText>
          <ThemedText variant="small" color="textSecondary">
            Attach a lab result, prescription, certificate, or diagnostic image to your records.
          </ThemedText>
        </View>

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

        {/* Category selection */}
        <View style={{ gap: spacing.sm }}>
          <ThemedText variant="smallBold" color="textSecondary">
            RECORD CATEGORY *
          </ThemedText>
          <View style={[styles.typeList, { gap: spacing.sm }]}>
            {CATEGORIES.map((cat) => {
              const selected = cat.id === category;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategory(cat.id)}
                  accessibilityRole="button"
                  accessibilityLabel={cat.label}
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
                  <AppIcon name={cat.icon} color={selected ? 'primary' : cat.colorToken} size={sizes.iconSm} />
                  <ThemedText variant="smallBold" color={selected ? 'primary' : 'text'}>
                    {cat.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
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
  typeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 2,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
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
