import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { TextInput } from '../ui/Text';
import { Alert, notify } from '../../utils/feedback';
import { ThemedText, Icon, ValidatedDateInput, validateDateString, Modal } from '../ui';
import { theme } from '../../constants/theme';
import { useStaff } from '../../context/StaffContext';
import {
  clinicService,
  type ClinicPatient,
  type ClinicRecordAttachmentRecord,
} from '../../services/clinicService';
import { offlineSyncService } from '../../services/offlineSyncService';
import { shouldQueueOffline } from '../../services/outboxPolicy';

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
  const { currentName } = useStaff();

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docRecordType, setDocRecordType] = useState('OutsideChestXRay');
  const [docFileType, setDocFileType] = useState<'PDF' | 'Photo'>('PDF');
  const [docNotes, setDocNotes] = useState('');
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
      setPickedDocFile({
        name: asset.name,
        size: asset.size,
        uri: asset.uri,
        mimeType: asset.mimeType || (asset.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        file: (asset as any).file,
      });
      if (!docTitle.trim()) {
        const cleanName = asset.name.replace(/\.[^/.]+$/, '');
        setDocTitle(cleanName);
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

    if (pickedDocFile) {
      try {
        const formData = new FormData();
        formData.append('PatientId', targetPatientId);
        formData.append('RecordType', docRecordType);
        formData.append('Title', docTitle.trim());
        if (docNotes.trim()) formData.append('Notes', docNotes.trim());
        formData.append('DocumentDate', strictlyFormattedDocDate);

        if (pickedDocFile.file) {
          formData.append('File', pickedDocFile.file);
        } else {
          formData.append('File', {
            uri: pickedDocFile.uri,
            name: pickedDocFile.name,
            type: pickedDocFile.mimeType || 'application/octet-stream',
          } as any);
        }

        const [newAtt, err] = await clinicService.uploadRecordAttachmentFile(formData);
        setUploadingDoc(false);

        if (newAtt) {
          notify.success('Document attached to the patient record.');
          onAttachmentUploaded?.(newAtt);
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
      fileName: `${docTitle.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}`,
      contentType: docFileType === 'PDF' ? 'application/pdf' : 'image/jpeg',
      fileSizeBytes: 1024 * 450,
      storageUri: `tenants/${tenantId}/clinics/${clinicId}/records/${Date.now()}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}.cez`,
      documentDate: strictlyFormattedDocDate,
      notes: docNotes.trim() || undefined,
      uploadedByStaffName: currentName || undefined,
      encryptionAlgorithm: 'AES-256-GCM',
      encryptionKeyId: 'cmk-v1',
    };

    const [newAtt, err] = await clinicService.uploadRecordAttachment(payload);
    setUploadingDoc(false);

    if (newAtt) {
      notify.success('Document attached to the patient record.');
      onAttachmentUploaded?.(newAtt);
      onClose();
    } else if (!shouldQueueOffline(err?.status ?? 0)) {
      notify.error(err?.message || 'The server rejected this document.');
    } else {
      const queuedAtt = await offlineSyncService.enqueueAttachment(payload, currentName || undefined);
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
            <Pressable onPress={onClose} hitSlop={theme.spacing.sm}>
              <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
          <ThemedText style={styles.modalSub}>
            Ingest scanned physical documents (paper COR, outside Chest X-Ray films, lab sheets, or med certs) directly into {patientDisplayName}&apos;s profile.
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
                  { key: 'CertificateOfRegistration', label: 'Paper COR' },
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
                    <Pressable style={styles.changeFileBtn} onPress={handlePickDocument}>
                      <ThemedText variant="captionBold" color={theme.colors.primary}>Change</ThemedText>
                    </Pressable>
                    <Pressable style={styles.removeFileBtn} onPress={() => setPickedDocFile(null)}>
                      <ThemedText variant="captionBold" color={theme.colors.emergencyText}>Clear</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={styles.pickFileBtn} onPress={handlePickDocument}>
                  <Icon name="upload" size={theme.sizes.iconSm} color={theme.colors.primary} />
                  <ThemedText variant="captionBold" color={theme.colors.primary}>
                    Select Document File (PDF, JPEG, PNG)
                  </ThemedText>
                </Pressable>
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
            <Pressable
              style={styles.cancelModalBtn}
              onPress={onClose}
              disabled={uploadingDoc}
            >
              <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={styles.confirmAttachBtn}
              onPress={handleUploadDocument}
              disabled={uploadingDoc}
            >
              {uploadingDoc ? (
                <ActivityIndicator color={theme.colors.textInverted} />
              ) : (
                <ThemedText style={styles.confirmAttachText}>Save & Attach to Profile</ThemedText>
              )}
            </Pressable>
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
  changeFileBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  removeFileBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
  },
  pickFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
  },
  cancelModalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  cancelModalText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  confirmAttachBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
  },
  confirmAttachText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
});
