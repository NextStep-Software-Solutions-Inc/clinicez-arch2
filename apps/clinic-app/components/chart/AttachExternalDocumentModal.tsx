import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { TextInput } from '../ui/Text';
import { Alert, notify } from '../../utils/feedback';
import { ThemedText, Icon, ValidatedDateInput, validateDateString, Modal, Button } from '../ui';
import { theme } from '../../constants/theme';
import { useStaff } from '../../context/StaffContext';
import { useAuth } from '../../context/AuthContext';
import {
  clinicService,
  type ClinicPatient,
  type ClinicRecordAttachmentRecord,
} from '../../services/clinicService';
import { offlineSyncService } from '../../services/offlineSyncService';
import { shouldQueueOffline } from '../../services/outboxPolicy';

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlaceholderStaffName(name?: string | null): boolean {
  if (!name || !name.trim()) return true;
  const normalized = name.trim().toLowerCase();
  return normalized === 'clinic staff' || normalized === 'clinicstaff';
}

export function normalizeAttachmentStaffAttribution(
  att: ClinicRecordAttachmentRecord,
  actorName?: string | null,
  actorId?: string | null
): ClinicRecordAttachmentRecord {
  const cleanActorName = actorName?.trim();
  const cleanActorId = actorId && GUID_REGEX.test(actorId) ? actorId : undefined;
  if (!cleanActorName) return att;

  const uploadedByStaffName = isPlaceholderStaffName(att.uploadedByStaffName)
    ? cleanActorName
    : att.uploadedByStaffName;
  const isVerified = att.verificationStatus === 'Verified';
  const verifiedByStaffName =
    isVerified && isPlaceholderStaffName(att.verifiedByStaffName)
      ? cleanActorName
      : att.verifiedByStaffName;

  return {
    ...att,
    uploadedByStaffId: att.uploadedByStaffId || cleanActorId || undefined,
    uploadedByStaffName,
    verifiedByStaffId: isVerified ? (att.verifiedByStaffId || cleanActorId || undefined) : att.verifiedByStaffId,
    verifiedByStaffName,
  };
}

export interface AttachExternalDocumentModalProps {
  visible: boolean;
  patient?: ClinicPatient | null;
  patientId?: string;
  onClose: () => void;
  onAttachmentUploaded?: (attachment: ClinicRecordAttachmentRecord) => void;
}

export default function AttachExternalDocumentModal({
  visible,
  patient,
  patientId,
  onClose,
  onAttachmentUploaded,
}: AttachExternalDocumentModalProps) {
  const { current: currentStaff, currentName } = useStaff();
  const { user: authUser } = useAuth();
  const actorStaffName = (currentName || authUser?.name || authUser?.email || '').trim();
  const rawActorStaffId = currentStaff?.id || authUser?.id || '';
  const actorStaffId = GUID_REGEX.test(rawActorStaffId) ? rawActorStaffId : undefined;

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docRecordType, setDocRecordType] = useState('OutsideChestXRay');
  const [docFileType, setDocFileType] = useState<'PDF' | 'Photo'>('PDF');
  const [docNotes, setDocNotes] = useState('');
  const [customFileName, setCustomFileName] = useState('');
  const [fileExtension, setFileExtension] = useState('');
  const [pickedDocFile, setPickedDocFile] = useState<{
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
    file?: File;
  } | null>(null);

  useEffect(() => {
    if (visible) {
      setDocTitle('');
      setDocDate(new Date().toISOString().split('T')[0]);
      setDocRecordType('OutsideChestXRay');
      setDocFileType('PDF');
      setDocNotes('');
      setCustomFileName('');
      setFileExtension('');
      setPickedDocFile(null);
      setUploadingDoc(false);
    }
  }, [visible]);

  const handlePickDocument = async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const originalName = asset.name;
      const lastDotIndex = originalName.lastIndexOf('.');
      const baseName = lastDotIndex !== -1 ? originalName.substring(0, lastDotIndex) : originalName;
      const ext = lastDotIndex !== -1 ? originalName.substring(lastDotIndex) : '';

      setPickedDocFile({
        name: originalName,
        size: asset.size,
        uri: asset.uri,
        mimeType: asset.mimeType || (originalName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        file: (asset as any).file,
      });
      setCustomFileName(baseName);
      setFileExtension(ext);

      if (!docTitle.trim()) {
        setDocTitle(baseName);
      }
      if (asset.name.toLowerCase().endsWith('.pdf')) {
        setDocFileType('PDF');
      } else {
        setDocFileType('Photo');
      }
    } catch (err: any) {
      Alert.alert('File Selection Error', err?.message || 'Could not pick file.');
    }
  };

  const handleUploadDocument = async () => {
    const targetPatientId = patient?.id || patientId;
    if (!targetPatientId) {
      notify.error('No patient selected to attach external document.');
      return;
    }
    if (!docTitle.trim()) {
      Alert.alert('Title required', 'Enter a document title.');
      return;
    }

    const docDateValidation = validateDateString(docDate, { boundaryMode: 'pastOrToday' });
    if (!docDateValidation.isValid) {
      Alert.alert('Invalid Document Date', docDateValidation.errorMessage || 'Please enter a valid document date not in the future.');
      return;
    }

    const strictlyFormattedDocDate = (docDateValidation.formattedDate || new Date().toISOString().split('T')[0]).split('T')[0];

    setUploadingDoc(true);

    const trimmedCustom = customFileName.trim();
    let finalFileName = pickedDocFile?.name || `${docTitle.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}`;
    if (pickedDocFile && trimmedCustom) {
      const hasExt = fileExtension && trimmedCustom.toLowerCase().endsWith(fileExtension.toLowerCase());
      finalFileName = hasExt ? trimmedCustom : `${trimmedCustom}${fileExtension}`;
    }

    if (pickedDocFile) {
      try {
        const formData = new FormData();
        formData.append('PatientId', targetPatientId);
        formData.append('RecordType', docRecordType);
        formData.append('Title', docTitle.trim());
        formData.append('FileName', finalFileName);
        if (docNotes.trim()) formData.append('Notes', docNotes.trim());
        formData.append('DocumentDate', strictlyFormattedDocDate);
        if (actorStaffId) formData.append('UploadedByStaffId', actorStaffId);
        if (actorStaffName) formData.append('UploadedByStaffName', actorStaffName);

        if (pickedDocFile.file) {
          formData.append('File', pickedDocFile.file, finalFileName);
        } else {
          formData.append('File', {
            uri: pickedDocFile.uri,
            name: finalFileName,
            type: pickedDocFile.mimeType || 'application/octet-stream',
          } as any);
        }

        const [newAtt, err] = await clinicService.uploadRecordAttachmentFile(formData);
        setUploadingDoc(false);

        if (newAtt) {
          const attributedAtt = normalizeAttachmentStaffAttribution(newAtt, actorStaffName, actorStaffId);
          notify.success('Document attached to the patient record.');
          onAttachmentUploaded?.(attributedAtt);
          onClose();
          return;
        } else if (err) {
          notify.error(err.message || 'The server rejected this document upload.');
          return;
        }
      } catch (uploadErr: any) {
        setUploadingDoc(false);
        notify.error(uploadErr?.message || 'Failed to upload document file.');
        return;
      }
    }

    const tenantId = (patient as any)?.tenantId || 'default-tenant';
    const clinicId = (patient as any)?.clinicId || 'default-clinic';

    const payload = {
      patientId: targetPatientId,
      recordType: docRecordType,
      title: docTitle.trim(),
      fileName: finalFileName,
      contentType: docFileType === 'PDF' ? 'application/pdf' : 'image/jpeg',
      fileSizeBytes: 1024 * 450,
      storageUri: `tenants/${tenantId}/clinics/${clinicId}/records/${Date.now()}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}.cez`,
      documentDate: strictlyFormattedDocDate,
      notes: docNotes.trim() || undefined,
      uploadedByStaffId: actorStaffId,
      uploadedByStaffName: actorStaffName || undefined,
      encryptionAlgorithm: 'AES-256-GCM',
      encryptionKeyId: 'cmk-v1',
    };

    const [newAtt, err] = await clinicService.uploadRecordAttachment(payload);
    setUploadingDoc(false);

    if (newAtt) {
      const attributedAtt = normalizeAttachmentStaffAttribution(newAtt, actorStaffName, actorStaffId);
      notify.success('Document attached to the patient record.');
      onAttachmentUploaded?.(attributedAtt);
      onClose();
    } else if (!shouldQueueOffline(err?.status ?? 0)) {
      notify.error(err?.message || 'The server rejected this document.');
    } else {
      const queuedAtt = await offlineSyncService.enqueueAttachment(payload, actorStaffName || undefined);
      notify.success('Document queued offline.');
      Alert.alert('Saved on this device', 'The document is queued and will upload automatically once the connection is back.');
      onAttachmentUploaded?.(queuedAtt as any);
      onClose();
    }
  };

  const patientDisplayName = patient?.fullName || (patient as any)?.patientName || 'Patient';

  return (
    <Modal raw visible={visible} transparent animationType="slide" onClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxWidth: 500 }]}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Attach External Physical Document</ThemedText>
            <Button
              variant="ghost"
              size="xs"
              icon="close"
              iconOnly
              accessibilityLabel="Close"
              onPress={onClose}
            />
          </View>
          <ThemedText style={styles.modalSub}>
            Ingest scanned physical documents (outside Chest X-Ray films, lab sheets, or med certs) directly into {patientDisplayName}&apos;s profile.
          </ThemedText>

          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <ThemedText style={styles.inputLabel}>Document Title *</ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Chest X-ray (outside clinic)"
                placeholderTextColor={theme.colors.textMuted}
                value={docTitle}
                onChangeText={setDocTitle}
              />
            </View>

            <ValidatedDateInput
              label="Document Date (YYYY-MM-DD)"
              required
              value={docDate}
              onChangeText={setDocDate}
              boundaryMode="pastOrToday"
              placeholder="YYYY-MM-DD"
            />

            <View>
              <ThemedText style={styles.inputLabel}>Document / Record Classification</ThemedText>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'OutsideChestXRay', label: 'Chest X-Ray' },
                  { key: 'MedicalCertificate', label: 'Outside MedCert' },
                  { key: 'LabResult', label: 'Lab Sheet' },
                  { key: 'Other', label: 'Other' },
                ].map((t) => (
                  <Pressable
                    key={t.key}
                    style={[styles.formatChip, docRecordType === t.key && styles.formatChipActive]}
                    onPress={() => setDocRecordType(t.key)}
                  >
                    <ThemedText style={[styles.formatChipText, docRecordType === t.key && styles.formatChipTextActive]}>
                      {t.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <ThemedText style={styles.inputLabel}>Ingestion Source / Format</ThemedText>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['PDF', 'Photo'] as const).map((fmt) => (
                  <Pressable
                    key={fmt}
                    style={[styles.formatChip, docFileType === fmt && styles.formatChipActive]}
                    onPress={() => setDocFileType(fmt)}
                  >
                    <ThemedText style={[styles.formatChipText, docFileType === fmt && styles.formatChipTextActive]}>
                      {fmt === 'PDF' ? 'Scanned PDF' : 'Flatbed / Camera Scan'}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <ThemedText style={styles.inputLabel}>File Attachment (PDF, JPEG, PNG)</ThemedText>
              {pickedDocFile ? (
                <View style={styles.pickedFileContainer}>
                  <View style={styles.pickedFileBox}>
                    <View style={styles.pickedFileInfo}>
                      <Icon
                        name={pickedDocFile.name.toLowerCase().endsWith('.pdf') ? 'file' : 'paperclip'}
                        size={theme.sizes.iconMd}
                        color={theme.colors.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText variant="captionBold" color={theme.colors.text} numberOfLines={1}>
                          {pickedDocFile.name}
                        </ThemedText>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          {pickedDocFile.size ? `${(pickedDocFile.size / 1024).toFixed(1)} KB` : 'Ready to upload'}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Button
                        variant="outline"
                        size="xs"
                        title="Change"
                        onPress={handlePickDocument}
                      />
                      <Button
                        variant="dangerOutline"
                        size="xs"
                        title="Clear"
                        onPress={() => {
                          setPickedDocFile(null);
                          setCustomFileName('');
                          setFileExtension('');
                        }}
                      />
                    </View>
                  </View>

                  <View style={styles.renameFieldWrap}>
                    <ThemedText style={styles.inputLabel}>Attachment Display Name (Renaming)</ThemedText>
                    <View style={styles.renameInputRow}>
                      <TextInput
                        style={[styles.textInput, styles.renameInput]}
                        placeholder="e.g. Chest_XRay_Nov2026"
                        placeholderTextColor={theme.colors.textMuted}
                        value={customFileName}
                        onChangeText={setCustomFileName}
                        accessibilityLabel="Attachment Display Name"
                      />
                      {fileExtension ? (
                        <View style={styles.extensionBadge}>
                          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                            {fileExtension}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Preserves file extension and underlying content. The customized name will be saved in Doc Vault.
                    </ThemedText>
                  </View>
                </View>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  icon="upload"
                  title="Select Document File (PDF, JPEG, PNG)"
                  onPress={handlePickDocument}
                />
              )}
            </View>

            <View>
              <ThemedText style={styles.inputLabel}>Clinical Review Findings & Notes</ThemedText>
              <TextInput
                style={[styles.textInput, { height: 60 }]}
                multiline
                placeholder="e.g. Clean chest PA film, no active pulmonary disease seen."
                placeholderTextColor={theme.colors.textMuted}
                value={docNotes}
                onChangeText={setDocNotes}
              />
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 }}>
            <Button
              variant="subtle"
              size="sm"
              title="Cancel"
              disabled={uploadingDoc}
              onPress={onClose}
            />
            <Button
              variant="primary"
              size="sm"
              title="Save & Attach to Profile"
              loading={uploadingDoc}
              disabled={uploadingDoc}
              onPress={handleUploadDocument}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    width: '100%',
    maxWidth: 720,
    maxHeight: '95%',
    alignSelf: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalSub: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  formatChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  formatChipActive: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.info,
  },
  formatChipText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  formatChipTextActive: {
    color: theme.colors.infoText,
  },
  pickedFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
  },
  pickedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  pickedFileContainer: {
    gap: theme.spacing.sm,
  },
  renameFieldWrap: {
    gap: 4,
  },
  renameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  renameInput: {
    flex: 1,
  },
  extensionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
