import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Input from '../ui/Input';
import Icon from '../ui/Icon';
import Badge from '../ui/Badge';
import SegmentedControl from '../ui/SegmentedControl';
import { theme } from '../../constants/theme';
import type { PediatricZScoreResult } from '../../services/clinicService';

export type MeasurementPosture = 'STANDING' | 'RECUMBENT';

export interface VitalsFormState {
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

export const EMPTY_VITALS_FORM: VitalsFormState = {
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

export const parseOptionalInt = (val: string): number | undefined => {
  const parsed = parseInt(val.trim(), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const parseOptionalFloat = (val: string): number | undefined => {
  const parsed = parseFloat(val.trim());
  return Number.isNaN(parsed) ? undefined : parsed;
};

export interface DemographicCohort {
  ageMonths: number;
  ageYears: number;
  isInfant: boolean;
  isUnderFive: boolean;
  isPediatric: boolean;
  isAdult: boolean;
  isSenior: boolean;
  isFemale: boolean;
  label: string;
  sublabel: string;
}

export function resolveCohort(
  patient: { age?: number; dateOfBirth?: string; gender?: string } | null | undefined
): DemographicCohort {
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
  let years = typeof patient.age === 'number' ? patient.age : 0;
  let months = years * 12;

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
}

export interface BmiEvaluation {
  bmi: number;
  category: {
    label: string;
    variant: 'success' | 'warning' | 'emergency';
  };
}

export function evaluateBmi(
  heightStr: string,
  weightStr: string,
  bodyLengthStr?: string,
  isInfant?: boolean
): BmiEvaluation | null {
  const effectiveHeight = isInfant
    ? parseOptionalFloat(bodyLengthStr || '') || parseOptionalFloat(heightStr)
    : parseOptionalFloat(heightStr);
  const w = parseOptionalFloat(weightStr);
  if (effectiveHeight && w && effectiveHeight > 0) {
    const heightM = effectiveHeight / 100;
    const bmi = Math.round((w / (heightM * heightM)) * 10) / 10;
    let label = 'Normal weight';
    let variant: 'success' | 'warning' | 'emergency' = 'success';
    if (bmi < 18.5) {
      label = 'Underweight';
      variant = 'warning';
    } else if (bmi < 25.0) {
      label = 'Normal weight';
      variant = 'success';
    } else if (bmi < 30.0) {
      label = 'Overweight';
      variant = 'warning';
    } else {
      label = 'Obese';
      variant = 'emergency';
    }
    return { bmi, category: { label, variant } };
  }
  return null;
}

export interface CentralObesityEvaluation {
  waist: number;
  cutoff: number;
  isObeseRisk: boolean;
  whr?: number;
  whrRisk: boolean;
  genderLabel: string;
}

export function evaluateCentralObesity(
  waistStr: string,
  hipStr: string,
  isFemale: boolean
): CentralObesityEvaluation | null {
  const waist = parseOptionalFloat(waistStr);
  const hip = parseOptionalFloat(hipStr);
  if (!waist || waist <= 0) return null;

  // Statutory Asian / Philippine cutoffs: Male >= 90 cm, Female >= 80 cm
  const cutoff = isFemale ? 80 : 90;
  const isObeseRisk = waist >= cutoff;

  let whr: number | undefined = undefined;
  let whrRisk = false;
  if (hip && hip > 0) {
    whr = Math.round((waist / hip) * 100) / 100;
    // WHR cutoffs: Male > 0.90, Female > 0.85
    whrRisk = isFemale ? whr > 0.85 : whr > 0.90;
  }

  return {
    waist,
    cutoff,
    isObeseRisk,
    whr,
    whrRisk,
    genderLabel: isFemale ? 'Female' : 'Male',
  };
}

export interface VitalsSummaryData {
  systolicBp?: number | null;
  diastolicBp?: number | null;
  heartRateBpm?: number | null;
  respiratoryRateBreathsPerMin?: number | null;
  temperatureCelsius?: number | null;
  oxygenSaturationPercent?: number | null;
  bmi?: number | null;
  philHealthZScoreCategory?: string | null;
  growthZScoreCategory?: string | null;
}

export function formatVitalsSummary(vitals?: VitalsSummaryData | null): string {
  if (!vitals) return '';
  const parts: string[] = [];
  if (vitals.systolicBp != null && vitals.diastolicBp != null) {
    parts.push(`BP ${vitals.systolicBp}/${vitals.diastolicBp}`);
  }
  if (vitals.heartRateBpm != null) {
    parts.push(`HR ${vitals.heartRateBpm}`);
  }
  if (vitals.respiratoryRateBreathsPerMin != null) {
    parts.push(`RR ${vitals.respiratoryRateBreathsPerMin}/min`);
  }
  if (vitals.temperatureCelsius != null) {
    parts.push(`Temp ${vitals.temperatureCelsius}°C`);
  }
  if (vitals.oxygenSaturationPercent != null) {
    parts.push(`SpO2 ${vitals.oxygenSaturationPercent}%`);
  }
  if (vitals.bmi != null) {
    parts.push(`BMI ${vitals.bmi}`);
  }
  const zScore = vitals.philHealthZScoreCategory || vitals.growthZScoreCategory;
  if (zScore) {
    parts.push(`Z: ${zScore}`);
  }
  return parts.join(' • ');
}

export const PRE_ASSESSMENT_OBSERVATION_CHIPS = [
  'Alert & Oriented',
  'Mild Distress',
  'Acute Dyspnea',
  'Severe Pain',
  'Wheelchair Bound',
  'Fall Risk',
  'Ambulatory with Assist',
];

export function togglePreAssessmentChip(currentRemarks: string, chip: string): string {
  if (currentRemarks.includes(chip)) {
    return currentRemarks
      .split(' • ')
      .filter((c) => c.trim() !== chip)
      .join(' • ');
  }
  return currentRemarks.trim() ? `${currentRemarks.trim()} • ${chip}` : chip;
}

// Sub-components

export function CohortBanner({ cohort }: { cohort: DemographicCohort }) {
  return (
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
  );
}

export interface StandardVitalsSectionProps {
  form: VitalsFormState;
  updateField: (key: keyof VitalsFormState, val: string) => void;
  cohort: DemographicCohort;
}

export function StandardVitalsSection({
  form,
  updateField,
  cohort,
}: StandardVitalsSectionProps) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Icon name="heartPulse" size={theme.sizes.iconSm} color={theme.colors.primary} />
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
    </>
  );
}

export interface AnthropometricsSectionProps {
  form: VitalsFormState;
  updateField: (key: keyof VitalsFormState, val: string) => void;
  cohort: DemographicCohort;
  calculatedBmi?: number;
  bmiCategory?: { label: string; variant: 'success' | 'warning' | 'emergency' } | null;
  centralObesity?: CentralObesityEvaluation | null;
  zScorePreview?: PediatricZScoreResult | null;
}

export function AnthropometricsSection({
  form,
  updateField,
  cohort,
  calculatedBmi,
  bmiCategory,
  centralObesity,
  zScorePreview,
}: AnthropometricsSectionProps) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Icon name="activity" size={theme.sizes.iconSm} color={theme.colors.primary} />
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
            <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
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
    </>
  );
}

export interface VisualAcuitySectionProps {
  form: VitalsFormState;
  updateField: (key: keyof VitalsFormState, val: string) => void;
}

export function VisualAcuitySection({
  form,
  updateField,
}: VisualAcuitySectionProps) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Icon name="eye" size={theme.sizes.iconSm} color={theme.colors.primary} />
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
    </>
  );
}

export interface PreAssessmentSectionProps {
  form: VitalsFormState;
  updateField: (key: keyof VitalsFormState, val: string) => void;
}

export function PreAssessmentSection({
  form,
  updateField,
}: PreAssessmentSectionProps) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Icon name="consultations" size={theme.sizes.iconSm} color={theme.colors.primary} />
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

      <View style={styles.chipsSection}>
        <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.xs }}>
          Pre-assessment Observations (tap to add to remarks)
        </ThemedText>
        <View style={styles.chipsRow}>
          {PRE_ASSESSMENT_OBSERVATION_CHIPS.map((chip) => {
            const isActive = form.preAssessmentRemarks.includes(chip);
            return (
              <Pressable
                key={chip}
                onPress={() => {
                  const updated = togglePreAssessmentChip(form.preAssessmentRemarks, chip);
                  updateField('preAssessmentRemarks', updated);
                }}
                style={[
                  styles.observationChip,
                  isActive && styles.observationChipActive,
                ]}
              >
                <View style={styles.chipContent}>
                  {isActive ? (
                    <Icon name="check" size={theme.sizes.iconSm - 4} color={theme.colors.primaryDark} />
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
    </>
  );
}

const styles = StyleSheet.create({
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
