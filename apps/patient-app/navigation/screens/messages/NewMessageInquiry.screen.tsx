import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import Screen from '../../../components/layout/Screen';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Badge from '../../../components/ui/Badge';
import { AppIcon } from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import ThemedText from '../../../components/ui/ThemedText';
import FilterChipBar from '../../../components/ui/FilterChipBar';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import {
  communicationsService,
  type CommsAttachmentReference,
  type MessageCategory,
  type PatientEligibilityGrantDto,
} from '../../../services/comms/communicationsService';
import { dialog } from '../../../utils/dialog';

const CATEGORIES: { id: MessageCategory; label: string; icon: string }[] = [
  { id: 'Medical', label: 'Medical Inquiry', icon: 'stethoscope' },
  { id: 'PrescriptionRefill', label: 'Prescription Refill', icon: 'pill' },
  { id: 'LabInquiry', label: 'Laboratory Inquiry', icon: 'lab' },
  { id: 'Billing', label: 'Billing / HMO', icon: 'document' },
  { id: 'General', label: 'General Question', icon: 'chat' },
];

export default function NewMessageInquiryScreen() {
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();
  const { getToken, internalPatientId } = useAuth();

  // Emergency Gate State
  const [emergencyAcknowledged, setEmergencyAcknowledged] = useState<boolean | null>(null);
  const [emergencyBlocked, setEmergencyBlocked] = useState(false);

  // Form Fields
  const [grants, setGrants] = useState<PatientEligibilityGrantDto[]>([]);
  const [selectedGrantId, setSelectedGrantId] = useState<string | null>(null);
  const [selectedDependentId, setSelectedDependentId] = useState<string | null>(null);
  const [category, setCategory] = useState<MessageCategory>('Medical');
  const [subject, setSubject] = useState('');
  const [messageText, setMessageText] = useState('');
  const [attachments, setAttachments] = useState<CommsAttachmentReference[]>([]);

  // Loading & Submission State
  const [isLoadingGrants, setIsLoadingGrants] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Load Eligibility Grants
  useEffect(() => {
    let mounted = true;
    communicationsService
      .getEligibilityGrants(getToken)
      .then((res) => {
        if (!mounted) return;
        setGrants(res);
        if (res.length > 0) {
          setSelectedGrantId(res[0].grantId);
        }
      })
      .catch((err) => {
        console.warn('Failed to load eligibility grants:', err);
      })
      .finally(() => {
        if (mounted) setIsLoadingGrants(false);
      });
    return () => {
      mounted = false;
    };
  }, [getToken]);

  // Dependent Options derived from grants
  const dependentOptions: { id: string | null; label: string }[] = useMemo(() => {
    const list: { id: string | null; label: string }[] = [
      { id: null, label: 'Me (Self)' },
    ];
    const seen = new Set<string>();
    for (const g of grants) {
      if (g.patientId && g.patientId !== internalPatientId && !seen.has(g.patientId)) {
        seen.add(g.patientId);
        list.push({ id: g.patientId, label: 'Linked Dependent' });
      }
    }
    return list;
  }, [grants, internalPatientId]);

  // Selected active grant
  const activeGrant = useMemo(() => {
    return grants.find((g) => g.grantId === selectedGrantId) ?? grants[0] ?? null;
  }, [grants, selectedGrantId]);

  // Emergency Screening Handler
  const handleEmergencyAnswer = (isEmergency: boolean) => {
    if (isEmergency) {
      setEmergencyBlocked(true);
      setEmergencyAcknowledged(true);
    } else {
      setEmergencyBlocked(false);
      setEmergencyAcknowledged(false);
    }
  };

  const handleCallEmergency = () => {
    Linking.openURL('tel:911').catch(() => {
      dialog.alert('Emergency Contact', 'Please dial 911 or visit the nearest emergency room immediately.');
    });
  };

  // Pick & Upload Attachment
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      if (file.size && file.size > 15 * 1024 * 1024) {
        dialog.alert('File Too Large', 'Maximum file size is 15 MB.');
        return;
      }

      setIsUploadingFile(true);
      const uploaded = await communicationsService.uploadAttachment(getToken, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? 'application/octet-stream',
        size: file.size,
      });

      setAttachments((prev) => [...prev, uploaded]);
      dialog.alert('File Attached', `${file.name} was successfully scanned and attached.`);
    } catch (err: any) {
      dialog.alert('Upload Failed', err?.message ?? 'Could not upload attachment.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleRemoveAttachment = (fileKey: string) => {
    setAttachments((prev) => prev.filter((a) => a.fileKey !== fileKey));
  };

  // Submit Inquiry
  const handleSubmit = async () => {
    if (emergencyBlocked || emergencyAcknowledged === true) {
      dialog.alert(
        'Emergency Protocol Active',
        'Inquiries cannot be submitted for emergency conditions. Please contact 911 or proceed to an emergency department.',
      );
      return;
    }

    if (emergencyAcknowledged === null) {
      dialog.alert('Screening Required', 'Please complete the emergency screening question first.');
      return;
    }

    if (!messageText.trim()) {
      dialog.alert('Missing Message', 'Please describe your concern or question.');
      return;
    }

    const tenantId = activeGrant?.tenantId ?? 'default-tenant';
    const facilityId = activeGrant?.facilityId ?? 'default-facility';
    const facilityType = activeGrant?.facilityType ?? 'Clinic';
    const facilityName = activeGrant?.facilityName ?? 'Primary Health Facility';

    setIsSubmitting(true);
    try {
      const response = await communicationsService.submitInquiry(getToken, {
        patientId: selectedDependentId ?? internalPatientId ?? undefined,
        tenantId,
        facilityId,
        facilityType,
        facilityName,
        category,
        contentText: subject.trim() ? `[${subject.trim()}]\n\n${messageText.trim()}` : messageText.trim(),
        isEmergencyConfirmed: false,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      if (response.isEmergencyRedirect) {
        dialog.alert(
          'Emergency Redirect',
          response.redirectMessage ??
            'This inquiry indicates an urgent condition. Please proceed to the nearest emergency room.',
        );
        return;
      }

      if (response.conversationId) {
        navigation.replace('Main', {
          screen: 'ConversationThreadScreen',
          params: {
            conversationId: response.conversationId,
            title: facilityName,
            scope: facilityType,
          },
        });
      } else {
        dialog.alert(
          'Inquiry Submitted',
          'Your inquiry has been submitted and is currently with the triage team.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      }
    } catch (err: any) {
      dialog.alert('Submission Error', err?.message ?? 'Failed to submit inquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen width="form" contentContainerStyle={{ gap: spacing.lg }}>
      {/* Title */}
      <View style={{ gap: spacing.xs }}>
        <ThemedText variant="h2">New Message / Inquiry</ThemedText>
        <ThemedText variant="small" color="textMuted">
          Direct message with healthcare provider or facility
        </ThemedText>
      </View>

      {/* Step 1: Mandatory Emergency Screening Gate */}
      <Card
        padding="lg"
        style={[
          styles.gateCard,
          {
            borderColor: emergencyBlocked ? colors.emergencyBorder : colors.warningBorder,
            backgroundColor: emergencyBlocked ? colors.emergencyBg : colors.warningBg,
          },
        ]}
      >
        <View style={styles.gateHeader}>
          <AppIcon
            name={emergencyBlocked ? 'alert' : 'warning'}
            size={24}
            color={emergencyBlocked ? 'emergency' : 'warning'}
          />
          <View style={styles.flex}>
            <ThemedText variant="bodyBold" color={emergencyBlocked ? 'emergencyText' : 'warningText'}>
              MANDATORY EMERGENCY SCREENING
            </ThemedText>
            <ThemedText variant="small" color={emergencyBlocked ? 'emergencyText' : 'warningText'}>
              Are you or the patient experiencing severe chest pain, shortness of breath, sudden numbness, or life-threatening symptoms?
            </ThemedText>
          </View>
        </View>

        {emergencyBlocked ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <ThemedText variant="smallBold" color="emergencyText">
              If this is a medical emergency, do not submit this message. Please call 911 or go to the nearest emergency department immediately.
            </ThemedText>
            <Button
              label="Call 911 Emergency Now"
              variant="danger"
              size="lg"
              icon="phone"
              onPress={handleCallEmergency}
            />
            <Button
              label="Retract Emergency Answer"
              variant="outline"
              size="sm"
              onPress={() => setEmergencyBlocked(false)}
            />
          </View>
        ) : (
          <View style={[styles.gateButtonGroup, { gap: spacing.sm }]}>
            <Button
              label="Yes, I need emergency care"
              variant="outline"
              size="md"
              style={styles.flex}
              onPress={() => handleEmergencyAnswer(true)}
            />
            <Button
              label="No, this is not an emergency"
              variant={emergencyAcknowledged === false ? 'primary' : 'outline'}
              size="md"
              style={styles.flex}
              onPress={() => handleEmergencyAnswer(false)}
            />
          </View>
        )}
      </Card>

      {/* When not emergency blocked, show form */}
      {!emergencyBlocked && (
        <>
          {/* Step 2: Target Patient (Dependent Proxying) */}
          {dependentOptions.length > 1 && (
            <Card padding="md" style={{ gap: spacing.xs }}>
              <ThemedText variant="captionBold" color="textMuted">
                SENDING AS / ACTING FOR
              </ThemedText>
              <FilterChipBar
                items={dependentOptions.map((opt) => ({
                  key: opt.id ?? 'self',
                  label: opt.label,
                }))}
                selectedKey={selectedDependentId ?? 'self'}
                onSelect={(id) => setSelectedDependentId(id === 'self' ? null : id)}
              />
            </Card>
          )}

          {/* Step 3: Facility Selection */}
          <Card padding="md" style={{ gap: spacing.sm }}>
            <ThemedText variant="captionBold" color="textMuted">
              SELECT DESTINATION FACILITY
            </ThemedText>

            {isLoadingGrants ? (
              <ThemedText variant="small" color="textMuted">
                Loading connected healthcare facilities...
              </ThemedText>
            ) : grants.length === 0 ? (
              <View style={{ gap: spacing.xs }}>
                <ThemedText variant="small" color="textSecondary">
                  Connected Primary Clinic
                </ThemedText>
                <ThemedText variant="caption" color="textMuted">
                  Your inquiry will be routed to your enrolled primary care provider.
                </ThemedText>
              </View>
            ) : (
              <FilterChipBar
                items={grants.map((g) => ({
                  key: g.grantId,
                  label: `${g.facilityName} (${g.facilityType})`,
                }))}
                selectedKey={selectedGrantId ?? grants[0]?.grantId ?? ''}
                onSelect={(id) => setSelectedGrantId(id)}
              />
            )}
          </Card>

          {/* Step 4: Category Selection */}
          <Card padding="md" style={{ gap: spacing.sm }}>
            <ThemedText variant="captionBold" color="textMuted">
              INQUIRY CATEGORY
            </ThemedText>
            <FilterChipBar
              items={CATEGORIES.map((c) => ({
                key: c.id,
                label: c.label,
              }))}
              selectedKey={category}
              onSelect={(id) => setCategory(id as MessageCategory)}
            />
          </Card>

          {/* Step 5: Subject & Message Body */}
          <Card padding="md" style={{ gap: spacing.md }}>
            <Input
              label="Subject / Topic (Optional)"
              placeholder="e.g. Follow-up regarding blood test results"
              value={subject}
              onChangeText={setSubject}
              maxLength={100}
            />

            <Input
              label="Message Details *"
              placeholder="Describe your symptoms, question, or inquiry clearly..."
              value={messageText}
              onChangeText={setMessageText}
              multiline
              numberOfLines={5}
              maxLength={2000}
            />

            <View style={styles.charCountRow}>
              <ThemedText variant="caption" color="textMuted">
                {messageText.length} / 2000 characters
              </ThemedText>
            </View>

            {/* Attached Files List */}
            {attachments.length > 0 && (
              <View style={{ gap: spacing.xs }}>
                <ThemedText variant="captionBold" color="textMuted">
                  ATTACHED FILES ({attachments.length})
                </ThemedText>
                {attachments.map((att) => (
                  <View
                    key={att.fileKey}
                    style={[
                      styles.attachmentRow,
                      {
                        backgroundColor: colors.surfaceSubtle,
                        borderColor: colors.border,
                        borderRadius: radii.sm,
                        padding: spacing.sm,
                      },
                    ]}
                  >
                    <AppIcon name="document" size={16} color="primary" />
                    <ThemedText variant="smallBold" numberOfLines={1} style={styles.flex}>
                      {att.fileName}
                    </ThemedText>
                    <IconButton
                      icon="trash"
                      accessibilityLabel="Remove file"
                      hitSize={32}
                      onPress={() => handleRemoveAttachment(att.fileKey)}
                    />
                  </View>
                ))}
              </View>
            )}

            {/* Attachment Button */}
            <Button
              label={isUploadingFile ? 'Scanning & Encrypting...' : 'Attach Document or Image (Max 15MB)'}
              variant="outline"
              size="sm"
              icon="upload"
              disabled={isUploadingFile}
              onPress={handlePickDocument}
            />
          </Card>

          {/* Submit Action */}
          <Button
            label={isSubmitting ? 'Submitting to Triage...' : 'Send Inquiry to Facility'}
            variant="primary"
            size="lg"
            icon="check"
            disabled={isSubmitting || emergencyAcknowledged !== false || !messageText.trim()}
            onPress={handleSubmit}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  gateCard: {
    borderWidth: 1.5,
  },
  gateHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  gateButtonGroup: {
    flexDirection: 'row',
    marginTop: 12,
  },
  charCountRow: {
    alignItems: 'flex-end',
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
});
