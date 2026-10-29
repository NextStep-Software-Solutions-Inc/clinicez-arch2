import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import {
  clinicService,
  type UpdateTriageRequest,
  type TriageVitals,
  type ClinicPatient,
  type PediatricZScoreResult,
  type QueuePriority,
} from '../../services/clinicService';
import { notify } from '../../utils/feedback';
import {
  type MeasurementPosture,
  type VitalsFormState,
  EMPTY_VITALS_FORM,
  parseOptionalInt,
  parseOptionalFloat,
  resolveCohort,
  evaluateBmi,
  evaluateCentralObesity,
  formatVitalsSummary,
  CohortBanner,
  StandardVitalsSection,
  AnthropometricsSection,
  VisualAcuitySection,
  PreAssessmentSection,
} from './VitalsFormFields';

export type { MeasurementPosture };

export interface EditVitalsModalProps {
  visible: boolean;
  onClose: () => void;
  queueItemId: string | null;
  patient?: ClinicPatient | null;
  patientId?: string;
  currentStaffId?: string;
  currentStaffName?: string;
  onSuccess: (
    updatedVitals: TriageVitals,
    summaryData?: { priority?: QueuePriority; vitalsSummary?: string; chiefComplaint?: string }
  ) => void;
  title?: string;
}

export default function EditVitalsModal({
  visible,
  onClose,
  queueItemId,
  patient,
  patientId,
  currentStaffId,
  currentStaffName,
  onSuccess,
  title = 'Edit Vitals',
}: EditVitalsModalProps) {
  const [form, setForm] = useState<VitalsFormState>(EMPTY_VITALS_FORM);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [patientRecord, setPatientRecord] = useState<ClinicPatient | null>(patient ?? null);
  const [zScorePreview, setZScorePreview] = useState<PediatricZScoreResult | null>(null);

  // Demographic cohort resolution: age brackets and gender awareness
  const cohort = useMemo(() => resolveCohort(patientRecord), [patientRecord]);

  const loadVitals = useCallback(async () => {
    if (!queueItemId) return;
    setLoading(true);
    setFetchError(null);

    // If patient is not provided but patientId is, fetch patient details for cohort resolution
    let resolvedPatient = patient ?? null;
    if (!resolvedPatient && patientId) {
      const [pData] = await clinicService.getPatientById(patientId);
      if (pData) {
        resolvedPatient = pData;
        setPatientRecord(pData);
      }
    } else if (patient) {
      setPatientRecord(patient);
    }

    const patientCohort = resolveCohort(resolvedPatient);

    const [vitalsData, err] = await clinicService.getTriage(queueItemId);
    setLoading(false);

    if (err || !vitalsData) {
      setFetchError(err?.message || 'Unable to load vitals');
      return;
    }

    setForm({
      bpSys: vitalsData.systolicBp != null ? String(vitalsData.systolicBp) : '',
      bpDia: vitalsData.diastolicBp != null ? String(vitalsData.diastolicBp) : '',
      hr: vitalsData.heartRateBpm != null ? String(vitalsData.heartRateBpm) : '',
      rr: vitalsData.respiratoryRateBreathsPerMin != null ? String(vitalsData.respiratoryRateBreathsPerMin) : '',
      temp: vitalsData.temperatureCelsius != null ? String(vitalsData.temperatureCelsius) : '',
      spo2: vitalsData.oxygenSaturationPercent != null ? String(vitalsData.oxygenSaturationPercent) : '',
      pain: vitalsData.painScore != null ? String(vitalsData.painScore) : '',
      height: vitalsData.heightCm != null ? String(vitalsData.heightCm) : '',
      weight: vitalsData.weightKg != null ? String(vitalsData.weightKg) : '',
      bodyLength: vitalsData.bodyLengthCm != null
        ? String(vitalsData.bodyLengthCm)
        : (patientCohort.isInfant && vitalsData.heightCm != null ? String(vitalsData.heightCm) : ''),
      headCircumference: vitalsData.headCircumferenceCm != null ? String(vitalsData.headCircumferenceCm) : '',
      midUpperArmCircumference: vitalsData.midUpperArmCircumferenceCm != null ? String(vitalsData.midUpperArmCircumferenceCm) : '',
      skinfoldThickness: vitalsData.skinfoldThicknessMm != null ? String(vitalsData.skinfoldThicknessMm) : '',
      limbsCircumference: vitalsData.limbsCircumferenceCm != null ? String(vitalsData.limbsCircumferenceCm) : '',
      waistCircumference: vitalsData.waistCircumferenceCm != null ? String(vitalsData.waistCircumferenceCm) : '',
      hipCircumference: vitalsData.hipCircumferenceCm != null ? String(vitalsData.hipCircumferenceCm) : '',
      visualAcuityLeft: vitalsData.visualAcuityLeft || '',
      visualAcuityRight: vitalsData.visualAcuityRight || '',
      notes: vitalsData.notes || '',
      posture: vitalsData.isMeasuredRecumbent || patientCohort.isInfant ? 'RECUMBENT' : 'STANDING',
      preAssessmentNotes: vitalsData.preAssessmentNotes || '',
      preAssessmentRemarks: vitalsData.preAssessmentRemarks || '',
      triagePriority: (vitalsData.triageAcuityReason as any) || 'Routine',
    });

    if (vitalsData.growthZScoreCategory || vitalsData.philHealthZScoreCategory) {
      setZScorePreview({
        ageInMonths: 0,
        adjustedLengthHeightCm: vitalsData.heightCm ?? 0,
        weightForAgeZScore: vitalsData.zScoreWeightForAge ?? undefined,
        heightForAgeZScore: vitalsData.zScoreLengthForAge ?? undefined,
        weightForHeightZScore: vitalsData.zScoreWeightForLength ?? undefined,
        philHealthZScoreCategory: vitalsData.philHealthZScoreCategory ?? vitalsData.growthZScoreCategory ?? undefined,
        philHealthZScoreCode: vitalsData.philHealthZScoreCode ?? vitalsData.growthZScoreCode ?? undefined,
      });
    } else {
      setZScorePreview(null);
    }
  }, [queueItemId, patient, patientId]);

  useEffect(() => {
    if (visible && queueItemId) {
      loadVitals();
    } else {
      setForm(EMPTY_VITALS_FORM);
      setLoading(false);
      setFetchError(null);
      setZScorePreview(null);
    }
  }, [visible, queueItemId, loadVitals]);

  // Live BMI calculation
  const bmiEval = useMemo(
    () => evaluateBmi(form.height, form.weight, form.bodyLength, cohort.isInfant),
    [form.height, form.bodyLength, form.weight, cohort.isInfant]
  );

  // Live Adult Sex-Differentiated Central Obesity & WHR Risk Evaluation
  const centralObesity = useMemo(
    () => evaluateCentralObesity(form.waistCircumference, form.hipCircumference, cohort.isFemale),
    [form.waistCircumference, form.hipCircumference, cohort.isFemale]
  );

  // Debounced WHO Z-score calculation for children under 5 (0–60 months)
  useEffect(() => {
    if (!cohort.isUnderFive || !patientRecord?.dateOfBirth) return;
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
        dateOfBirth: patientRecord.dateOfBirth!,
        sex: cohort.isFemale ? 'Female' : 'Male',
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
  }, [form.height, form.bodyLength, form.weight, form.posture, patientRecord, cohort.isUnderFive, cohort.isInfant, cohort.isFemale]);

  const updateField = (key: keyof VitalsFormState, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    if (!queueItemId) {
      Alert.alert('Cannot update vitals', 'Active queue item ID is missing for this consultation.');
      return;
    }

    const systolicBp = parseOptionalInt(form.bpSys) ?? null;
    const diastolicBp = parseOptionalInt(form.bpDia) ?? null;
    const heartRateBpm = parseOptionalInt(form.hr) ?? null;
    const respiratoryRateBreathsPerMin = parseOptionalInt(form.rr) ?? null;
    const temperatureCelsius = parseOptionalFloat(form.temp) ?? null;
    const oxygenSaturationPercent = parseOptionalInt(form.spo2) ?? null;
    let heightCm = parseOptionalFloat(form.height) ?? null;
    let bodyLengthCm = parseOptionalFloat(form.bodyLength) ?? null;
    const weightKg = parseOptionalFloat(form.weight) ?? null;
    const painScore = form.pain.trim() !== '' ? parseOptionalInt(form.pain) ?? null : null;
    const headCircumferenceCm = parseOptionalFloat(form.headCircumference) ?? null;
    const midUpperArmCircumferenceCm = parseOptionalFloat(form.midUpperArmCircumference) ?? null;
    const skinfoldThicknessMm = parseOptionalFloat(form.skinfoldThickness) ?? null;
    const limbsCircumferenceCm = parseOptionalFloat(form.limbsCircumference) ?? null;
    const waistCircumferenceCm = parseOptionalFloat(form.waistCircumference) ?? null;
    const hipCircumferenceCm = parseOptionalFloat(form.hipCircumference) ?? null;
    const visualAcuityLeft = form.visualAcuityLeft.trim() !== '' ? form.visualAcuityLeft.trim() : null;
    const visualAcuityRight = form.visualAcuityRight.trim() !== '' ? form.visualAcuityRight.trim() : null;

    // For infants, body length is primary recumbent measurement; sync to height if empty
    if (cohort.isInfant) {
      if (bodyLengthCm != null && heightCm == null) heightCm = bodyLengthCm;
      if (heightCm != null && bodyLengthCm == null) bodyLengthCm = heightCm;
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
    ].some((v) => v !== null) || !!visualAcuityLeft || !!visualAcuityRight;

    if (!hasAnyVital) {
      Alert.alert('No vitals entered', 'Enter at least one vital sign before saving.');
      return;
    }

    const payload: UpdateTriageRequest = {
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
      notes: form.notes.trim() !== '' ? form.notes.trim() : '',
      visualAcuityLeft: visualAcuityLeft ?? '',
      visualAcuityRight: visualAcuityRight ?? '',
      headCircumferenceCm,
      midUpperArmCircumferenceCm,
      skinfoldThicknessMm,
      limbsCircumferenceCm,
      waistCircumferenceCm,
      hipCircumferenceCm,
      isMeasuredRecumbent: cohort.isInfant || form.posture === 'RECUMBENT',
      zScoreWeightForAge: zScorePreview?.weightForAgeZScore ?? null,
      zScoreLengthForAge: zScorePreview?.heightForAgeZScore ?? null,
      zScoreWeightForLength: zScorePreview?.weightForHeightZScore ?? null,
      growthZScoreCategory: zScorePreview?.philHealthZScoreCategory ?? null,
      growthZScoreCode: zScorePreview?.philHealthZScoreCode ?? null,
      philHealthZScoreCategory: zScorePreview?.philHealthZScoreCategory ?? null,
      philHealthZScoreCode: zScorePreview?.philHealthZScoreCode ?? null,
      preAssessmentNotes: form.preAssessmentNotes.trim() !== '' ? form.preAssessmentNotes.trim() : '',
      preAssessmentRemarks: form.preAssessmentRemarks.trim() !== '' ? form.preAssessmentRemarks.trim() : '',
      triageAcuityReason: form.triagePriority,
      priority: form.triagePriority,
      clearHeight: heightCm == null,
      clearWeight: weightKg == null,
    };

    setSaving(true);
    const [savedVitals, err] = await clinicService.updateTriage(queueItemId, payload);
    setSaving(false);

    if (err || !savedVitals) {
      notify.error(err?.message || 'Could not update vitals.');
      return;
    }

    notify.success('Vitals updated successfully.');
    const summary = formatVitalsSummary({
      systolicBp: savedVitals.systolicBp,
      diastolicBp: savedVitals.diastolicBp,
      heartRateBpm: savedVitals.heartRateBpm,
      respiratoryRateBreathsPerMin: savedVitals.respiratoryRateBreathsPerMin,
      temperatureCelsius: savedVitals.temperatureCelsius,
      oxygenSaturationPercent: savedVitals.oxygenSaturationPercent,
      bmi: savedVitals.bmi ?? (bmiEval ? bmiEval.bmi : null),
      philHealthZScoreCategory: savedVitals.philHealthZScoreCategory ?? zScorePreview?.philHealthZScoreCategory,
      growthZScoreCategory: savedVitals.growthZScoreCategory ?? zScorePreview?.philHealthZScoreCategory,
    });

    onSuccess(savedVitals, {
      priority: form.triagePriority,
      vitalsSummary: summary,
      chiefComplaint: form.notes.trim() || undefined,
    });
    onClose();
  };

  const isSubmitDisabled = loading || saving || !!fetchError;

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={
        patientRecord
          ? `${patientRecord.fullName} (${patientRecord.age}yo ${patientRecord.sex}) • Code: ${patientRecord.patientCode || 'PAT'}`
          : 'Update patient vitals and screening'
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
            title="Update vitals"
            variant="primary"
            icon="check"
            onPress={handleSave}
            loading={saving}
            disabled={isSubmitDisabled}
          />
        </View>
      }
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <SkeletonList rows={6} />
        </View>
      ) : fetchError ? (
        <ErrorState
          title="Unable to load vitals"
          message={fetchError}
          onRetry={loadVitals}
          retryLabel="Retry"
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <CohortBanner cohort={cohort} />
          <StandardVitalsSection form={form} updateField={updateField} cohort={cohort} />
          <AnthropometricsSection
            form={form}
            updateField={updateField}
            cohort={cohort}
            calculatedBmi={bmiEval?.bmi}
            bmiCategory={bmiEval?.category}
            centralObesity={centralObesity}
            zScorePreview={zScorePreview}
          />
          <VisualAcuitySection form={form} updateField={updateField} />
          <PreAssessmentSection form={form} updateField={updateField} />
        </ScrollView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  loadingContainer: {
    padding: theme.spacing.md,
  },
});
