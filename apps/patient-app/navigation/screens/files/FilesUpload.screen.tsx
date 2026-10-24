import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useAuth as useAppAuth } from 'contexts/AuthContext';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Input from '@ui/Input';
import Card from '@ui/Card';
import { AppIcon } from '@ui/Icon';
import ProfileDatePicker from '../../../components/profile/ProfileDatePicker';
import { usePatientId } from 'hooks/usePatientId';
import { useDocumentTypes } from '../../../hooks/useDocumentTypes';
import { useContentInsets } from '../../../hooks/useContentInsets';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { dialog } from '@utils/dialog';
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
import { IMAGE_UPLOAD_QUALITY } from '../../../services/files/fileCompression';

export function sanitizeTitleFromFileName(fileName: string): string {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const withSpaces = baseName.replace(/[_\-.]+/g, ' ');
  return withSpaces.trim().replace(/\s+/g, ' ').slice(0, 200) || 'Medical Record';
}

export default function FilesUploadScreen() {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { runWithAutoLockPaused } = useAppAuth();
  const insets = useContentInsets();
  const { documentTypes } = useDocumentTypes(patientId);

  const [pickedFile, setPickedFile] = useState<{
    uri: string;
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

  const handlePickDocument = async () => {
    setErrorBanner(null);
    try {
      const result = await runWithAutoLockPaused(() =>
        DocumentPicker.getDocumentAsync({
          type: [...UPLOAD_ALLOWED_MIME_TYPES],
          copyToCacheDirectory: true,
          multiple: false,
        })
      );
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'application/pdf';
      const size = asset.size ?? 0;

      const validationError = validateUploadFile({ mimeType, size });
      if (validationError) {
        setErrorBanner(validationError);
        return;
      }

      setPickedFile({
        uri: asset.uri,
        name: asset.name,
        mimeType,
        size,
      });

      if (!title) {
        setTitle(sanitizeTitleFromFileName(asset.name));
      }
      const inferred = inferDocumentTypeFromFileName(asset.name, documentTypes);
      if (inferred) {
        setSelectedDocumentTypeId(inferred.id);
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Unable to pick document.');
    }
  };

  const handlePickImage = async (source: 'camera' | 'library') => {
    setErrorBanner(null);
    try {
      const permission = await runWithAutoLockPaused(() =>
        source === 'camera'
          ? ImagePicker.requestCameraPermissionsAsync()
          : ImagePicker.requestMediaLibraryPermissionsAsync()
      );
      if (permission.status !== 'granted') {
        dialog.alert('Permission needed', source === 'camera' ? 'Camera access is needed.' : 'Photo access is needed.');
        return;
      }
      const result = await runWithAutoLockPaused(() =>
        source === 'camera'
          ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: IMAGE_UPLOAD_QUALITY })
          : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: IMAGE_UPLOAD_QUALITY, allowsMultipleSelection: false })
      );
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const fileName = asset.fileName ?? `Photo-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const size = asset.fileSize ?? 0;

      const validationError = validateUploadFile({ mimeType, size });
      if (validationError) {
        setErrorBanner(validationError);
        return;
      }

      setPickedFile({
        uri: asset.uri,
        name: fileName,
        mimeType,
        size,
      });

      if (!title) {
        setTitle(sanitizeTitleFromFileName(fileName));
      }
      const inferred = inferDocumentTypeFromFileName(fileName, documentTypes);
      if (inferred) {
        setSelectedDocumentTypeId(inferred.id);
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Unable to pick photo.');
    }
  };

  const handleSave = async () => {
    if (!pickedFile) {
      setErrorBanner('Please attach a photo or document.');
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

      await enqueueOfflineRecordUpload(
        {
          patientId,
          documentTypeId: resolvedDocTypeId,
          category,
          title: title.trim(),
          fileName: pickedFile.name,
          mimeType: pickedFile.mimeType,
          sizeBytes: pickedFile.size,
          documentDate: documentDate || undefined,
          facilityName: facilityName.trim() || undefined,
          notes: notes.trim() || undefined,
          localUri: pickedFile.uri,
        },
        getToken
      );
      navigation.goBack();
    } catch (err: any) {
      setErrorBanner(err.message || 'Unable to save health record.');
      setIsSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.lg,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Error Banner */}
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

      {/* Attachment Section */}
      <View style={{ gap: spacing.sm }}>
        <ThemedText variant="smallBold" color="textSecondary">
          ATTACHMENT *
        </ThemedText>
        {pickedFile ? (
          <Card padding="md">
            <View style={[styles.selectedFileRow, { gap: spacing.md }]}>
              <View
                style={[
                  styles.fileIconWrap,
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
          <View style={[styles.pickGrid, { gap: spacing.md }]}>
            <Pressable
              onPress={() => handlePickImage('camera')}
              accessibilityRole="button"
              accessibilityLabel="Take photo with camera"
              style={({ pressed }) => [
                styles.pickCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: spacing.xs,
                  opacity: pressed ? 0.8 : 1,
                },
                shadows.sm,
              ]}
            >
              <AppIcon name="camera" color="success" size={sizes.iconLg} />
              <ThemedText variant="bodyBold">Camera</ThemedText>
              <ThemedText variant="caption" color="textMuted">Take photo</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => handlePickImage('library')}
              accessibilityRole="button"
              accessibilityLabel="Choose photo from library"
              style={({ pressed }) => [
                styles.pickCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: spacing.xs,
                  opacity: pressed ? 0.8 : 1,
                },
                shadows.sm,
              ]}
            >
              <AppIcon name="image" color="purple" size={sizes.iconLg} />
              <ThemedText variant="bodyBold">Photos</ThemedText>
              <ThemedText variant="caption" color="textMuted">From gallery</ThemedText>
            </Pressable>

            <Pressable
              onPress={handlePickDocument}
              accessibilityRole="button"
              accessibilityLabel="Browse document"
              style={({ pressed }) => [
                styles.pickCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: spacing.xs,
                  opacity: pressed ? 0.8 : 1,
                },
                shadows.sm,
              ]}
            >
              <AppIcon name="upload" color="primary" size={sizes.iconLg} />
              <ThemedText variant="bodyBold">Browse</ThemedText>
              <ThemedText variant="caption" color="textMuted">PDF / Docs</ThemedText>
            </Pressable>
          </View>
        )}
      </View>

      {/* Document Type Selection (synced from backend & cached in SQLite) */}
      <View style={{ gap: spacing.sm }}>
        <ThemedText variant="smallBold" color="textSecondary">
          CATEGORY *
        </ThemedText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.categoryList, { gap: spacing.sm }]}
        >
          {documentTypes.map((docType) => {
            const isSelected = selectedDocumentTypeId === docType.id;
            const visual = getDocumentTypeVisualMeta(docType);
            return (
              <Pressable
                key={docType.id}
                onPress={() => setSelectedDocumentTypeId(docType.id)}
                accessibilityRole="button"
                accessibilityLabel={docType.label}
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.categoryChip,
                  {
                    borderRadius: radii.lg,
                    borderWidth: sizes.borderWidth,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    gap: spacing.xs,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primaryLight : colors.card,
                  },
                ]}
              >
                <AppIcon
                  name={visual.icon}
                  color={isSelected ? 'primary' : visual.colorToken}
                  size={sizes.iconSm}
                />
                <ThemedText variant="smallBold" color={isSelected ? 'primary' : 'text'}>
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
          placeholder="Add clinical observations, instructions, or doctor remarks..."
          multiline
          numberOfLines={3}
          maxLength={1000}
          containerStyle={{ minHeight: 80 }}
        />
      </View>

      {/* Save Button */}
      <Button
        label={isSaving ? 'Saving record...' : 'Save Health Record'}
        variant="primary"
        loading={isSaving}
        disabled={!pickedFile || !title.trim() || isSaving}
        fullWidth
        onPress={handleSave}
        icon="upload"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {},
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickGrid: {
    flexDirection: 'row',
  },
  pickCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryList: {
    paddingVertical: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
