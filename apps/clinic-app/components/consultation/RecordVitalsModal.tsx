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
  bodyLength: string;
  headCircumference: string;
  midUpperArmCircumference: string;
  skinfoldThickness: string;
  limbsCircumference: string;
  waistCircumference: string;
  hipCircumference: string;
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
  bodyLength: '',
  headCircumference: '',
  midUpperArmCircumference: '',
  skinfoldThickness: '',
  limbsCircumference: '',
  waistCircumference: '',
  hipCircumference: '',
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

  // Demographic cohort resolution: age brackets and gender awareness
  const cohort = useMemo(() => {
    if (!patient) {
      return {
        ageMonths: 0,
        ageYears: 30,
        isInfant: false,
        isUnderFive: false,
        isPediatric: false,
        isAdult: true,
        isSenior: false,
        isFemale: false,
        label: 'Adult Patient',
        sublabel: 'Standard adult vitals & risk screening',
      };
    }

    const female = (patient.gender || '').toLowerCase().startsWith('f');
    let years = patient.age;
    let months = patient.age * 12;

    if (patient.dateOfBirth) {
      const dob = new Date(patient.dateOfBirth);
      const now = new Date();
      years = now.getFullYear() - dob.getFullYear();
      if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) {
        years--;
      }
      months = (now.getFullYear() - dob.getFullYear()) * 12 + now.getMonth() - dob.getMonth();
      if (now.getDate() < dob.getDate()) {
        months--;
      }
      if (months < 0) months = 0;
    }

    const isInfant = months <= 24;
    const isUnderFive = months <= 60;
    const isPediatric = years < 18;
    const isAdult = years >= 18;
    const isSenior = years >= 60;

    let label = 'Adult (18–59yo)';
    let sublabel = 'Standard adult vitals, BMI & central obesity screening';
    if (isInfant) {
      label = `Infant (${months} mo)`;
      sublabel = 'Recumbent length, MUAC & head circumference required';
    } else if (isUnderFive) {
      label = `Child Under 5 (${months} mo / ${years}yo)`;
      sublabel = 'WHO 2006 growth curves & standing/recumbent posture';
    } else if (isPediatric) {
      label = `Pediatric (${years}yo)`;
      sublabel = 'Standard pediatric triage';
    } else if (isSenior) {
      label = `Senior Citizen (${years}yo)`;
      sublabel = 'Geriatric vitals, central obesity & NCD risk screening';
    }

    return {
      ageMonths: months,
      ageYears: years,
      isInfant,
      isUnderFive,
      isPediatric,
      isAdult,
      isSenior,
      isFemale: female,
      label,
      sublabel,
    };
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
          bodyLength: existingVitals.bodyLengthCm != null
            ? String(existingVitals.bodyLengthCm)
            : (cohort.isInfant && existingVitals.heightCm != null ? String(existingVitals.heightCm) : ''),
          headCircumference: existingVitals.headCircumferenceCm != null ? String(existingVitals.headCircumferenceCm) : '',
          midUpperArmCircumference: existingVitals.midUpperArmCircumferenceCm != null ? String(existingVitals.midUpperArmCircumferenceCm) : '',
          skinfoldThickness: existingVitals.skinfoldThicknessMm != null ? String(existingVitals.skinfoldThicknessMm) : '',
          limbsCircumference: existingVitals.limbsCircumferenceCm != null ? String(existingVitals.limbsCircumferenceCm) : '',
          waistCircumference: existingVitals.waistCircumferenceCm != null ? String(existingVitals.waistCircumferenceCm) : '',
          hipCircumference: existingVitals.hipCircumferenceCm != null ? String(existingVitals.hipCircumferenceCm) : '',
          visualAcuityLeft: existingVitals.visualAcuityLeft || '',
          visualAcuityRight: existingVitals.visualAcuityRight || '',
          notes: existingVitals.notes || '',
          posture: existingVitals.isMeasuredRecumbent || cohort.isInfant ? 'RECUMBENT' : 'STANDING',
          preAssessmentNotes: existingVitals.preAssessmentNotes || '',
          preAssessmentRemarks: existingVitals.preAssessmentRemarks || '',
          triagePriority: (existingVitals.triageAcuityReason as any) || 'Routine',
        });
      } else {
        setForm({
          ...EMPTY_VITALS_FORM,
          posture: cohort.isInfant ? 'RECUMBENT' : 'STANDING',
        });
      }
      setZScorePreview(null);
    }
  }, [visible, existingVitals, cohort.isInfant]);

  // Live BMI calculation (for patients with standing height)
  const calculatedBmi = useMemo(() => {
    const effectiveHeight = cohort.isInfant
      ? parseOptionalFloat(form.bodyLength) || parseOptionalFloat(form.height)
      : parseOptionalFloat(form.height);
    const w = parseOptionalFloat(form.weight);
    if (effectiveHeight && w && effectiveHeight > 0) {
      const heightM = effectiveHeight / 100;
      return Math.round((w / (heightM * heightM)) * 10) / 10;
    }
    return undefined;
  }, [form.height, form.bodyLength, form.weight, cohort.isInfant]);

  const bmiCategory = useMemo(() => {
    if (!calculatedBmi) return null;
    if (calculatedBmi < 18.5) return { label: 'Underweight', variant: 'warning' as const };
    if (calculatedBmi < 25.0) return { label: 'Normal weight', variant: 'success' as const };
    if (calculatedBmi < 30.0) return { label: 'Overweight', variant: 'warning' as const };
    return { label: 'Obese', variant: 'emergency' as const };
  }, [calculatedBmi]);

  // Live Adult Sex-Differentiated Central Obesity & WHR Risk Evaluation
  const centralObesity = useMemo(() => {
    const waist = parseOptionalFloat(form.waistCircumference);
    const hip = parseOptionalFloat(form.hipCircumference);
    if (!waist || waist <= 0) return null;

    // Statutory Asian / Philippine cutoffs: Male >= 90 cm, Female >= 80 cm
    const cutoff = cohort.isFemale ? 80 : 90;
    const isObeseRisk = waist >= cutoff;

    let whr: number | undefined = undefined;
    let whrRisk = false;
    if (hip && hip > 0) {
      whr = Math.round((waist / hip) * 100) / 100;
      // WHR cutoffs: Male > 0.90, Female > 0.85
      whrRisk = cohort.isFemale ? whr > 0.85 : whr > 0.90;
    }

    return {
      waist,
      cutoff,
      isObeseRisk,
      whr,
      whrRisk,
      genderLabel: cohort.isFemale ? 'Female' : 'Male',
    };
  }, [form.waistCircumference, form.hipCircumference, cohort.isFemale]);

  // Debounced WHO Z-score calculation for children under 5 (0–60 months)
  useEffect(() => {
    if (!cohort.isUnderFive || !patient?.dateOfBirth) return;
    const effectiveLen = cohort.isInfant
      ? parseOptionalFloat(form.bodyLength) || parseOptionalFloat(form.height)
      : parseOptionalFloat(form.height);
    const w = parseOptionalFloat(form.weight);
    if (!effectiveLen && !w) {
      setZScorePreview(null);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      const isRecumbent = cohort.isInfant || form.posture === 'RECUMBENT';
      const [res] = await clinicService.calculatePediatricZScore({
        dateOfBirth: patient.dateOfBirth,
        gender: cohort.isFemale ? 'Female' : 'Male',
        weightKg: w ?? 0,
        lengthOrHeightCm: effectiveLen ?? 0,
        isMeasuredRecumbent: isRecumbent,
      });
      if (active) {
        setZScorePreview(res ?? null);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.height, form.bodyLength, form.weight, form.posture, patient, cohort.isUnderFive, cohort.isInfant, cohort.isFemale]);

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
    let heightCm = parseOptionalFloat(form.height);
    let bodyLengthCm = parseOptionalFloat(form.bodyLength);
    const weightKg = parseOptionalFloat(form.weight);
    const painScore = parseOptionalInt(form.pain);
    const headCircumferenceCm = parseOptionalFloat(form.headCircumference);
    const midUpperArmCircumferenceCm = parseOptionalFloat(form.midUpperArmCircumference);
    const skinfoldThicknessMm = parseOptionalFloat(form.skinfoldThickness);
    const limbsCircumferenceCm = parseOptionalFloat(form.limbsCircumference);
    const waistCircumferenceCm = parseOptionalFloat(form.waistCircumference);
    const hipCircumferenceCm = parseOptionalFloat(form.hipCircumference);
    const visualAcuityLeft = form.visualAcuityLeft.trim() || undefined;
    const visualAcuityRight = form.visualAcuityRight.trim() || undefined;

    // For infants, body length is primary recumbent measurement; sync to height if empty
    if (cohort.isInfant) {
      if (bodyLengthCm && !heightCm) heightCm = bodyLengthCm;
      if (heightCm && !bodyLengthCm) bodyLengthCm = heightCm;
    }

    const hasAnyVital = [
      systolicBp,
      diastolicBp,
      heartRateBpm,
      respiratoryRateBreathsPerMin,
      temperatureCelsius,
      oxygenSaturationPercent,
      heightCm,
      bodyLengthCm,
      weightKg,
      painScore,
      headCircumferenceCm,
      midUpperArmCircumferenceCm,
      skinfoldThicknessMm,
      limbsCircumferenceCm,
      waistCircumferenceCm,
      hipCircumferenceCm,
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
      bodyLengthCm,
      weightKg,
      painScore,
      notes: form.notes.trim() || undefined,
      visualAcuityLeft,
      visualAcuityRight,
      headCircumferenceCm,
      midUpperArmCircumferenceCm,
      skinfoldThicknessMm,
      limbsCircumferenceCm,
      waistCircumferenceCm,
      hipCircumferenceCm,
      isMeasuredRecumbent: cohort.isInfant || form.posture === 'RECUMBENT',
      zScoreWeightForAge: zScorePreview?.weightForAgeZScore,
      zScoreLengthForAge: zScorePreview?.heightForAgeZScore,
      zScoreWeightForLength: zScorePreview?.weightForHeightZScore,
      growthZScoreCategory: zScorePreview?.philHealthZScoreCategory,
      growthZScoreCode: zScorePreview?.philHealthZScoreCode,
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
      title="Record Vitals & Anthropometrics"
      subtitle={
        patient
          ? `${patient.fullName} (${patient.age}yo ${patient.gender}) • Code: ${patient.patientCode || 'PAT'}`
          : 'Consultation triage vitals'
      }
      maxWidth={640}
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
        {/* Demographic Cohort Banner */}
        <View style={styles.cohortBanner}>
          <View style={styles.cohortHeader}>
            <View style={styles.cohortPills}>
              <Badge
                label={cohort.label}
                variant={cohort.isInfant ? 'purple' : cohort.isUnderFive ? 'info' : 'primary'}
                size="sm"
              />
              <Badge
                label={cohort.isFemale ? 'Female' : 'Male'}
                variant="neutral"
                size="sm"
              />
            </View>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              {cohort.sublabel}
            </ThemedText>
          </View>
        </View>

        {/* Section 1: Standard Vital Signs */}
        <View style={styles.sectionHeader}>
          <Icon name="heartPulse" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Standard Vital Signs
          </ThemedText>
          {cohort.isInfant ? (
            <Badge label="Infant: BP Optional" variant="neutral" size="xs" />
          ) : null}
        </View>

        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label={cohort.isInfant ? 'Systolic BP (optional)' : 'Systolic BP (mmHg)'}
              placeholder={cohort.isInfant ? 'Optional for infants' : 'e.g. 120'}
              value={form.bpSys}
              onChangeText={(txt) => updateField('bpSys', txt)}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label={cohort.isInfant ? 'Diastolic BP (optional)' : 'Diastolic BP (mmHg)'}
              placeholder={cohort.isInfant ? 'Optional for infants' : 'e.g. 80'}
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
              label="Respiratory rate (/min) *"
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

        {/* Section 2: Anthropometrics & Demographic Growth Screening */}
        <View style={styles.sectionHeader}>
          <Icon name="activity" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            {cohort.isInfant
              ? 'Infant Anthropometrics (0–24 Months)'
              : cohort.isUnderFive
                ? 'Under-5 Anthropometrics & Growth'
                : 'Anthropometrics & Body Composition'}
          </ThemedText>
          {calculatedBmi && bmiCategory && !cohort.isInfant ? (
            <Badge label={`BMI: ${calculatedBmi} (${bmiCategory.label})`} variant={bmiCategory.variant} size="sm" />
          ) : null}
        </View>

        <View style={styles.formGrid}>
          {cohort.isInfant ? (
            <>
              <View style={styles.gridItem}>
                <Input
                  label="Recumbent Body Length (cm) *"
                  placeholder="e.g. 52.5"
                  value={form.bodyLength}
                  onChangeText={(txt) => {
                    updateField('bodyLength', txt);
                    if (!form.height) updateField('height', txt);
                  }}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Weight (kg) *"
                  placeholder="e.g. 4.2"
                  value={form.weight}
                  onChangeText={(txt) => updateField('weight', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Head Circumference (cm) *"
                  placeholder="e.g. 36.5"
                  value={form.headCircumference}
                  onChangeText={(txt) => updateField('headCircumference', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="MUAC Mid-Upper Arm (cm) *"
                  placeholder="e.g. 11.5"
                  value={form.midUpperArmCircumference}
                  onChangeText={(txt) => updateField('midUpperArmCircumference', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Skinfold Thickness (mm)"
                  placeholder="Optional, e.g. 6.0"
                  value={form.skinfoldThickness}
                  onChangeText={(txt) => updateField('skinfoldThickness', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Limbs Circumference (cm)"
                  placeholder="Optional, e.g. 15.0"
                  value={form.limbsCircumference}
                  onChangeText={(txt) => updateField('limbsCircumference', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
            </>
          ) : cohort.isUnderFive ? (
            <>
              <View style={styles.gridItem}>
                <Input
                  label="Standing Height / Length (cm)"
                  placeholder="e.g. 95.0"
                  value={form.height}
                  onChangeText={(txt) => updateField('height', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Weight (kg)"
                  placeholder="e.g. 14.2"
                  value={form.weight}
                  onChangeText={(txt) => updateField('weight', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Head Circumference (cm)"
                  placeholder="e.g. 48.0"
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
          ) : (
            <>
              <View style={styles.gridItem}>
                <Input
                  label="Height (cm)"
                  placeholder="e.g. 165"
                  value={form.height}
                  onChangeText={(txt) => updateField('height', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Weight (kg)"
                  placeholder="e.g. 62.5"
                  value={form.weight}
                  onChangeText={(txt) => updateField('weight', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label={`Waist Circumference (cm)${cohort.isAdult ? ` [${cohort.isFemale ? 'F < 80' : 'M < 90'}]` : ''}`}
                  placeholder={cohort.isFemale ? 'Target < 80 cm' : 'Target < 90 cm'}
                  value={form.waistCircumference}
                  onChangeText={(txt) => updateField('waistCircumference', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Hip Circumference (cm)"
                  placeholder="e.g. 96"
                  value={form.hipCircumference}
                  onChangeText={(txt) => updateField('hipCircumference', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
            </>
          )}
        </View>

        {/* Central Obesity & WHR Risk Badges (for adults) */}
        {cohort.isAdult && centralObesity ? (
          <View style={styles.centralObesityContainer}>
            <View style={styles.badgeRow}>
              {centralObesity.isObeseRisk ? (
                <Badge
                  label={`Central Obesity Risk (${centralObesity.genderLabel} ≥ ${centralObesity.cutoff} cm)`}
                  variant="emergency"
                  size="sm"
                />
              ) : (
                <Badge
                  label={`Waist Normal (${centralObesity.genderLabel} < ${centralObesity.cutoff} cm)`}
                  variant="success"
                  size="sm"
                />
              )}
              {centralObesity.whr ? (
                <Badge
                  label={`WHR: ${centralObesity.whr} (${centralObesity.whrRisk ? 'High Risk' : 'Normal'})`}
                  variant={centralObesity.whrRisk ? 'warning' : 'success'}
                  size="sm"
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Measurement Posture for Under-5 children */}
        {cohort.isUnderFive && !cohort.isInfant ? (
          <View style={styles.postureContainer}>
            <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.xs }}>
              Measurement Posture (WHO 2006 Standard)
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

        {/* Live WHO Z-Score Growth Evaluation Card */}
        {cohort.isUnderFive && zScorePreview ? (
          <View style={styles.zScoreCard}>
            <View style={styles.zScoreHeader}>
              <Icon name="checkCircle" size={14} color={theme.colors.primaryDark} />
              <ThemedText variant="smallBold" color={theme.colors.primaryDark}>
                WHO Growth Assessment (Sex-Differentiated)
              </ThemedText>
              <Badge
                label={zScorePreview.philHealthZScoreCategory || 'Evaluated'}
                variant={
                  (zScorePreview.philHealthZScoreCategory || '').includes('Severe')
                    ? 'emergency'
                    : zScorePreview.philHealthZScoreCategory === 'Normal'
                      ? 'success'
                      : 'warning'
                }
                size="sm"
              />
            </View>
            <View style={styles.zScoreGrid}>
              <View style={styles.zScoreItem}>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>Weight-for-Age</ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  {zScorePreview.weightForAgeZScore != null ? `${zScorePreview.weightForAgeZScore} SD` : '—'}
                </ThemedText>
              </View>
              <View style={styles.zScoreItem}>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>Length/Height-for-Age</ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  {zScorePreview.heightForAgeZScore != null ? `${zScorePreview.heightForAgeZScore} SD` : '—'}
                </ThemedText>
              </View>
              <View style={styles.zScoreItem}>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>Weight-for-Length</ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  {zScorePreview.weightForHeightZScore != null ? `${zScorePreview.weightForHeightZScore} SD` : '—'}
                </ThemedText>
              </View>
              <View style={styles.zScoreItem}>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>Statutory Code</ThemedText>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  {zScorePreview.philHealthZScoreCode || '01'}
                </ThemedText>
              </View>
            </View>
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
          <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.xs }}>
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
          <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.xs }}>
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
  cohortBanner: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  cohortHeader: {
    gap: theme.spacing.xs,
  },
  cohortPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
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
  centralObesityContainer: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  postureContainer: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  zScoreCard: {
    backgroundColor: theme.colors.primaryLighter,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  zScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  zScoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  zScoreItem: {
    flex: 1,
    minWidth: 120,
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
    gap: theme.spacing.xs,
  },
  observationChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
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
    gap: theme.spacing.xs,
  },
});
