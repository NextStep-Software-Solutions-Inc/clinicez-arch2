import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { theme } from '../../constants/theme';
import {
  clinicService,
  type RecordTriageRequest,
  type TriageVitals,
  type ClinicPatient,
  type PatientQueueItem,
  type PediatricZScoreResult,
  type RosCategoryCode,
  type TriageDispensedItemInput,
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
  CohortHeaderMeta,
  StandardVitalsSection,
  AnthropometricsSection,
  VisualAcuitySection,
  PreAssessmentSection,
  NurseCareAndOtcDispensingSection,
  isVisitTypeEligibleForOtcDispensing,
} from './VitalsFormFields';

export type { MeasurementPosture };

export interface RecordVitalsModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  queueItemId?: string | null;
  visitType?: string;
  initialChiefComplaint?: string;
  allowDuplicateActive?: boolean;
  initialDirectVisitStatus?: 'Triaged' | 'InConsultation';
  onMaterializeVisit?: (visit: PatientQueueItem) => void;
  onEscalatedToConsultation?: (updatedVisit: PatientQueueItem) => void;
  currentStaffId?: string;
  currentStaffName?: string;
  onSuccess: (vitals: TriageVitals) => void;
  title?: string;
}

export default function RecordVitalsModal({
  visible,
  onClose,
  patient,
  queueItemId,
  visitType,
  initialChiefComplaint,
  allowDuplicateActive = false,
  initialDirectVisitStatus = 'Triaged',
  onMaterializeVisit,
  onEscalatedToConsultation,
  currentStaffId,
  currentStaffName,
  onSuccess,
  title = 'Record vitals',
}: RecordVitalsModalProps) {
  const [form, setForm] = useState<VitalsFormState>(EMPTY_VITALS_FORM);
  const [saving, setSaving] = useState(false);
  const [zScorePreview, setZScorePreview] = useState<PediatricZScoreResult | null>(null);

  // Demographic cohort resolution: age brackets and gender awareness
  const cohort = useMemo(() => resolveCohort(patient), [patient]);

  // Reset form to clean create-only defaults when modal opens
  useEffect(() => {
    if (visible) {
      setForm({
        ...EMPTY_VITALS_FORM,
        posture: cohort.isInfant ? 'RECUMBENT' : 'STANDING',
        chiefComplaint: initialChiefComplaint || '',
      });
      setZScorePreview(null);
    }
  }, [visible, cohort.isInfant, initialChiefComplaint]);

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
        dateOfBirth: patient.dateOfBirth!,
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
  }, [form.height, form.bodyLength, form.weight, form.posture, patient, cohort.isUnderFive, cohort.isInfant, cohort.isFemale]);

  const updateField = (key: keyof VitalsFormState, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const updateRosCategory = (val: RosCategoryCode) => {
    setForm((prev) => ({ ...prev, rosCategory: val }));
  };

  const updateDispensedItems = (items: TriageDispensedItemInput[]) => {
    setForm((prev) => ({ ...prev, dispensedItems: items }));
  };

  const handleSave = async (completeVisitOnly: boolean = false, escalateToDoctor: boolean = false) => {
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

    let effectiveQueueItemId = queueItemId;

    if (!effectiveQueueItemId) {
      if (!patient) {
        Alert.alert('Cannot record vitals', 'Patient details are missing.');
        return;
      }
      setSaving(true);
      const initialStatus = completeVisitOnly && !escalateToDoctor ? 'DischargedNonDoctor' : initialDirectVisitStatus;
      const [directVisit, visitErr] = await clinicService.ensureDirectVisit({
        patientId: patient.id,
        patientName: patient.fullName,
        visitType: completeVisitOnly && !escalateToDoctor ? 'PreventiveHealthAssessment' : 'RoutineCheckup',
        initialStatus,
        allowDuplicateActive,
      });
      if (visitErr || !directVisit) {
        setSaving(false);
        notify.error(visitErr?.message || 'Could not initialize direct visit for vitals.');
        return;
      }
      effectiveQueueItemId = directVisit.id;
      onMaterializeVisit?.(directVisit);
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
      priority: form.triagePriority,
      chiefComplaint: form.chiefComplaint.trim() || undefined,
      homeInstructions: form.homeInstructions.trim() || undefined,
      rosCategory: form.rosCategory,
      dispensedItems:
        isVisitTypeEligibleForOtcDispensing(visitType) && form.dispensedItems.length > 0
          ? form.dispensedItems.map((it) => ({
              ...it,
              rosCategory: it.rosCategory || form.rosCategory,
            }))
          : undefined,
    };

    setSaving(true);
    const [savedVitals, err] = await clinicService.recordTriage(effectiveQueueItemId!, payload);

    if (err || !savedVitals) {
      setSaving(false);
      notify.error(err?.message || 'Could not save vitals.');
      return;
    }

    if (escalateToDoctor && effectiveQueueItemId) {
      const escalationPriority = form.triagePriority === 'Routine' ? 'Urgent' : form.triagePriority;
      const [escalatedVisit, escErr] = await clinicService.escalateToConsultation(effectiveQueueItemId, {
        priority: escalationPriority,
        escalationReason:
          form.preAssessmentNotes.trim() ||
          form.chiefComplaint.trim() ||
          'Escalated to physician consultation during nurse vitals check',
      });
      setSaving(false);
      if (escErr || !escalatedVisit) {
        notify.error(escErr?.message || 'Vitals saved, but could not escalate visit to consultation.');
      } else {
        notify.success('Vitals recorded and visit escalated to Physician Consultation.');
        onEscalatedToConsultation?.(escalatedVisit);
      }
      onSuccess(savedVitals);
      onClose();
      return;
    }

    setSaving(false);
    notify.success('Vitals recorded successfully.');
    onSuccess(savedVitals);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={patient ? patient.fullName : undefined}
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
              title="Save & Escalate to MD"
              variant="dangerOutline"
              icon="emergency"
              onPress={() => handleSave(false, true)}
              disabled={saving}
            />
          )}
          {!queueItemId && initialDirectVisitStatus === 'Triaged' && (
            <Button
              title="Save & Complete Vitals-Only"
              variant="outline"
              onPress={() => handleSave(true, false)}
              disabled={saving}
            />
          )}
          <Button
            title="Save vitals"
            variant="primary"
            icon="check"
            onPress={() => handleSave(false, false)}
            loading={saving}
          />
        </View>
      }
    >
      <View style={styles.formContent}>
        <StandardVitalsSection form={form} updateField={updateField} cohort={cohort} />
        <PreAssessmentSection form={form} updateField={updateField} cohort={cohort} />
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
        />
      </View>
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
});
