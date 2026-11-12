import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { Modal, ThemedText, Input, Button, Icon, Badge } from '@ui';
import { theme } from '@constants/theme';
import { useStaff } from '../../context/StaffContext';
import { useClinic } from '../../context/ClinicContext';
import {
  clinicService,
  type ClinicPatient,
  type MedicalCertificateRecord,
} from '../../services/clinicService';
import { openDocument } from '../../services/documentOpener';
import { notify } from '../../utils/feedback';

export type FitnessStatus =
  | 'FitToWork'
  | 'UnfitToWork'
  | 'FitToSchool'
  | 'UnfitToSchool'
  | 'LightDuty';

export interface IssueMedicalCertificateModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  queueItemId?: string | null;
  allowDuplicateActive?: boolean;
  onSuccess?: (cert: MedicalCertificateRecord) => void;
}

const FITNESS_OPTIONS: Array<{ key: FitnessStatus; label: string }> = [
  { key: 'FitToWork', label: 'Fit to Work' },
  { key: 'UnfitToWork', label: 'Unfit to Work' },
  { key: 'FitToSchool', label: 'Fit to School' },
  { key: 'UnfitToSchool', label: 'Unfit to School' },
  { key: 'LightDuty', label: 'Light Duty' },
];

export default function IssueMedicalCertificateModal({
  visible,
  onClose,
  patient,
  queueItemId,
  allowDuplicateActive = false,
  onSuccess,
}: IssueMedicalCertificateModalProps) {
  const { current: currentStaff, currentName, staff: staffList } = useStaff();
  const { settings } = useClinic();

  const doctors = useMemo(() => {
    return (staffList || []).filter((s) => s.role === 'Doctor' && s.status === 'Active');
  }, [staffList]);

  const defaultDoctor = useMemo(() => {
    if (currentStaff?.role === 'Doctor') return currentStaff;
    return doctors.length > 0 ? doctors[0] : null;
  }, [currentStaff, doctors]);

  const [doctorId, setDoctorId] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [prcLicense, setPrcLicense] = useState<string>('');
  const [ptrNumber, setPtrNumber] = useState<string>('');
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [clinicalFindings, setClinicalFindings] = useState<string>('');
  const [fitnessStatus, setFitnessStatus] = useState<FitnessStatus>('FitToWork');
  const [restDays, setRestDays] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('General Medical Clearance');
  const [remarks, setRemarks] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (visible && defaultDoctor) {
      setDoctorId(defaultDoctor.id);
      const name = defaultDoctor.title
        ? `${defaultDoctor.title} ${defaultDoctor.firstName} ${defaultDoctor.lastName}`.trim()
        : `Dr. ${defaultDoctor.firstName} ${defaultDoctor.lastName}`.trim();
      setDoctorName(name);
      setPrcLicense(defaultDoctor.prcLicenseNumber || '');
      setPtrNumber(defaultDoctor.ptrNumber || '');
    } else if (visible && !defaultDoctor && currentStaff) {
      setDoctorId(currentStaff.id);
      setDoctorName(currentName);
      setPrcLicense(currentStaff.prcLicenseNumber || '');
      setPtrNumber(currentStaff.ptrNumber || '');
    }
    if (visible) {
      setDiagnosis('');
      setClinicalFindings('');
      setFitnessStatus('FitToWork');
      setRestDays('');
      setPurpose('General Medical Clearance');
      setRemarks('');
    }
  }, [visible, defaultDoctor, currentStaff, currentName]);

  const handleSelectDoctor = (doc: typeof defaultDoctor) => {
    if (!doc) return;
    setDoctorId(doc.id);
    const name = doc.title
      ? `${doc.title} ${doc.firstName} ${doc.lastName}`.trim()
      : `Dr. ${doc.firstName} ${doc.lastName}`.trim();
    setDoctorName(name);
    setPrcLicense(doc.prcLicenseNumber || '');
    setPtrNumber(doc.ptrNumber || '');
  };

  const handleSubmit = async () => {
    if (!patient) return;
    if (!diagnosis.trim()) {
      notify.error('Diagnosis is required to issue a medical certificate.');
      return;
    }
    if (!prcLicense.trim()) {
      notify.error('PRC License Number is required to issue a medical certificate.');
      return;
    }

    setSubmitting(true);
    try {
      let effectiveQueueItemId = queueItemId;

      if (!effectiveQueueItemId) {
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

      const parsedRestDays = parseInt(restDays, 10);
      const [cert, certErr] = await clinicService.issueMedicalCertificate({
        patientId: patient.id,
        patientName: patient.fullName,
        consultationId: undefined,
        queueItemId: effectiveQueueItemId || undefined,
        doctorId: doctorId || currentStaff?.id || '',
        doctorName: doctorName || currentName || 'Attending Physician',
        prcLicenseNumber: prcLicense.trim(),
        ptrNumber: ptrNumber.trim() || undefined,
        diagnosis: diagnosis.trim(),
        clinicalFindings: clinicalFindings.trim() || undefined,
        fitnessStatus,
        recommendedRestDays: isNaN(parsedRestDays) ? undefined : parsedRestDays,
        purpose: purpose.trim() || undefined,
        remarks: remarks.trim() || undefined,
      });

      if (certErr || !cert) {
        throw certErr || new Error('Failed to issue medical certificate.');
      }

      notify.success(`Medical certificate issued successfully (${cert.certificateNumber || ''})`);
      onSuccess?.(cert);

      const pdfUrl = clinicService.getMedicalCertificatePdfUrl(cert.id);
      openDocument(pdfUrl).catch(() => {});

      onClose();
    } catch (e: any) {
      notify.error(e?.message || 'Could not issue certificate.');
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
        testID="med-cert-cancel-btn"
      />
      <Button
        title="Issue Certificate"
        variant="primary"
        icon="check"
        onPress={handleSubmit}
        loading={submitting}
        testID="med-cert-submit-btn"
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Issue Medical Certificate"
      subtitle={patient ? patient.fullName : undefined}
      maxWidth={600}
      footer={footer}
      testID="issue-medical-certificate-modal"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Physician section */}
        <View style={styles.section}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Attending Physician
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

          <View style={styles.formRow}>
            <View style={styles.flex1}>
              <Input
                label="Physician Name *"
                value={doctorName}
                onChangeText={setDoctorName}
                placeholder="Dr. Full Name"
              />
            </View>
            <View style={styles.flex1}>
              <Input
                label="PRC License Number *"
                value={prcLicense}
                onChangeText={setPrcLicense}
                placeholder="e.g. 0123456"
              />
            </View>
          </View>
          <Input
            label="PTR Number (Optional)"
            value={ptrNumber}
            onChangeText={setPtrNumber}
            placeholder="e.g. PTR-2026-001"
          />
        </View>

        {/* Diagnosis & Findings */}
        <View style={styles.section}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Clinical Evaluation
          </ThemedText>
          <Input
            label="Diagnosis / Medical Impression *"
            value={diagnosis}
            onChangeText={setDiagnosis}
            placeholder="e.g. Acute Upper Respiratory Tract Infection (J06.9)"
            multiline
            numberOfLines={2}
          />
          <Input
            label="Clinical Findings / Pertinent Signs"
            value={clinicalFindings}
            onChangeText={setClinicalFindings}
            placeholder="Pertinent physical exam findings, vital signs, or observations"
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Fitness & Recommendations */}
        <View style={styles.section}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Fitness Status & Recommendations
          </ThemedText>
          <View style={styles.fitnessPillsRow}>
            {FITNESS_OPTIONS.map((opt) => {
              const isSelected = fitnessStatus === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setFitnessStatus(opt.key)}
                  style={[styles.fitnessPill, isSelected && styles.fitnessPillSelected]}
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

          <View style={styles.formRow}>
            <View style={styles.flex1}>
              <Input
                label="Recommended Rest Days"
                value={restDays}
                onChangeText={setRestDays}
                placeholder="e.g. 3"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.flex1}>
              <Input
                label="Purpose of Certificate"
                value={purpose}
                onChangeText={setPurpose}
                placeholder="Employment, School, Legal, etc."
              />
            </View>
          </View>

          <Input
            label="Special Remarks / Work Restrictions"
            value={remarks}
            onChangeText={setRemarks}
            placeholder="e.g. Avoid heavy lifting for 7 days; follow-up if symptoms persist"
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
  fitnessPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  fitnessPill: {
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  fitnessPillSelected: {
    backgroundColor: theme.colors.primaryLighter,
    borderColor: theme.colors.primaryBorder,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});
