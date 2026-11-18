import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Modal, ThemedText, Input, Button, Badge } from '@ui';
import { theme } from '@constants/theme';
import { useStaff } from '../../context/StaffContext';
import {
  clinicService,
  type ClinicPatient,
  type ReferralLetterRecord,
} from '../../services/clinicService';
import { openDocument } from '../../services/documentOpener';
import { notify } from '../../utils/feedback';

export type ReferralUrgency = 'Routine' | 'Urgent' | 'Emergency';

export interface IssueReferralLetterModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  queueItemId?: string | null;
  consultationId?: string;
  allowDuplicateActive?: boolean;
  onSuccess?: (letter: ReferralLetterRecord) => void;
}

const URGENCY_OPTIONS: Array<{ key: ReferralUrgency; label: string; variant: 'neutral' | 'warning' | 'emergency' }> = [
  { key: 'Routine', label: 'Routine', variant: 'neutral' },
  { key: 'Urgent', label: 'Urgent', variant: 'warning' },
  { key: 'Emergency', label: 'Emergency (STAT)', variant: 'emergency' },
];

export default function IssueReferralLetterModal({
  visible,
  onClose,
  patient,
  queueItemId,
  consultationId,
  allowDuplicateActive = false,
  onSuccess,
}: IssueReferralLetterModalProps) {
  const { current: currentStaff, currentName, staff: staffList } = useStaff();

  const doctors = useMemo(() => {
    return (staffList || []).filter((s) => s.role === 'Doctor' && s.status === 'Active');
  }, [staffList]);

  const defaultDoctor = useMemo(() => {
    if (currentStaff?.role === 'Doctor') return currentStaff;
    return doctors.length > 0 ? doctors[0] : null;
  }, [currentStaff, doctors]);

  const [doctorId, setDoctorId] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [receivingFacility, setReceivingFacility] = useState<string>('');
  const [referredDepartment, setReferredDepartment] = useState<string>('');
  const [referredToDoctor, setReferredToDoctor] = useState<string>('');
  const [urgency, setUrgency] = useState<ReferralUrgency>('Routine');
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState<string>('');
  const [reasonForReferral, setReasonForReferral] = useState<string>('');
  const [clinicalSummary, setClinicalSummary] = useState<string>('');
  const [currentMedications, setCurrentMedications] = useState<string>('');
  const [attachedDiagnostics, setAttachedDiagnostics] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (visible && defaultDoctor) {
      setDoctorId(defaultDoctor.id);
      const name = defaultDoctor.title
        ? `${defaultDoctor.title} ${defaultDoctor.firstName} ${defaultDoctor.lastName}`.trim()
        : `Dr. ${defaultDoctor.firstName} ${defaultDoctor.lastName}`.trim();
      setDoctorName(name);
    } else if (visible && !defaultDoctor && currentStaff) {
      setDoctorId(currentStaff.id);
      setDoctorName(currentName);
    }
    if (visible) {
      setReceivingFacility('');
      setReferredDepartment('');
      setReferredToDoctor('');
      setUrgency('Routine');
      setProvisionalDiagnosis('');
      setReasonForReferral('');
      setClinicalSummary('');
      setCurrentMedications('');
      setAttachedDiagnostics('');
    }
  }, [visible, defaultDoctor, currentStaff, currentName]);

  const handleSelectDoctor = (doc: typeof defaultDoctor) => {
    if (!doc) return;
    setDoctorId(doc.id);
    const name = doc.title
      ? `${doc.title} ${doc.firstName} ${doc.lastName}`.trim()
      : `Dr. ${doc.firstName} ${doc.lastName}`.trim();
    setDoctorName(name);
  };

  const handleSubmit = async () => {
    if (!patient) return;
    if (!receivingFacility.trim()) {
      notify.error('Receiving facility is required.');
      return;
    }
    if (!referredDepartment.trim()) {
      notify.error('Department or specialty is required.');
      return;
    }
    if (!reasonForReferral.trim()) {
      notify.error('Reason for referral is required.');
      return;
    }
    if (!provisionalDiagnosis.trim()) {
      notify.error('Provisional diagnosis is required.');
      return;
    }
    if (!clinicalSummary.trim()) {
      notify.error('Clinical summary is required.');
      return;
    }

    setSubmitting(true);
    try {
      let effectiveQueueItemId = queueItemId;

      if (!effectiveQueueItemId && !consultationId) {
        const [directVisit, visitErr] = await clinicService.ensureDirectVisit({
          patientId: patient.id,
          patientName: patient.fullName,
          doctorId: doctorId || undefined,
          doctorName: doctorName || undefined,
          visitType: 'AdministrativeDocument',
          initialStatus: 'Completed',
          allowDuplicateActive,
        });
        if (visitErr || !directVisit) {
          throw visitErr || new Error('Failed to materialize direct visit record.');
        }
        effectiveQueueItemId = directVisit.id;
      }

      const [letter, letterErr] = await clinicService.issueReferralLetter({
        patientId: patient.id,
        patientName: patient.fullName,
        consultationId: consultationId || undefined,
        referringDoctorId: doctorId || currentStaff?.id || '',
        referringDoctorName: doctorName || currentName || 'Referring Physician',
        referredToDoctor: referredToDoctor.trim() || undefined,
        referredToFacility: receivingFacility.trim(),
        referredDepartment: referredDepartment.trim(),
        urgency,
        reasonForReferral: reasonForReferral.trim(),
        provisionalDiagnosis: provisionalDiagnosis.trim(),
        clinicalSummary: clinicalSummary.trim(),
        currentMedications: currentMedications.trim() || undefined,
        attachedDiagnostics: attachedDiagnostics.trim() || undefined,
      });

      if (letterErr || !letter) {
        throw letterErr || new Error('Failed to issue referral letter.');
      }

      notify.success(`Referral letter issued successfully (${letter.referralNumber || ''})`);
      onSuccess?.(letter);

      const pdfUrl = clinicService.getReferralLetterPdfUrl(letter.id);
      openDocument(pdfUrl).catch(() => {});

      onClose();
    } catch (e: any) {
      notify.error(e?.message || 'Could not issue referral letter.');
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <View style={styles.footerRow}>
      <Button
        title="Cancel"
        variant="ghost"
        onPress={onClose}
        disabled={submitting}
        testID="referral-cancel-btn"
      />
      <Button
        title="Issue Referral Letter"
        variant="primary"
        icon="check"
        onPress={handleSubmit}
        loading={submitting}
        testID="referral-submit-btn"
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Issue Referral Letter"
      subtitle={patient ? patient.fullName : undefined}
      maxWidth={640}
      footer={footer}
      testID="issue-referral-letter-modal"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Referring Physician section */}
        <View style={styles.section}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Referring Physician
          </ThemedText>
          {doctors.length > 1 && (
            <View style={styles.doctorChipsRow}>
              {doctors.map((d) => {
                const isSelected = d.id === doctorId;
                const dName = d.lastName ? `Dr. ${d.lastName}` : d.firstName;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => handleSelectDoctor(d)}
                    style={[styles.doctorChip, isSelected && styles.doctorChipSelected]}
                  >
                    <ThemedText
                      variant="captionBold"
                      color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                    >
                      {dName}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Input
            label="Physician Name *"
            value={doctorName}
            onChangeText={setDoctorName}
            placeholder="Dr. Full Name"
          />
        </View>

        {/* Destination Facility & Department */}
        <View style={styles.section}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Receiving Facility & Department
          </ThemedText>
          <View style={styles.formRow}>
            <View style={styles.flex1}>
              <Input
                label="Receiving Facility *"
                value={receivingFacility}
                onChangeText={setReceivingFacility}
                placeholder="e.g. Philippine General Hospital"
                testID="referral-receiving-facility-input"
              />
            </View>
            <View style={styles.flex1}>
              <Input
                label="Department / Specialty *"
                value={referredDepartment}
                onChangeText={setReferredDepartment}
                placeholder="e.g. Cardiology, Pulmonology"
                testID="referral-department-input"
              />
            </View>
          </View>
          <Input
            label="Attending Doctor / Specialist (Optional)"
            value={referredToDoctor}
            onChangeText={setReferredToDoctor}
            placeholder="e.g. Dr. Juan dela Cruz (Attending)"
          />
        </View>

        {/* Urgency */}
        <View style={styles.section}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Clinical Urgency
          </ThemedText>
          <View style={styles.urgencyPillsRow}>
            {URGENCY_OPTIONS.map((opt) => {
              const isSelected = urgency === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setUrgency(opt.key)}
                  style={[styles.urgencyPill, isSelected && styles.urgencyPillSelected]}
                  testID={`referral-urgency-${opt.key.toLowerCase()}`}
                >
                  <ThemedText
                    variant="captionBold"
                    color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                  >
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Clinical Assessment & Reason */}
        <View style={styles.section}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Clinical Evaluation & Reason
          </ThemedText>
          <Input
            label="Provisional Diagnosis / Assessment *"
            value={provisionalDiagnosis}
            onChangeText={setProvisionalDiagnosis}
            placeholder="e.g. Acute Coronary Syndrome, Unstable Angina"
            multiline
            numberOfLines={2}
            testID="referral-diagnosis-input"
          />
          <Input
            label="Reason for Referral *"
            value={reasonForReferral}
            onChangeText={setReasonForReferral}
            placeholder="e.g. Higher-level cardiac care and urgent coronary angiogram"
            multiline
            numberOfLines={2}
            testID="referral-reason-input"
          />
          <Input
            label="Clinical Summary / Findings *"
            value={clinicalSummary}
            onChangeText={setClinicalSummary}
            placeholder="Summary of presentation, physical exam, and initial interventions"
            multiline
            numberOfLines={3}
            testID="referral-summary-input"
          />
        </View>

        {/* Additional Clinical Context */}
        <View style={styles.section}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Additional Medical Context (Optional)
          </ThemedText>
          <Input
            label="Current Medications & Dosages"
            value={currentMedications}
            onChangeText={setCurrentMedications}
            placeholder="e.g. Aspirin 80mg OD, Clopidogrel 75mg OD, Atorvastatin 40mg HS"
            multiline
            numberOfLines={2}
          />
          <Input
            label="Attached Diagnostics / Pertinent Lab Results"
            value={attachedDiagnostics}
            onChangeText={setAttachedDiagnostics}
            placeholder="e.g. 12-lead ECG: ST elevation in V1-V4; Trop-I: Positive (0.85 ng/mL)"
            multiline
            numberOfLines={2}
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  section: {
    gap: theme.spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  doctorChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  doctorChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  doctorChipSelected: {
    backgroundColor: theme.colors.primaryLighter,
    borderColor: theme.colors.primaryBorder,
  },
  urgencyPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  urgencyPill: {
    paddingHorizontal: theme.spacing.sm + 4,
    paddingVertical: 7,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  urgencyPillSelected: {
    backgroundColor: theme.colors.primaryLighter,
    borderColor: theme.colors.primaryBorder,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});
