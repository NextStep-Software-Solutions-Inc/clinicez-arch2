import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import Screen from '../../../components/layout/Screen';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { AppIcon, type IconName } from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import ThemedText from '../../../components/ui/ThemedText';
import FilterChipBar from '../../../components/ui/FilterChipBar';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import {
  communicationsService,
  deduplicateEligibilityGrants,
  type CommsAttachmentReference,
  type MessageCategory,
  type PatientEligibilityGrantDto,
} from '../../../services/comms/communicationsService';
import { dialog } from '../../../utils/dialog';

export { deduplicateEligibilityGrants };
export const MAX_SUBJECT_LENGTH = 100;
export const MAX_MESSAGE_LENGTH = 850;
export const MAX_COMBINED_CONTENT_LENGTH = 1000;

export const INQUIRY_CATEGORIES: { id: MessageCategory; label: string; icon: IconName }[] = [
  { id: 'PostVisitFollowUp', label: 'Medical / Follow-Up', icon: 'stethoscope' },
  { id: 'PrescriptionRefill', label: 'Prescriptions', icon: 'pill' },
  { id: 'LabResultQuestion', label: 'Lab Inquiry', icon: 'lab' },
  { id: 'Billing', label: 'Billing / HMO', icon: 'document' },
  { id: 'Scheduling', label: 'Scheduling', icon: 'calendar' },
  { id: 'Other', label: 'General', icon: 'chat' },
];

export default function NewMessageInquiryScreen() {
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();
  const { getToken, internalPatientId } = useAuth();
  const mountedRef = useRef(true);

  // Emergency Gate State
  const [emergencyAcknowledged, setEmergencyAcknowledged] = useState<boolean | null>(null);
  const [emergencyBlocked, setEmergencyBlocked] = useState(false);

  // Form Fields
  const [grants, setGrants] = useState<PatientEligibilityGrantDto[]>([]);
  const [selectedGrantId, setSelectedGrantId] = useState<string | null>(null);
  const [selectedDependentId, setSelectedDependentId] = useState<string | null>(null);
  const [category, setCategory] = useState<MessageCategory>('PostVisitFollowUp');
  const [subject, setSubject] = useState('');
  const [messageText, setMessageText] = useState('');
  const [attachments, setAttachments] = useState<CommsAttachmentReference[]>([]);

  // Loading & Submission State
  const [isLoadingGrants, setIsLoadingGrants] = useState(true);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load Eligibility Grants
  const loadGrants = useCallback(async () => {
    setIsLoadingGrants(true);
    setGrantsError(null);
    try {
      const res = await communicationsService.getEligibilityGrants(getToken);
      if (!mountedRef.current) return;
      setGrants(res);
      setSelectedGrantId((prev) =>
        prev && res.some((g) => g.grantId === prev) ? prev : (res[0]?.grantId ?? null),
      );
    } catch (err: any) {
      console.warn('Failed to load eligibility grants:', err);
      if (!mountedRef.current) return;
      setGrants([]);
      setSelectedGrantId(null);
      setGrantsError(
        err?.message ?? 'Could not load your connected healthcare facilities. Please try again.',
      );
    } finally {
      if (mountedRef.current) {
        setIsLoadingGrants(false);
      }
    }
  }, [getToken]);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

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

  const targetPatientId = selectedDependentId ?? internalPatientId ?? null;

  const eligibleGrants = useMemo(() => {
    const scoped = targetPatientId
      ? grants.filter((g) => g.patientId === targetPatientId)
      : grants;
    return deduplicateEligibilityGrants(scoped);
  }, [grants, targetPatientId]);

  useEffect(() => {
    if (eligibleGrants.length === 0) {
      setSelectedGrantId(null);
      return;
    }
    if (!selectedGrantId || !eligibleGrants.some((g) => g.grantId === selectedGrantId)) {
      setSelectedGrantId(eligibleGrants[0].grantId);
    }
  }, [eligibleGrants, selectedGrantId]);

  // Selected active grant
  const activeGrant = useMemo(() => {
    return eligibleGrants.find((g) => g.grantId === selectedGrantId) ?? eligibleGrants[0] ?? null;
  }, [eligibleGrants, selectedGrantId]);

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
      const fileSize = file.size ?? file.file?.size;
      if (fileSize && fileSize > 15 * 1024 * 1024) {
        dialog.alert('File Too Large', 'Maximum file size is 15 MB.');
        return;
      }

      setIsUploadingFile(true);
      const uploaded = await communicationsService.uploadAttachment(getToken, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || file.file?.type || 'application/octet-stream',
        size: fileSize,
        file: file.file,
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

    if (!activeGrant) {
      dialog.alert(
        'No Connected Facility',
        'You must have an active connected healthcare facility before submitting an inquiry.',
      );
      return;
    }

    const trimmedMessage = messageText.trim();
    if (!trimmedMessage) {
      dialog.alert('Missing Message', 'Please describe your concern or question.');
      return;
    }

    const trimmedSubject = subject.trim();
    const formattedContent = trimmedSubject
      ? `[${trimmedSubject}]\n\n${trimmedMessage}`
      : trimmedMessage;

    if (formattedContent.length > MAX_COMBINED_CONTENT_LENGTH) {
      dialog.alert(
        'Message Too Long',
        `Your inquiry cannot exceed ${MAX_COMBINED_CONTENT_LENGTH} characters including the subject.`,
      );
      return;
    }

    const { tenantId, facilityId, facilityType, facilityName } = activeGrant;

    setIsSubmitting(true);
    try {
      const response = await communicationsService.submitInquiry(getToken, {
        patientId: selectedDependentId ?? activeGrant.patientId ?? internalPatientId ?? undefined,
        tenantId,
        facilityId,
        facilityType,
        facilityName,
        category,
        contentText: formattedContent,
        isEmergencyConfirmed: false,
        attachments: attachments.length > 0 ? attachments : undefined,
        subject: trimmedSubject || undefined,
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
    <Screen width="form" contentContainerStyle={{ gap: spacing.md }}>
      {/* Step 1: Mandatory Emergency Screening Gate */}
      {emergencyAcknowledged === false ? (
        <Pressable
          onPress={() => setEmergencyAcknowledged(null)}
          style={[
            styles.gateCardConfirmed,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.border,
              borderRadius: radii.md,
              padding: spacing.md,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Emergency screening completed: Not an emergency. Tap to change."
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
            <AppIcon name="checkCircle" size={20} color="primary" />
            <View style={{ flex: 1 }}>
              <ThemedText variant="smallBold" color="text">
                Non-Emergency Confirmed
              </ThemedText>
              <ThemedText variant="caption" color="textMuted">
                Screened for severe chest pain, shortness of breath, & life-threatening symptoms
              </ThemedText>
            </View>
          </View>
          <ThemedText variant="captionBold" color="primary">
            Change
          </ThemedText>
        </Pressable>
      ) : (
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
                label="Call 911"
                accessibilityLabel="Call 911 Emergency Now"
                variant="danger"
                size="lg"
                icon="phone"
                fullWidth
                onPress={handleCallEmergency}
              />
              <Button
                label="Change Answer"
                accessibilityLabel="Retract Emergency Answer"
                variant="outline"
                size="md"
                fullWidth
                onPress={() => {
                  setEmergencyBlocked(false);
                  setEmergencyAcknowledged(null);
                }}
              />
            </View>
          ) : (
            <View style={[styles.gateButtonGroup, { gap: spacing.sm }]}>
              <Button
                label="No Emergency"
                accessibilityLabel="No, this is not an emergency"
                variant="primary"
                size="md"
                fullWidth
                style={styles.flex}
                onPress={() => handleEmergencyAnswer(false)}
              />
              <Button
                label="Emergency"
                accessibilityLabel="Yes, I need emergency care"
                variant="outline"
                size="md"
                fullWidth
                style={styles.flex}
                onPress={() => handleEmergencyAnswer(true)}
              />
            </View>
          )}
        </Card>
      )}

      {/* When not emergency blocked, show form */}
      {!emergencyBlocked && (
        <View style={{ gap: spacing.md }}>
          {/* Step 2: Routing (Proxying + Destination Facility + Category) */}
          <Card padding="md" style={{ gap: spacing.md }}>
            {dependentOptions.length > 1 && (
              <View style={{ gap: spacing.xs }}>
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
                  contentContainerStyle={{ paddingRight: spacing.sm }}
                />
              </View>
            )}

            <View style={{ gap: spacing.xs }}>
              <ThemedText variant="captionBold" color="textMuted">
                DESTINATION FACILITY
              </ThemedText>

              {isLoadingGrants ? (
                <ThemedText variant="small" color="textMuted">
                  Loading connected healthcare facilities...
                </ThemedText>
              ) : grantsError ? (
                <View
                  style={[
                    styles.grantNoticeCard,
                    {
                      backgroundColor: colors.warningBg,
                      borderColor: colors.warningBorder,
                      borderRadius: radii.md,
                      padding: spacing.md,
                      gap: spacing.xs,
                    },
                  ]}
                >
                  <View style={styles.grantNoticeHeader}>
                    <AppIcon name="warning" size={18} color="warning" />
                    <ThemedText variant="bodyBold" color="warningText">
                      Unable to Load Connected Facilities
                    </ThemedText>
                  </View>
                  <ThemedText variant="small" color="warningText">
                    {grantsError}
                  </ThemedText>
                  <View style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}>
                    <Button
                      label="Retry"
                      variant="outline"
                      size="sm"
                      icon="refresh"
                      onPress={loadGrants}
                    />
                  </View>
                </View>
              ) : eligibleGrants.length === 0 ? (
                <View
                  style={[
                    styles.grantNoticeCard,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.border,
                      borderRadius: radii.md,
                      padding: spacing.md,
                      gap: spacing.xs,
                    },
                  ]}
                >
                  <View style={styles.grantNoticeHeader}>
                    <AppIcon name="alert" size={18} color="warning" />
                    <ThemedText variant="bodyBold" color="text">
                      No Connected Facility Found
                    </ThemedText>
                  </View>
                  <ThemedText variant="small" color="textMuted">
                    You do not currently have an active communication eligibility grant with any clinic, pharmacy, or laboratory. Once a connected facility enables messaging for your care, it will appear here.
                  </ThemedText>
                </View>
              ) : (
                <FilterChipBar
                  items={eligibleGrants.map((g) => ({
                    key: g.grantId,
                    label: `${g.facilityName} (${g.facilityType})`,
                  }))}
                  selectedKey={activeGrant?.grantId ?? ''}
                  onSelect={(id) => setSelectedGrantId(id)}
                  contentContainerStyle={{ paddingRight: spacing.sm }}
                />
              )}
            </View>

            <View style={{ gap: spacing.xs }}>
              <ThemedText variant="captionBold" color="textMuted">
                INQUIRY CATEGORY
              </ThemedText>
              <FilterChipBar
                items={INQUIRY_CATEGORIES.map((c) => ({
                  key: c.id,
                  label: c.label,
                }))}
                selectedKey={category}
                onSelect={(id) => setCategory(id as MessageCategory)}
                contentContainerStyle={{ paddingRight: spacing.sm }}
              />
            </View>
          </Card>

          {/* Step 3: Subject & Message Body */}
          <Card padding="md" style={{ gap: spacing.md }}>
            <Input
              label="Subject / Topic (Optional)"
              placeholder="e.g. Follow-up regarding blood test results"
              value={subject}
              onChangeText={setSubject}
              maxLength={MAX_SUBJECT_LENGTH}
            />

            <Input
              label="Message Details *"
              placeholder="Describe your symptoms, question, or inquiry clearly..."
              value={messageText}
              onChangeText={setMessageText}
              multiline
              numberOfLines={5}
              maxLength={MAX_MESSAGE_LENGTH}
            />

            <View style={styles.charCountRow}>
              <ThemedText variant="caption" color="textMuted">
                {messageText.length} / {MAX_MESSAGE_LENGTH} characters
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
              label={isUploadingFile ? 'Uploading...' : 'Attach File'}
              variant="outline"
              size="md"
              icon="upload"
              fullWidth
              disabled={isUploadingFile}
              onPress={handlePickDocument}
            />
            <ThemedText variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
              Supported: JPG, PNG, PDF (up to 15 MB)
            </ThemedText>
          </Card>

          {/* Submit Action */}
          <Button
            label={isSubmitting ? 'Sending...' : 'Send Message'}
            variant="primary"
            size="lg"
            icon="check"
            fullWidth
            disabled={
              isSubmitting ||
              isLoadingGrants ||
              emergencyAcknowledged !== false ||
              !activeGrant ||
              !messageText.trim()
            }
            onPress={handleSubmit}
          />
        </View>
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
  gateCardConfirmed: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grantNoticeCard: {
    borderWidth: 1,
  },
  grantNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
