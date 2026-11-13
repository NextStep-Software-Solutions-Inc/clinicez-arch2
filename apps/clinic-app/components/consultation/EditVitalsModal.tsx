import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import {
  clinicService,
  type RecordTriageRequest,
  type UpdateTriageRequest,
  type TriageVitals,
  type ClinicPatient,
  type PatientQueueItem,
  type PediatricZScoreResult,
  type QueuePriority,
  type RosCategoryCode,
  type TriageDispensedItemInput,
} from '../../services/clinicService';
import { notify } from '../../utils/feedback';
import {
  type MeasurementPosture,
  type VitalsFormState,
  EMPTY_VITALS_FORM,
  hydrateVitalsFormFromRecord,
  mapApiErrorsToVitalsFormErrors,
  parseOptionalInt,
  parseOptionalFloat,
  resolveCohort,
  evaluateBmi,
  evaluateCentralObesity,
  formatVitalsSummary,
  CohortHeaderMeta,
  StandardVitalsSection,
  AnthropometricsSection,
  VisualAcuitySection,
  PreAssessmentSection,
  NurseCareAndOtcDispensingSection,
  isVisitTypeEligibleForOtcDispensing,
} from './VitalsFormFields';

export type { MeasurementPosture };

export interface EditVitalsModalProps {
  visible: boolean;
  onClose: () => void;
  queueItemId: string | null;
  visitType?: string;
  patient?: ClinicPatient | null;
  patientId?: string;
  initialVitals?: TriageVitals | null;
  currentStaffId?: string;
  currentStaffName?: string;
  onEscalatedToConsultation?: (updatedVisit: PatientQueueItem) => void;
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
  visitType,
  patient,
  patientId,
  initialVitals,
  currentStaffId,
  currentStaffName,
  onEscalatedToConsultation,
  onSuccess,
  title = 'Edit Vitals',
}: EditVitalsModalProps) {
  const [form, setForm] = useState<VitalsFormState>(EMPTY_VITALS_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof VitalsFormState, string>>>({});
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasExistingQueueTriage, setHasExistingQueueTriage] = useState<boolean>(true);
  const [patientRecord, setPatientRecord] = useState<ClinicPatient | null>(patient ?? null);
  const [zScorePreview, setZScorePreview] = useState<PediatricZScoreResult | null>(null);

  // Demographic cohort resolution: age brackets and gender awareness
  const cohort = useMemo(() => resolveCohort(patientRecord), [patientRecord]);

  const applyVitalsToState = useCallback(
    (vitalsData: TriageVitals, patientCohort: ReturnType<typeof resolveCohort>) => {
      setForm(hydrateVitalsFormFromRecord(vitalsData, patientCohort));
      setFieldErrors({});
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
    },
    [],
  );

  const loadVitals = useCallback(async () => {
    if (!queueItemId) return;
    setFetchError(null);
    if (!initialVitals) {
      setLoading(true);
    }

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
    if (initialVitals) {
      applyVitalsToState(initialVitals, patientCohort);
    }

    const [vitalsData, err] = await clinicService.getTriage(queueItemId);
    setLoading(false);

    if (!err && vitalsData) {
      setHasExistingQueueTriage(true);
      applyVitalsToState(vitalsData, patientCohort);
      return;
    }

    if (err?.status === 404 && initialVitals) {
      setHasExistingQueueTriage(false);
      setFetchError(null);
      return;
    }

    if (err || !vitalsData) {
      setFetchError(err?.message || 'Unable to load vitals');
    }
  }, [queueItemId, patient, patientId, initialVitals, applyVitalsToState]);

  useEffect(() => {
    if (visible && queueItemId) {
      loadVitals();
    } else {
      setForm(EMPTY_VITALS_FORM);
      setFieldErrors({});
      setLoading(false);
      setFetchError(null);
      setZScorePreview(null);
    }
  }, [visible, queueItemId, loadVitals]);

  // Live BMI calculation
  const bmiEval = useMemo(
    () => evaluateBmi(form.height, form.weight, form.bodyLength, cohort.isInfant, cohort.isPediatric),
    [form.height, form.bodyLength, form.weight, cohort.isInfant, cohort.isPediatric]
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
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const updateRosCategory = (val: RosCategoryCode) => {
    setForm((prev) => ({ ...prev, rosCategory: val }));
  };

  const updateDispensedItems = (items: TriageDispensedItemInput[]) => {
    setForm((prev) => ({ ...prev, dispensedItems: items }));
  };

  const handleSave = async (escalateToDoctor: boolean = false) => {
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

    const allowDispensing = isVisitTypeEligibleForOtcDispensing(visitType);
    const normalizedDispensed = allowDispensing
      ? form.dispensedItems.map((it) => ({
          ...it,
          rosCategory: it.rosCategory || form.rosCategory,
        }))
      : [];

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
      chiefComplaint: form.chiefComplaint.trim(),
      homeInstructions: form.homeInstructions.trim(),
      rosCategory: form.rosCategory,
      dispensedItems: normalizedDispensed,
    };

    setSaving(true);
    let savedVitals: TriageVitals | null = null;
    let err = null;

    if (hasExistingQueueTriage) {
      [savedVitals, err] = await clinicService.updateTriage(queueItemId, payload);
    }

    if (!hasExistingQueueTriage || err?.status === 404) {
      const createPayload: RecordTriageRequest = {
        nurseId: currentStaffId,
        recordedByNurseName: currentStaffName,
        systolicBp: systolicBp ?? undefined,
        diastolicBp: diastolicBp ?? undefined,
        heartRateBpm: heartRateBpm ?? undefined,
        temperatureCelsius: temperatureCelsius ?? undefined,
        respiratoryRateBreathsPerMin: respiratoryRateBreathsPerMin ?? undefined,
        oxygenSaturationPercent: oxygenSaturationPercent ?? undefined,
        heightCm: heightCm ?? undefined,
        bodyLengthCm: bodyLengthCm ?? undefined,
        weightKg: weightKg ?? undefined,
        painScore: painScore ?? undefined,
        notes: form.notes.trim() || undefined,
        visualAcuityLeft: visualAcuityLeft ?? undefined,
        visualAcuityRight: visualAcuityRight ?? undefined,
        headCircumferenceCm: headCircumferenceCm ?? undefined,
        midUpperArmCircumferenceCm: midUpperArmCircumferenceCm ?? undefined,
        skinfoldThicknessMm: skinfoldThicknessMm ?? undefined,
        limbsCircumferenceCm: limbsCircumferenceCm ?? undefined,
        waistCircumferenceCm: waistCircumferenceCm ?? undefined,
        hipCircumferenceCm: hipCircumferenceCm ?? undefined,
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
        priority: form.triagePriority,
        chiefComplaint: form.chiefComplaint.trim() || undefined,
        homeInstructions: form.homeInstructions.trim() || undefined,
        rosCategory: form.rosCategory,
        dispensedItems: normalizedDispensed.length > 0 ? normalizedDispensed : undefined,
      };
      [savedVitals, err] = await clinicService.recordTriage(queueItemId, createPayload);
    }

    if (err || !savedVitals) {
      setSaving(false);
      if (err) {
        setFieldErrors(mapApiErrorsToVitalsFormErrors(err));
      }
      notify.error(err?.message || 'Could not update vitals.', { traceId: err?.traceId });
      return;
    }

    setFieldErrors({});

    if (escalateToDoctor) {
      const escalationPriority = form.triagePriority === 'Routine' ? 'Urgent' : form.triagePriority;
      const [escalatedVisit, escErr] = await clinicService.escalateToConsultation(queueItemId, {
        priority: escalationPriority,
        escalationReason:
          form.preAssessmentNotes.trim() ||
          form.chiefComplaint.trim() ||
          'Escalated to physician consultation during nurse vitals check',
      });
      setSaving(false);
      if (escErr || !escalatedVisit) {
        notify.error(escErr?.message || 'Vitals updated, but could not escalate visit to consultation.');
      } else {
        notify.success('Vitals updated and visit escalated to Physician Consultation.');
        onEscalatedToConsultation?.(escalatedVisit);
      }
    } else {
      setSaving(false);
      notify.success('Vitals updated successfully.');
    }

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
      chiefComplaint: form.chiefComplaint.trim() || form.notes.trim() || undefined,
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
          ? `${patientRecord.fullName} • Code: ${patientRecord.patientCode || 'PAT'}`
          : undefined
      }
      headerExtra={<CohortHeaderMeta cohort={cohort} />}
      maxWidth={680}
      footer={
        <View style={styles.modalFooter}>
          <Button
            title="Cancel"
            variant="outline"
            onPress={onClose}
            disabled={saving}
          />
          {(visitType === 'PreventiveHealthAssessment' || form.triagePriority === 'Emergency') && (
            <Button
              title="Update & Escalate to MD"
              variant="dangerOutline"
              icon="emergency"
              onPress={() => handleSave(true)}
              disabled={isSubmitDisabled}
            />
          )}
          <Button
            title="Update vitals"
            variant="primary"
            icon="check"
            onPress={() => handleSave(false)}
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
        <View style={styles.formContent}>
          <StandardVitalsSection form={form} updateField={updateField} cohort={cohort} errors={fieldErrors} />
          <PreAssessmentSection form={form} updateField={updateField} cohort={cohort} errors={fieldErrors} />
          <AnthropometricsSection
            form={form}
            updateField={updateField}
            cohort={cohort}
            calculatedBmi={bmiEval?.bmi}
            bmiCategory={bmiEval?.category}
            centralObesity={centralObesity}
            zScorePreview={zScorePreview}
            errors={fieldErrors}
          />
          <VisualAcuitySection form={form} updateField={updateField} errors={fieldErrors} />
          <NurseCareAndOtcDispensingSection
            allowDispensing={isVisitTypeEligibleForOtcDispensing(visitType)}
            chiefComplaint={form.chiefComplaint}
            onChangeChiefComplaint={(txt) => updateField('chiefComplaint', txt)}
            homeInstructions={form.homeInstructions}
            onChangeHomeInstructions={(txt) => updateField('homeInstructions', txt)}
            rosCategory={form.rosCategory}
            onChangeRosCategory={updateRosCategory}
            dispensedItems={form.dispensedItems}
            onChangeDispensedItems={updateDispensedItems}
            chiefComplaintError={fieldErrors.chiefComplaint}
            homeInstructionsError={fieldErrors.homeInstructions}
          />
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  formContent: {
    gap: theme.spacing.md,
  },
  modalFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  loadingContainer: {
    padding: theme.spacing.md,
  },
});
