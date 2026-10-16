import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert, Pressable, ScrollView } from 'react-native';
import {
  Modal,
  ThemedText,
  Button,
  Input,
  Icon,
  Badge,
  SegmentedControl,
} from '../ui';
import { theme } from '../../constants/theme';
import {
  clinicService,
  type RecordTriageRequest,
  type TriageVitals,
  type ClinicPatient,
  type PediatricZScoreResult,
} from '../../services/clinicService';
import { notify } from '../../utils/feedback';

export type MeasurementPosture = 'STANDING' | 'RECUMBENT';

export interface RecordVitalsModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  queueItemId?: string | null;
  currentStaffId?: string;
  currentStaffName?: string;
  existingVitals?: TriageVitals | null;
  onSuccess: (vitals: TriageVitals) => void;
}

interface VitalsFormState {
  bpSys: string;
  bpDia: string;
  hr: string;
  rr: string;
  temp: string;
  spo2: string;
  pain: string;
  height: string;
  weight: string;
  headCircumference: string;
  midUpperArmCircumference: string;
  visualAcuityLeft: string;
  visualAcuityRight: string;
  notes: string;
  posture: MeasurementPosture;
  preAssessmentNotes: string;
  preAssessmentRemarks: string;
  triagePriority: 'Routine' | 'Urgent' | 'Emergency';
}

const EMPTY_VITALS_FORM: VitalsFormState = {
  bpSys: '',
  bpDia: '',
  hr: '',
  rr: '',
  temp: '',
  spo2: '',
  pain: '',
  height: '',
  weight: '',
  headCircumference: '',
  midUpperArmCircumference: '',
  visualAcuityLeft: '',
  visualAcuityRight: '',
  notes: '',
  posture: 'STANDING',
  preAssessmentNotes: '',
  preAssessmentRemarks: '',
  triagePriority: 'Routine',
};

const parseOptionalInt = (val: string): number | undefined => {
  const parsed = parseInt(val.trim(), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseOptionalFloat = (val: string): number | undefined => {
  const parsed = parseFloat(val.trim());
  return Number.isNaN(parsed) ? undefined : parsed;
};

export default function RecordVitalsModal({
  visible,
  onClose,
  patient,
  queueItemId,
  currentStaffId,
  currentStaffName,
  existingVitals,
  onSuccess,
}: RecordVitalsModalProps) {
  const [form, setForm] = useState<VitalsFormState>(EMPTY_VITALS_FORM);
  const [saving, setSaving] = useState(false);
  const [zScorePreview, setZScorePreview] = useState<PediatricZScoreResult | null>(null);

  const isPediatric = useMemo(() => {
    return patient ? patient.age < 19 : false;
  }, [patient]);

  // Pre-fill form when modal opens
  useEffect(() => {
    if (visible) {
      if (existingVitals) {
        setForm({
          bpSys: existingVitals.systolicBp != null ? String(existingVitals.systolicBp) : '',
          bpDia: existingVitals.diastolicBp != null ? String(existingVitals.diastolicBp) : '',
          hr: existingVitals.heartRateBpm != null ? String(existingVitals.heartRateBpm) : '',
          rr: existingVitals.respiratoryRateBreathsPerMin != null ? String(existingVitals.respiratoryRateBreathsPerMin) : '',
          temp: existingVitals.temperatureCelsius != null ? String(existingVitals.temperatureCelsius) : '',
          spo2: existingVitals.oxygenSaturationPercent != null ? String(existingVitals.oxygenSaturationPercent) : '',
          pain: existingVitals.painScore != null ? String(existingVitals.painScore) : '',
          height: existingVitals.heightCm != null ? String(existingVitals.heightCm) : '',
          weight: existingVitals.weightKg != null ? String(existingVitals.weightKg) : '',
          headCircumference: existingVitals.headCircumferenceCm != null ? String(existingVitals.headCircumferenceCm) : '',
          midUpperArmCircumference: existingVitals.midUpperArmCircumferenceCm != null ? String(existingVitals.midUpperArmCircumferenceCm) : '',
          visualAcuityLeft: existingVitals.visualAcuityLeft || '',
          visualAcuityRight: existingVitals.visualAcuityRight || '',
          notes: existingVitals.notes || '',
          posture: existingVitals.isMeasuredRecumbent ? 'RECUMBENT' : 'STANDING',
          preAssessmentNotes: existingVitals.preAssessmentNotes || '',
          preAssessmentRemarks: existingVitals.preAssessmentRemarks || '',
          triagePriority: (existingVitals.triageAcuityReason as any) || 'Routine',
        });
      } else {
        setForm(EMPTY_VITALS_FORM);
      }
      setZScorePreview(null);
    }
  }, [visible, existingVitals]);

  // Live BMI calculation
  const calculatedBmi = useMemo(() => {
    const h = parseOptionalFloat(form.height);
    const w = parseOptionalFloat(form.weight);
    if (h && w && h > 0) {
      const heightM = h / 100;
      return Math.round((w / (heightM * heightM)) * 10) / 10;
    }
    return undefined;
  }, [form.height, form.weight]);

  const bmiCategory = useMemo(() => {
    if (!calculatedBmi) return null;
    if (calculatedBmi < 18.5) return { label: 'Underweight', variant: 'warning' as const };
    if (calculatedBmi < 25.0) return { label: 'Normal weight', variant: 'success' as const };
    if (calculatedBmi < 30.0) return { label: 'Overweight', variant: 'warning' as const };
    return { label: 'Obese', variant: 'emergency' as const };
  }, [calculatedBmi]);

  // Debounced Z-score preview for pediatric patients
  useEffect(() => {
    if (!isPediatric || !patient?.dateOfBirth) return;
    const h = parseOptionalFloat(form.height);
    const w = parseOptionalFloat(form.weight);
    if (!h && !w) {
      setZScorePreview(null);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      const [res] = await clinicService.calculatePediatricZScore({
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender === 'Female' || patient.gender === 'F' ? 'Female' : 'Male',
        weightKg: w ?? 0,
        lengthOrHeightCm: h ?? 0,
        isMeasuredRecumbent: form.posture === 'RECUMBENT',
      });
      if (active) {
        setZScorePreview(res ?? null);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.height, form.weight, form.posture, patient, isPediatric]);

  const updateField = (key: keyof VitalsFormState, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    if (!queueItemId) {
      Alert.alert('Cannot record vitals', 'Active queue item ID is missing for this consultation.');
      return;
    }

    const systolicBp = parseOptionalInt(form.bpSys);
    const diastolicBp = parseOptionalInt(form.bpDia);
    const heartRateBpm = parseOptionalInt(form.hr);
    const respiratoryRateBreathsPerMin = parseOptionalInt(form.rr);
    const temperatureCelsius = parseOptionalFloat(form.temp);
    const oxygenSaturationPercent = parseOptionalInt(form.spo2);
    const heightCm = parseOptionalFloat(form.height);
    const weightKg = parseOptionalFloat(form.weight);
    const painScore = parseOptionalInt(form.pain);
    const visualAcuityLeft = form.visualAcuityLeft.trim() || undefined;
    const visualAcuityRight = form.visualAcuityRight.trim() || undefined;
    const headCircumferenceCm = parseOptionalFloat(form.headCircumference);
    const midUpperArmCircumferenceCm = parseOptionalFloat(form.midUpperArmCircumference);

    const hasAnyVital = [
      systolicBp,
      diastolicBp,
      heartRateBpm,
      respiratoryRateBreathsPerMin,
      temperatureCelsius,
      oxygenSaturationPercent,
      heightCm,
      weightKg,
      painScore,
      headCircumferenceCm,
      midUpperArmCircumferenceCm,
    ].some((v) => v !== undefined) || !!visualAcuityLeft || !!visualAcuityRight;

    if (!hasAnyVital) {
      Alert.alert('No vitals entered', 'Enter at least one vital sign before saving.');
      return;
    }

    const payload: RecordTriageRequest = {
      nurseId: currentStaffId,
      recordedByNurseName: currentStaffName,
      systolicBp,
      diastolicBp,
      heartRateBpm,
      temperatureCelsius,
      respiratoryRateBreathsPerMin,
      oxygenSaturationPercent,
      heightCm,
      weightKg,
      painScore,
      notes: form.notes.trim() || undefined,
      visualAcuityLeft,
      visualAcuityRight,
      headCircumferenceCm,
      midUpperArmCircumferenceCm,
      isMeasuredRecumbent: form.posture === 'RECUMBENT',
      zScoreWeightForAge: zScorePreview?.weightForAgeZScore,
      zScoreLengthForAge: zScorePreview?.heightForAgeZScore,
      zScoreWeightForLength: zScorePreview?.weightForHeightZScore,
      philHealthZScoreCategory: zScorePreview?.philHealthZScoreCategory,
      philHealthZScoreCode: zScorePreview?.philHealthZScoreCode,
      preAssessmentNotes: form.preAssessmentNotes.trim() || undefined,
      preAssessmentRemarks: form.preAssessmentRemarks.trim() || undefined,
      triageAcuityReason: form.triagePriority,
    };

    setSaving(true);
    const [savedVitals, err] = await clinicService.recordTriage(queueItemId, payload);
    setSaving(false);

    if (err || !savedVitals) {
      notify.error(err?.message || 'Could not save vitals.');
      return;
    }

    notify.success('Vitals recorded successfully.');
    onSuccess(savedVitals);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Record Vitals"
      subtitle={
        patient
          ? `${patient.fullName} (${patient.age}yo ${patient.gender}) • Code: ${patient.patientCode || 'PAT'}`
          : 'Consultation triage vitals'
      }
      maxWidth={600}
      footer={
        <View style={styles.modalFooter}>
          <Button
            title="Cancel"
            variant="outline"
            onPress={onClose}
            disabled={saving}
          />
          <Button
            title="Save vitals"
            variant="primary"
            icon="check"
            onPress={handleSave}
            loading={saving}
          />
        </View>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Section 1: Standard Vital Signs */}
        <View style={styles.sectionHeader}>
          <Icon name="heartPulse" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Standard Vital Signs
          </ThemedText>
        </View>

        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Systolic BP (mmHg)"
              placeholder="e.g. 120"
              value={form.bpSys}
              onChangeText={(txt) => updateField('bpSys', txt)}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Diastolic BP (mmHg)"
              placeholder="e.g. 80"
              value={form.bpDia}
              onChangeText={(txt) => updateField('bpDia', txt)}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Heart rate (bpm)"
              placeholder="e.g. 72"
              value={form.hr}
              onChangeText={(txt) => updateField('hr', txt)}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Respiratory rate (/min)"
              placeholder="e.g. 18"
              value={form.rr}
              onChangeText={(txt) => updateField('rr', txt)}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Temperature (°C)"
              placeholder="e.g. 36.5"
              value={form.temp}
              onChangeText={(txt) => updateField('temp', txt)}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Oxygen Saturation (%)"
              placeholder="e.g. 98"
              value={form.spo2}
              onChangeText={(txt) => updateField('spo2', txt)}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Pain score (0–10)"
              placeholder="0 = None, 10 = Severe"
              value={form.pain}
              onChangeText={(txt) => updateField('pain', txt)}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Section 2: Anthropometrics & BMI */}
        <View style={styles.sectionHeader}>
          <Icon name="activity" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Anthropometrics &amp; BMI
          </ThemedText>
          {calculatedBmi && bmiCategory ? (
            <Badge label={`BMI: ${calculatedBmi} (${bmiCategory.label})`} variant={bmiCategory.variant} size="sm" />
          ) : null}
        </View>

        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Height / Length (cm)"
              placeholder="e.g. 165"
              value={form.height}
              onChangeText={(txt) => updateField('height', txt)}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Weight (kg)"
              placeholder="e.g. 60.5"
              value={form.weight}
              onChangeText={(txt) => updateField('weight', txt)}
              keyboardType="decimal-pad"
            />
          </View>
          {isPediatric ? (
            <>
              <View style={styles.gridItem}>
                <Input
                  label="Head circumference (cm)"
                  placeholder="e.g. 42"
                  value={form.headCircumference}
                  onChangeText={(txt) => updateField('headCircumference', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="MUAC (cm)"
                  placeholder="e.g. 14.5"
                  value={form.midUpperArmCircumference}
                  onChangeText={(txt) => updateField('midUpperArmCircumference', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
            </>
          ) : null}
        </View>

        {isPediatric ? (
          <View style={styles.postureContainer}>
            <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: 4 }}>
              Measurement Posture (WHO standard)
            </ThemedText>
            <SegmentedControl<MeasurementPosture>
              value={form.posture}
              onChange={(val) => updateField('posture', val)}
              options={[
                { value: 'STANDING', label: 'Standing height' },
                { value: 'RECUMBENT', label: 'Recumbent length (lying)' },
              ]}
            />
          </View>
        ) : null}

        {/* Section 3: Visual Acuity & Clinical Notes */}
        <View style={styles.sectionHeader}>
          <Icon name="eye" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Visual Acuity &amp; Notes
          </ThemedText>
        </View>

        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Visual Acuity (Left)"
              placeholder="e.g. 20/20"
              value={form.visualAcuityLeft}
              onChangeText={(txt) => updateField('visualAcuityLeft', txt)}
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Visual Acuity (Right)"
              placeholder="e.g. 20/20"
              value={form.visualAcuityRight}
              onChangeText={(txt) => updateField('visualAcuityRight', txt)}
            />
          </View>
        </View>

        <View style={{ marginTop: theme.spacing.xs }}>
          <Input
            label="Examination &amp; Vitals Notes"
            placeholder="Clinical observations, postural changes, cuff size notes..."
            value={form.notes}
            onChangeText={(txt) => updateField('notes', txt)}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Section 4: Nursing Pre-Assessment & Acuity */}
        <View style={styles.sectionHeader}>
          <Icon name="consultations" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Nursing Pre-Assessment &amp; Acuity
          </ThemedText>
        </View>

        <View style={styles.prioritySection}>
          <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: 4 }}>
            Triage Acuity Priority
          </ThemedText>
          <SegmentedControl<'Routine' | 'Urgent' | 'Emergency'>
            value={form.triagePriority}
            onChange={(val) => updateField('triagePriority', val)}
            options={[
              { value: 'Routine', label: 'Routine' },
              { value: 'Urgent', label: 'Urgent' },
              { value: 'Emergency', label: 'STAT / Emergency' },
            ]}
          />
        </View>

        {/* Clinical Observation Quick Chips */}
        <View style={styles.chipsSection}>
          <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: 4 }}>
            Pre-assessment Observations (tap to add to remarks)
          </ThemedText>
          <View style={styles.chipsRow}>
            {[
              'Alert & Oriented',
              'Mild Distress',
              'Acute Dyspnea',
              'Severe Pain',
              'Wheelchair Bound',
              'Fall Risk',
              'Ambulatory with Assist',
            ].map((chip) => {
              const isActive = form.preAssessmentRemarks.includes(chip);
              return (
                <Pressable
                  key={chip}
                  onPress={() => {
                    if (isActive) {
                      const updated = form.preAssessmentRemarks
                        .split(' • ')
                        .filter((c) => c.trim() !== chip)
                        .join(' • ');
                      updateField('preAssessmentRemarks', updated);
                    } else {
                      const updated = form.preAssessmentRemarks.trim()
                        ? `${form.preAssessmentRemarks.trim()} • ${chip}`
                        : chip;
                      updateField('preAssessmentRemarks', updated);
                    }
                  }}
                  style={[
                    styles.observationChip,
                    isActive && styles.observationChipActive,
                  ]}
                >
                  <View style={styles.chipContent}>
                    {isActive ? (
                      <Icon name="check" size={12} color={theme.colors.primaryDark} />
                    ) : (
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        +
                      </ThemedText>
                    )}
                    <ThemedText
                      variant="caption"
                      color={isActive ? theme.colors.primaryDark : theme.colors.textSecondary}
                    >
                      {chip}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ marginTop: theme.spacing.xs }}>
          <Input
            label="Pre-assessment notes &amp; remarks (optional)"
            placeholder="e.g. Patient presents in mild respiratory distress, alert and oriented. Ambulatory with assist. Denies chest pain..."
            value={form.preAssessmentNotes}
            onChangeText={(txt) => updateField('preAssessmentNotes', txt)}
            multiline
            numberOfLines={3}
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  gridItem: {
    flex: 1,
    minWidth: 160,
  },
  postureContainer: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  prioritySection: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  chipsSection: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  observationChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  observationChipActive: {
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primaryLighter,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
