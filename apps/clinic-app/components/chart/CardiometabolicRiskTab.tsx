import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '@constants/theme';
import { ThemedText, Button, Input, Icon, Badge, ErrorState, SkeletonList, ValidatedDateInput, validateDateString, Modal } from '@ui';
import { Alert } from '@utils/feedback';
import {
  clinicService,
  ClinicPatient,
  NcdRiskAssessment,
  SaveNcdRiskAssessmentPayload,
  formatClinicDateTime,
} from '../../services/clinicService';
import { useAuth, usePermission } from '../../context/AuthContext';
import { useClinic } from '../../context/ClinicContext';
import { PERMISSIONS } from '../../constants/permissions';
import { useStaff } from '../../context/StaffContext';
import {
  calculatePhilPenRisk,
  percentageToRiskBand,
  RISK_BAND_MIDPOINTS,
  type RiskBandType,
} from '../../utils/philpenCalculator';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface NcdFormSnapshot {
  riskBand: RiskBandType;
  riskScorePercent: string;
  assessmentDate: string;
  assessedByStaffId?: string;
  assessedByStaffName: string;
  authedClinicianName: string;
  remarks: string;
  eatsProcessedFoodWeekly: boolean | null;
  threeServingsVegetablesDaily: boolean | null;
  twoToThreeServingsFruitDaily: boolean | null;
  physicalActivityAtLeast150MinsWeekly: boolean | null;
  diagnosedDiabetes: boolean | null;
  diabetesMedicationStatus: 'Y' | 'N' | null;
  hasPolyphagia: boolean | null;
  hasPolydipsia: boolean | null;
  hasPolyuria: boolean | null;
  hasRaisedBloodGlucose: boolean | null;
  fastingBloodSugarMgDl: string;
  fastingBloodSugarDate: string;
  hasRaisedBloodLipids: boolean | null;
  totalCholesterolMgDl: string;
  totalCholesterolDate: string;
  urineKetonesPresent: boolean | null;
  urineKetonesValue: string;
  urineKetonesDate: string;
  urineProteinPresent: boolean | null;
  urineProteinValue: string;
  urineProteinDate: string;
  hasChestPain: boolean | null;
  painInCenterOfChestOrLeftArm: boolean | null;
  painWhenWalkingUphill: boolean | null;
  slowsDownWhenPainOccurs: boolean | null;
  painRelievedWithin10Mins: boolean | null;
  painRelievedByNitrates: boolean | null;
  severeChestPainOver30Mins: boolean | null;
  transientNeurologicalDeficits: boolean | null;
  hasHistoryAnginaHeartAttack: boolean | null;
  hasHistoryStrokeOrTia: boolean | null;
}

function sanitizeAutoSaveDate(raw: string, label: string): {
  value?: string;
  isMidTyping: boolean;
  error: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: undefined, isMidTyping: false, error: null };
  }
  if (trimmed.length < 10) {
    return { value: undefined, isMidTyping: true, error: null };
  }
  const check = validateDateString(trimmed, { boundaryMode: 'pastOrToday' });
  if (!check.isValid) {
    return {
      value: undefined,
      isMidTyping: false,
      error: check.errorMessage || `Invalid ${label}`,
    };
  }
  return { value: trimmed, isMidTyping: false, error: null };
}

/**
 * Builds a progressive-save payload for NCD Risk Assessment without assuming or defaulting
 * any unanswered (`null`) screening questions.
 */
export function buildNcdAssessmentPayload(snap: NcdFormSnapshot): {
  payload: SaveNcdRiskAssessmentPayload;
  isMidTypingDate: boolean;
  validationError: string | null;
} {
  const assessmentDateRes = sanitizeAutoSaveDate(snap.assessmentDate, 'assessment date');
  const fbsDateRes = snap.hasRaisedBloodGlucose === true
    ? sanitizeAutoSaveDate(snap.fastingBloodSugarDate, 'FBS test date')
    : { value: undefined, isMidTyping: false, error: null };
  const cholDateRes = snap.hasRaisedBloodLipids === true
    ? sanitizeAutoSaveDate(snap.totalCholesterolDate, 'cholesterol test date')
    : { value: undefined, isMidTyping: false, error: null };
  const ketonesDateRes = snap.urineKetonesPresent === true
    ? sanitizeAutoSaveDate(snap.urineKetonesDate, 'ketones test date')
    : { value: undefined, isMidTyping: false, error: null };
  const proteinDateRes = snap.urineProteinPresent === true
    ? sanitizeAutoSaveDate(snap.urineProteinDate, 'protein test date')
    : { value: undefined, isMidTyping: false, error: null };

  const isMidTypingDate =
    assessmentDateRes.isMidTyping ||
    fbsDateRes.isMidTyping ||
    cholDateRes.isMidTyping ||
    ketonesDateRes.isMidTyping ||
    proteinDateRes.isMidTyping;

  const validationError =
    assessmentDateRes.error ||
    fbsDateRes.error ||
    cholDateRes.error ||
    ketonesDateRes.error ||
    proteinDateRes.error;

  const clinicianSnapshot = snap.assessedByStaffName.trim() || snap.authedClinicianName || 'Clinician';
  const effectiveAssessmentDate = assessmentDateRes.value
    ? new Date(assessmentDateRes.value).toISOString()
    : new Date().toISOString();

  const parsedFbs = parseFloat(snap.fastingBloodSugarMgDl);
  const hasValidFbs = !isNaN(parsedFbs) && parsedFbs > 0;
  const parsedChol = parseFloat(snap.totalCholesterolMgDl);
  const hasValidChol = !isNaN(parsedChol) && parsedChol > 0;
  const parsedRiskPct = parseFloat(snap.riskScorePercent);

  const effectiveRaisedGlucose =
    snap.hasRaisedBloodGlucose !== null
      ? snap.hasRaisedBloodGlucose || (hasValidFbs && parsedFbs >= 126)
      : hasValidFbs && parsedFbs >= 126
        ? true
        : undefined;

  const effectiveRaisedLipids =
    snap.hasRaisedBloodLipids !== null
      ? snap.hasRaisedBloodLipids || (hasValidChol && parsedChol >= 200)
      : hasValidChol && parsedChol >= 200
        ? true
        : undefined;

  const payload: SaveNcdRiskAssessmentPayload = {
    riskBand: snap.riskBand,
    calculatedRiskScorePercent: !isNaN(parsedRiskPct) ? parsedRiskPct : undefined,
    assessmentDate: effectiveAssessmentDate,
    assessedByStaffId: snap.assessedByStaffId,
    assessedByStaffName: clinicianSnapshot,
    remarks: snap.remarks.trim() || undefined,

    eatsProcessedFoodWeekly: snap.eatsProcessedFoodWeekly ?? undefined,
    threeServingsVegetablesDaily: snap.threeServingsVegetablesDaily ?? undefined,
    twoToThreeServingsFruitDaily: snap.twoToThreeServingsFruitDaily ?? undefined,
    physicalActivityAtLeast150MinsWeekly: snap.physicalActivityAtLeast150MinsWeekly ?? undefined,

    diagnosedDiabetes: snap.diagnosedDiabetes === null ? undefined : snap.diagnosedDiabetes ? 'Y' : 'N',
    hasPolyphagia: snap.hasPolyphagia ?? undefined,
    hasPolydipsia: snap.hasPolydipsia ?? undefined,
    hasPolyuria: snap.hasPolyuria ?? undefined,
    diabetesMedicationStatus:
      snap.diagnosedDiabetes === true ? (snap.diabetesMedicationStatus ?? undefined) : undefined,

    hasRaisedBloodGlucose: effectiveRaisedGlucose,
    fastingBloodSugarMgDl:
      (snap.hasRaisedBloodGlucose === true || hasValidFbs) && hasValidFbs ? parsedFbs : undefined,
    fastingBloodSugarDate: snap.hasRaisedBloodGlucose === true ? fbsDateRes.value : undefined,

    hasRaisedBloodLipids: effectiveRaisedLipids,
    totalCholesterolMgDl:
      (snap.hasRaisedBloodLipids === true || hasValidChol) && hasValidChol ? parsedChol : undefined,
    totalCholesterolDate: snap.hasRaisedBloodLipids === true ? cholDateRes.value : undefined,

    urineKetonesPresent: snap.urineKetonesPresent ?? undefined,
    urineKetonesValue:
      snap.urineKetonesPresent === true && snap.urineKetonesValue.trim()
        ? snap.urineKetonesValue.trim()
        : undefined,
    urineKetonesDate: snap.urineKetonesPresent === true ? ketonesDateRes.value : undefined,

    urineProteinPresent: snap.urineProteinPresent ?? undefined,
    urineProteinValue:
      snap.urineProteinPresent === true && snap.urineProteinValue.trim()
        ? snap.urineProteinValue.trim()
        : undefined,
    urineProteinDate: snap.urineProteinPresent === true ? proteinDateRes.value : undefined,

    hasChestPain: snap.hasChestPain ?? undefined,
    painInCenterOfChestOrLeftArm:
      snap.hasChestPain === true ? (snap.painInCenterOfChestOrLeftArm ?? undefined) : undefined,
    painWhenWalkingUphill:
      snap.hasChestPain === true ? (snap.painWhenWalkingUphill ?? undefined) : undefined,
    slowsDownWhenPainOccurs:
      snap.hasChestPain === true && snap.painWhenWalkingUphill === true
        ? (snap.slowsDownWhenPainOccurs ?? undefined)
        : undefined,
    painRelievedWithin10Mins:
      snap.hasChestPain === true && snap.painWhenWalkingUphill === true
        ? (snap.painRelievedWithin10Mins ?? undefined)
        : undefined,
    painRelievedByNitrates:
      snap.hasChestPain === true && snap.painWhenWalkingUphill === true
        ? (snap.painRelievedByNitrates ?? undefined)
        : undefined,

    severeChestPainOver30Mins: snap.severeChestPainOver30Mins ?? undefined,
    transientNeurologicalDeficits: snap.transientNeurologicalDeficits ?? undefined,
    hasHistoryAnginaHeartAttack: snap.hasHistoryAnginaHeartAttack ?? undefined,
    hasHistoryStrokeOrTia: snap.hasHistoryStrokeOrTia ?? undefined,
  };

  return { payload, isMidTypingDate, validationError };
}

export function countNcdQuestionProgress(snap: NcdFormSnapshot): {
  answeredCount: number;
  totalRequiredCount: number;
} {
  const checks: boolean[] = [
    snap.eatsProcessedFoodWeekly !== null,
    snap.threeServingsVegetablesDaily !== null,
    snap.twoToThreeServingsFruitDaily !== null,
    snap.physicalActivityAtLeast150MinsWeekly !== null,
    snap.diagnosedDiabetes !== null,
    snap.hasPolyphagia !== null,
    snap.hasPolydipsia !== null,
    snap.hasPolyuria !== null,
    snap.hasRaisedBloodGlucose !== null,
    snap.hasRaisedBloodLipids !== null,
    snap.urineKetonesPresent !== null,
    snap.urineProteinPresent !== null,
    snap.hasChestPain !== null,
    snap.severeChestPainOver30Mins !== null,
    snap.transientNeurologicalDeficits !== null,
    snap.hasHistoryAnginaHeartAttack !== null,
    snap.hasHistoryStrokeOrTia !== null,
  ];
  if (snap.diagnosedDiabetes === true) {
    checks.push(snap.diabetesMedicationStatus !== null);
  }
  if (snap.hasRaisedBloodGlucose === true) {
    checks.push(snap.fastingBloodSugarMgDl.trim().length > 0);
  }
  if (snap.hasRaisedBloodLipids === true) {
    checks.push(snap.totalCholesterolMgDl.trim().length > 0);
  }
  if (snap.urineKetonesPresent === true) {
    checks.push(snap.urineKetonesValue.trim().length > 0);
  }
  if (snap.urineProteinPresent === true) {
    checks.push(snap.urineProteinValue.trim().length > 0);
  }
  if (snap.hasChestPain === true) {
    checks.push(snap.painInCenterOfChestOrLeftArm !== null);
    checks.push(snap.painWhenWalkingUphill !== null);
    if (snap.painWhenWalkingUphill === true) {
      checks.push(snap.slowsDownWhenPainOccurs !== null);
      checks.push(snap.painRelievedWithin10Mins !== null);
      checks.push(snap.painRelievedByNitrates !== null);
    }
  }
  return {
    answeredCount: checks.filter(Boolean).length,
    totalRequiredCount: checks.length,
  };
}

const VOID_REASONS = [
  'Duplicate entry',
  'Incorrect lab values or survey data',
  'Entered on wrong patient chart',
  'Test / Training entry',
  'Other',
];

const RISK_BAND_META: Record<RiskBandType, { label: string; desc: string; badgeVariant: 'success' | 'info' | 'warning' | 'urgent' | 'emergency'; color: string; bg: string }> = {
  BandA: { label: 'Band A (<10%)', desc: 'Low 10-Year CVD Risk', badgeVariant: 'success', color: theme.colors.successText, bg: theme.colors.successBg },
  BandB: { label: 'Band B (10-<20%)', desc: 'Moderate 10-Year CVD Risk', badgeVariant: 'info', color: theme.colors.infoText, bg: theme.colors.infoBg },
  BandC: { label: 'Band C (20-<30%)', desc: 'High 10-Year CVD Risk', badgeVariant: 'warning', color: theme.colors.warningText, bg: theme.colors.warningBg },
  BandD: { label: 'Band D (30-<40%)', desc: 'Very High 10-Year CVD Risk', badgeVariant: 'urgent', color: theme.colors.urgentText, bg: theme.colors.urgentBg },
  BandE: { label: 'Band E (>=40%)', desc: 'Critical / Extreme CVD Risk', badgeVariant: 'emergency', color: theme.colors.emergencyText, bg: theme.colors.emergencyBg },
};

export interface CardiometabolicRiskTabProps {
  patient: ClinicPatient;
  initialLatestAssessment?: NcdRiskAssessment;
  onRefreshChart?: () => void;
  readOnly?: boolean;
}

export default function CardiometabolicRiskTab({
  patient,
  initialLatestAssessment,
  onRefreshChart,
  readOnly,
}: CardiometabolicRiskTabProps) {
  const { user, state, permissions } = useAuth();
  const hasPatientsWrite = usePermission(PERMISSIONS.patientsWrite);
  const isUnmountedTestHarness = state === 'booting' && !user && permissions.length === 0;
  const canWritePatients = readOnly !== undefined ? !readOnly : isUnmountedTestHarness ? true : hasPatientsWrite;
  const { current: currentStaff, currentName } = useStaff();
  const { settings } = useClinic();
  const dateFormat = settings?.dateFormat ?? 'MM/DD/YYYY';
  const timeFormat = settings?.timeFormat ?? '12h';
  const timeZoneId = settings?.timeZoneId ?? 'Asia/Manila';
  const authedClinicianName = currentName || (user?.name ?? '').trim();
  const authedStaffId = currentStaff?.id || user?.id;

  const [assessments, setAssessments] = useState<NcdRiskAssessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [userEditVersion, setUserEditVersion] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    () => initialLatestAssessment?.updatedAt ?? initialLatestAssessment?.createdAt ?? null
  );
  const lastSavedAtRef = useRef<string | null>(lastSavedAt);
  lastSavedAtRef.current = lastSavedAt;

  const lastEditKindRef = useRef<'discrete' | 'text'>('discrete');
  const sessionAssessmentIdRef = useRef<string | null>(null);
  const inFlightSaveRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userEditVersionRef = useRef(0);
  userEditVersionRef.current = userEditVersion;
  const lastSavedEditVersionRef = useRef(0);
  const lastSavedPayloadJsonRef = useRef<string | null>(null);
  const onRefreshChartRef = useRef(onRefreshChart);
  onRefreshChartRef.current = onRefreshChart;

  const resetAutoSaveTracking = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingResaveRef.current = false;
    userEditVersionRef.current = 0;
    lastSavedEditVersionRef.current = 0;
    lastSavedPayloadJsonRef.current = null;
    setUserEditVersion(0);
    setAutoSaveStatus('idle');
    setAutoSaveError(null);
  }, []);

  // Editing & Voiding State
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [voidingAssessment, setVoidingAssessment] = useState<NcdRiskAssessment | null>(null);
  const [voidReason, setVoidReason] = useState<string>('Duplicate entry');
  const [customVoidNotes, setCustomVoidNotes] = useState<string>('');
  const [voidingSubmitting, setVoidingSubmitting] = useState(false);

  // Assessment Scoring & Stratification State
  const [riskBand, setRiskBand] = useState<RiskBandType>('BandA');
  const [riskScorePercent, setRiskScorePercent] = useState('');
  const [isManuallyOverridden, setIsManuallyOverridden] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [assessedByStaffName, setAssessedByStaffName] = useState(authedClinicianName);
  const [remarks, setRemarks] = useState('');

  // Auto-sync assessedByStaffName with authed user if empty or previously generic 'Clinician'
  useEffect(() => {
    if ((!assessedByStaffName || assessedByStaffName === 'Clinician') && authedClinicianName) {
      setAssessedByStaffName(authedClinicianName);
    }
  }, [authedClinicianName]);

  // Section 1: Dietary Fat & Sodium Intake - NO DEFAULTING (null = unanswered)
  const [eatsProcessedFoodWeekly, setEatsProcessedFoodWeekly] = useState<boolean | null>(null);

  // Section 2: Dietary Fiber & Nutrition - NO DEFAULTING (null = unanswered)
  const [threeServingsVegetablesDaily, setThreeServingsVegetablesDaily] = useState<boolean | null>(null);
  const [twoToThreeServingsFruitDaily, setTwoToThreeServingsFruitDaily] = useState<boolean | null>(null);

  // Section 3: Physical Activity - NO DEFAULTING (null = unanswered)
  const [physicalActivityAtLeast150MinsWeekly, setPhysicalActivityAtLeast150MinsWeekly] = useState<boolean | null>(null);

  // Section 4: Diabetes & Metabolic Assessment - NO DEFAULTING (null = unanswered)
  const [diagnosedDiabetes, setDiagnosedDiabetes] = useState<boolean | null>(null);
  const [diabetesMedicationStatus, setDiabetesMedicationStatus] = useState<'Y' | 'N' | null>(null);
  const [hasPolyphagia, setHasPolyphagia] = useState<boolean | null>(null);
  const [hasPolydipsia, setHasPolydipsia] = useState<boolean | null>(null);
  const [hasPolyuria, setHasPolyuria] = useState<boolean | null>(null);
  const [hasRaisedBloodGlucose, setHasRaisedBloodGlucose] = useState<boolean | null>(null);
  const [fastingBloodSugarMgDl, setFastingBloodSugarMgDl] = useState('');
  const [fastingBloodSugarDate, setFastingBloodSugarDate] = useState('');
  const [hasRaisedBloodLipids, setHasRaisedBloodLipids] = useState<boolean | null>(null);
  const [totalCholesterolMgDl, setTotalCholesterolMgDl] = useState('');
  const [totalCholesterolDate, setTotalCholesterolDate] = useState('');
  const [urineKetonesPresent, setUrineKetonesPresent] = useState<boolean | null>(null);
  const [urineKetonesValue, setUrineKetonesValue] = useState('');
  const [urineKetonesDate, setUrineKetonesDate] = useState('');
  const [urineProteinPresent, setUrineProteinPresent] = useState<boolean | null>(null);
  const [urineProteinValue, setUrineProteinValue] = useState('');
  const [urineProteinDate, setUrineProteinDate] = useState('');

  // Section 5: Cardiovascular & Cerebrovascular Symptoms - NO DEFAULTING (null = unanswered)
  const [hasChestPain, setHasChestPain] = useState<boolean | null>(null);
  const [painInCenterOfChestOrLeftArm, setPainInCenterOfChestOrLeftArm] = useState<boolean | null>(null);
  const [painWhenWalkingUphill, setPainWhenWalkingUphill] = useState<boolean | null>(null);
  const [slowsDownWhenPainOccurs, setSlowsDownWhenPainOccurs] = useState<boolean | null>(null);
  const [painRelievedWithin10Mins, setPainRelievedWithin10Mins] = useState<boolean | null>(null);
  const [painRelievedByNitrates, setPainRelievedByNitrates] = useState<boolean | null>(null);
  const [severeChestPainOver30Mins, setSevereChestPainOver30Mins] = useState<boolean | null>(null);
  const [transientNeurologicalDeficits, setTransientNeurologicalDeficits] = useState<boolean | null>(null);
  const [hasHistoryAnginaHeartAttack, setHasHistoryAnginaHeartAttack] = useState<boolean | null>(null);
  const [hasHistoryStrokeOrTia, setHasHistoryStrokeOrTia] = useState<boolean | null>(null);

  const markUserEdited = useCallback((kind: 'discrete' | 'text') => {
    if (!canWritePatients) return;
    lastEditKindRef.current = kind;
    setAutoSaveStatus('saving');
    setAutoSaveError(null);
    setUserEditVersion((v) => v + 1);
  }, [canWritePatients]);

  // Extract vitals and smoking status for clinical CVD calculation
  const pAny = patient as any;
  const latestVitals = pAny.vitalsHistory && pAny.vitalsHistory.length > 0 ? pAny.vitalsHistory[0] : null;
  const isSmoker = pAny.socialHistory?.isSmoker ?? false;

  // Real-time calculation using the official cardiovascular risk stratification engine
  const cvdCalc = useMemo(() => {
    return calculatePhilPenRisk({
      ageYears: patient.age,
      sex: patient.sex,
      isSmoker,
      systolicBp: latestVitals?.systolicBp,
      diastolicBp: latestVitals?.diastolicBp,
      diagnosedDiabetes: diagnosedDiabetes === true,
      fastingBloodSugarMgDl: parseFloat(fastingBloodSugarMgDl) || undefined,
      totalCholesterolMgDl: parseFloat(totalCholesterolMgDl) || undefined,
      bodyMassIndex: latestVitals?.bmi,
      hasAnginaOrHeartAttack: hasHistoryAnginaHeartAttack === true,
      hasStrokeOrTia: hasHistoryStrokeOrTia === true,
      severeChestPainOver30Mins: severeChestPainOver30Mins === true,
      transientNeurologicalDeficits: transientNeurologicalDeficits === true,
    });
  }, [
    patient.age,
    patient.sex,
    isSmoker,
    latestVitals?.systolicBp,
    latestVitals?.diastolicBp,
    latestVitals?.bmi,
    diagnosedDiabetes,
    fastingBloodSugarMgDl,
    totalCholesterolMgDl,
    hasHistoryAnginaHeartAttack,
    hasHistoryStrokeOrTia,
    severeChestPainOver30Mins,
    transientNeurologicalDeficits,
  ]);

  const effectiveRiskBand: RiskBandType = cvdCalc.crisisOverrideApplied
    ? 'BandE'
    : !isManuallyOverridden
      ? cvdCalc.riskBand
      : riskBand;

  const effectiveRiskScorePercent: string = !isManuallyOverridden
    ? String(cvdCalc.calculatedScorePercent)
    : riskScorePercent;

  // Real-time typing sync: typing "15" immediately converts to Band B (10-<20%)
  const handleRiskPercentageChange = (txt: string) => {
    setRiskScorePercent(txt);
    setIsManuallyOverridden(true);
    const parsed = parseFloat(txt);
    if (!isNaN(parsed) && parsed >= 0) {
      const derivedBand = percentageToRiskBand(parsed);
      setRiskBand(derivedBand);
    }
    markUserEdited('text');
  };

  // Clicking a risk band chip syncs riskBand and representative midpoint percentage
  const handleBandSelect = (bandKey: RiskBandType) => {
    setRiskBand(bandKey);
    setIsManuallyOverridden(true);
    const parsed = parseFloat(riskScorePercent);
    if (isNaN(parsed) || percentageToRiskBand(parsed) !== bandKey) {
      setRiskScorePercent(String(RISK_BAND_MIDPOINTS[bandKey]));
    }
    markUserEdited('discrete');
  };

  // One-click apply from calculated clinical risk score
  const handleApplyCalculatedRisk = () => {
    setIsManuallyOverridden(false);
    setRiskBand(cvdCalc.riskBand);
    setRiskScorePercent(String(cvdCalc.calculatedScorePercent));
    markUserEdited('discrete');
  };

  const syncTodaySessionId = (active: NcdRiskAssessment[]) => {
    if (active.length === 0) {
      sessionAssessmentIdRef.current = null;
      return;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const latest = active[0];
    const latestDate = (latest.assessmentDate || latest.createdAt || '').split('T')[0];
    sessionAssessmentIdRef.current = latestDate === todayStr ? latest.id : null;
  };

  const populateLatest = (data: NcdRiskAssessment) => {
    if (data.riskBand && data.riskBand in RISK_BAND_META) {
      setRiskBand(data.riskBand as RiskBandType);
    }
    setRiskScorePercent(data.calculatedRiskScorePercent != null ? String(data.calculatedRiskScorePercent) : '');
    setIsManuallyOverridden(true);
    if (data.assessedByStaffName && data.assessedByStaffName !== 'Clinician') {
      setAssessedByStaffName(data.assessedByStaffName);
    } else if (authedClinicianName) {
      setAssessedByStaffName(authedClinicianName);
    } else {
      setAssessedByStaffName(data.assessedByStaffName || '');
    }

    const recDate = data.assessmentDate || data.createdAt;
    if (recDate) {
      setAssessmentDate(recDate.split('T')[0]);
    }
    const recSavedTimestamp = data.updatedAt || data.createdAt || null;
    if (recSavedTimestamp) {
      setLastSavedAt(recSavedTimestamp);
    }

    setRemarks(data.remarks || '');

    // Section 1
    setEatsProcessedFoodWeekly(data.eatsProcessedFoodWeekly != null ? !!data.eatsProcessedFoodWeekly : null);

    // Section 2
    setThreeServingsVegetablesDaily(data.threeServingsVegetablesDaily != null ? !!data.threeServingsVegetablesDaily : null);
    setTwoToThreeServingsFruitDaily(data.twoToThreeServingsFruitDaily != null ? !!data.twoToThreeServingsFruitDaily : null);

    // Section 3
    setPhysicalActivityAtLeast150MinsWeekly(data.physicalActivityAtLeast150MinsWeekly != null ? !!data.physicalActivityAtLeast150MinsWeekly : null);

    // Section 4
    const isDiabetic = data.diagnosedDiabetes != null
      ? (data.diagnosedDiabetes === 'Y' || (data.diagnosedDiabetes as any) === true)
      : null;
    setDiagnosedDiabetes(isDiabetic);
    setDiabetesMedicationStatus(data.diabetesMedicationStatus === 'Y' ? 'Y' : (data.diabetesMedicationStatus === 'N' ? 'N' : null));
    setHasPolyphagia(data.hasPolyphagia != null ? !!data.hasPolyphagia : null);
    setHasPolydipsia(data.hasPolydipsia != null ? !!data.hasPolydipsia : null);
    setHasPolyuria(data.hasPolyuria != null ? !!data.hasPolyuria : null);

    const hasFbsVal = data.fastingBloodSugarMgDl != null && data.fastingBloodSugarMgDl > 0;
    setHasRaisedBloodGlucose(data.hasRaisedBloodGlucose != null ? !!data.hasRaisedBloodGlucose : (hasFbsVal ? true : null));
    setFastingBloodSugarMgDl(data.fastingBloodSugarMgDl != null ? String(data.fastingBloodSugarMgDl) : '');
    setFastingBloodSugarDate(data.fastingBloodSugarDate ? data.fastingBloodSugarDate.split('T')[0] : '');

    const hasCholVal = data.totalCholesterolMgDl != null && data.totalCholesterolMgDl > 0;
    setHasRaisedBloodLipids(data.hasRaisedBloodLipids != null ? !!data.hasRaisedBloodLipids : (hasCholVal ? true : null));
    setTotalCholesterolMgDl(data.totalCholesterolMgDl != null ? String(data.totalCholesterolMgDl) : '');
    setTotalCholesterolDate(data.totalCholesterolDate ? data.totalCholesterolDate.split('T')[0] : '');

    const hasKetonesVal = !!data.urineKetonesValue && data.urineKetonesValue !== 'Negative';
    setUrineKetonesPresent(data.urineKetonesPresent != null ? !!data.urineKetonesPresent : (hasKetonesVal ? true : null));
    setUrineKetonesValue(data.urineKetonesValue || '');
    setUrineKetonesDate(data.urineKetonesDate ? data.urineKetonesDate.split('T')[0] : '');

    const hasProteinVal = !!data.urineProteinValue && data.urineProteinValue !== 'Negative';
    setUrineProteinPresent(data.urineProteinPresent != null ? !!data.urineProteinPresent : (hasProteinVal ? true : null));
    setUrineProteinValue(data.urineProteinValue || '');
    setUrineProteinDate(data.urineProteinDate ? data.urineProteinDate.split('T')[0] : '');

    // Section 5
    const chestPainAffirmative = data.hasChestPain != null
      ? !!data.hasChestPain
      : (data.painInCenterOfChestOrLeftArm != null || data.painWhenWalkingUphill != null ? true : null);
    setHasChestPain(chestPainAffirmative);
    setPainInCenterOfChestOrLeftArm(data.painInCenterOfChestOrLeftArm != null ? !!data.painInCenterOfChestOrLeftArm : null);
    setPainWhenWalkingUphill(data.painWhenWalkingUphill != null ? !!data.painWhenWalkingUphill : null);
    setSlowsDownWhenPainOccurs(data.slowsDownWhenPainOccurs != null ? !!data.slowsDownWhenPainOccurs : null);
    setPainRelievedWithin10Mins(data.painRelievedWithin10Mins != null ? !!data.painRelievedWithin10Mins : null);
    setPainRelievedByNitrates(data.painRelievedByNitrates != null ? !!data.painRelievedByNitrates : null);

    setSevereChestPainOver30Mins(data.severeChestPainOver30Mins != null ? !!data.severeChestPainOver30Mins : null);
    setTransientNeurologicalDeficits(data.transientNeurologicalDeficits != null ? !!data.transientNeurologicalDeficits : null);
    setHasHistoryAnginaHeartAttack(data.hasHistoryAnginaHeartAttack != null ? !!data.hasHistoryAnginaHeartAttack : null);
    setHasHistoryStrokeOrTia(data.hasHistoryStrokeOrTia != null ? !!data.hasHistoryStrokeOrTia : null);
  };

  const isRecordAuthor = (a: NcdRiskAssessment) => {
    if (authedStaffId && a.assessedByStaffId && a.assessedByStaffId === authedStaffId) return true;
    if (authedStaffId && a.createdBy && a.createdBy === authedStaffId) return true;
    if (
      authedClinicianName &&
      a.assessedByStaffName &&
      a.assessedByStaffName.trim().toLowerCase() === authedClinicianName.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  };

  const activeAssessments = useMemo(() => assessments.filter((a) => !a.isDeleted), [assessments]);
  const voidedAssessments = useMemo(() => assessments.filter((a) => a.isDeleted), [assessments]);

  // Pure clean reset: NO DEFAULTING, NO ASSUMPTIONS (all start as null)
  const resetToDefaultForm = () => {
    setEditingAssessmentId(null);
    sessionAssessmentIdRef.current = null;
    lastSavedPayloadJsonRef.current = null;
    setRiskBand(cvdCalc.riskBand);
    setRiskScorePercent(String(cvdCalc.calculatedScorePercent));
    setIsManuallyOverridden(false);
    setAssessmentDate(new Date().toISOString().split('T')[0]);
    setAssessedByStaffName(authedClinicianName);
    setRemarks('');

    // Section 1
    setEatsProcessedFoodWeekly(null);

    // Section 2
    setThreeServingsVegetablesDaily(null);
    setTwoToThreeServingsFruitDaily(null);

    // Section 3
    setPhysicalActivityAtLeast150MinsWeekly(null);

    // Section 4
    setDiagnosedDiabetes(null);
    setDiabetesMedicationStatus(null);
    setHasPolyphagia(null);
    setHasPolydipsia(null);
    setHasPolyuria(null);
    setHasRaisedBloodGlucose(null);
    setFastingBloodSugarMgDl('');
    setFastingBloodSugarDate('');
    setHasRaisedBloodLipids(null);
    setTotalCholesterolMgDl('');
    setTotalCholesterolDate('');
    setUrineKetonesPresent(null);
    setUrineKetonesValue('');
    setUrineKetonesDate('');
    setUrineProteinPresent(null);
    setUrineProteinValue('');
    setUrineProteinDate('');

    // Section 5
    setHasChestPain(null);
    setPainInCenterOfChestOrLeftArm(null);
    setPainWhenWalkingUphill(null);
    setSlowsDownWhenPainOccurs(null);
    setPainRelievedWithin10Mins(null);
    setPainRelievedByNitrates(null);
    setSevereChestPainOver30Mins(null);
    setTransientNeurologicalDeficits(null);
    setHasHistoryAnginaHeartAttack(null);
    setHasHistoryStrokeOrTia(null);
  };

  const handleStartEdit = (assessment: NcdRiskAssessment) => {
    if (!canWritePatients) return;
    resetAutoSaveTracking();
    setEditingAssessmentId(assessment.id);
    populateLatest(assessment);
  };

  const handleCancelEdit = () => {
    resetAutoSaveTracking();
    setEditingAssessmentId(null);
    if (activeAssessments.length > 0) {
      syncTodaySessionId(activeAssessments);
      populateLatest(activeAssessments[0]);
    } else {
      resetToDefaultForm();
    }
  };

  const handleOpenVoidModal = (assessment: NcdRiskAssessment) => {
    if (!canWritePatients) return;
    setVoidingAssessment(assessment);
    setVoidReason('Duplicate entry');
    setCustomVoidNotes('');
    setVoidModalVisible(true);
  };

  const handleConfirmVoid = async () => {
    if (!canWritePatients) return;
    if (!voidingAssessment) return;
    setVoidingSubmitting(true);
    try {
      const fullReason = customVoidNotes.trim()
        ? `${voidReason}: ${customVoidNotes.trim()}`
        : voidReason;

      const [, err] = await clinicService.voidNcdRiskAssessment(
        patient.id,
        voidingAssessment.id,
        fullReason
      );

      if (err) {
        Alert.alert('Unable to void assessment', err.message || 'An error occurred while voiding.');
      } else {
        Alert.alert('Success', 'Assessment has been marked as entered in error.');
        setVoidModalVisible(false);
        if (editingAssessmentId === voidingAssessment.id) {
          setEditingAssessmentId(null);
        }
        if (sessionAssessmentIdRef.current === voidingAssessment.id) {
          sessionAssessmentIdRef.current = null;
        }
        resetAutoSaveTracking();
        await fetchAssessments();
        onRefreshChartRef.current?.();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unexpected error voiding assessment.');
    } finally {
      setVoidingSubmitting(false);
    }
  };

  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, err] = await clinicService.getNcdRiskAssessments(patient.id, true);
      if (data) {
        setAssessments(data);
        const active = data.filter((a) => !a.isDeleted);
        syncTodaySessionId(active);
        if (active.length > 0) {
          if (!editingAssessmentId) {
            populateLatest(active[0]);
          }
        } else {
          resetToDefaultForm();
        }
      } else if (err) {
        setError(err.message || 'Unable to load cardiometabolic risk assessments.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load cardiometabolic risk assessments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    resetAutoSaveTracking();
    sessionAssessmentIdRef.current = null;
    setLastSavedAt(
      initialLatestAssessment?.updatedAt ?? initialLatestAssessment?.createdAt ?? null
    );

    if (initialLatestAssessment) {
      setAssessments([initialLatestAssessment]);
      syncTodaySessionId(initialLatestAssessment.isDeleted ? [] : [initialLatestAssessment]);
      populateLatest(initialLatestAssessment);
    } else {
      fetchAssessments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  // Keep risk band synchronized with live computation whenever not manually overridden
  useEffect(() => {
    if (!isManuallyOverridden) {
      setRiskBand(cvdCalc.riskBand);
      setRiskScorePercent(String(cvdCalc.calculatedScorePercent));
    }
  }, [isManuallyOverridden, cvdCalc.riskBand, cvdCalc.calculatedScorePercent]);

  // When a crisis override occurs (established CVD / stroke / emergency), auto-elevate to Band E
  useEffect(() => {
    if (cvdCalc.crisisOverrideApplied) {
      setRiskBand('BandE');
      if (!isManuallyOverridden || !riskScorePercent) {
        setRiskScorePercent(String(cvdCalc.calculatedScorePercent));
      }
    }
  }, [cvdCalc.crisisOverrideApplied, cvdCalc.calculatedScorePercent, isManuallyOverridden, riskScorePercent]);

  const currentSnapshot: NcdFormSnapshot = {
    riskBand: effectiveRiskBand,
    riskScorePercent: effectiveRiskScorePercent,
    assessmentDate,
    assessedByStaffId: authedStaffId,
    assessedByStaffName,
    authedClinicianName,
    remarks,
    eatsProcessedFoodWeekly,
    threeServingsVegetablesDaily,
    twoToThreeServingsFruitDaily,
    physicalActivityAtLeast150MinsWeekly,
    diagnosedDiabetes,
    diabetesMedicationStatus,
    hasPolyphagia,
    hasPolydipsia,
    hasPolyuria,
    hasRaisedBloodGlucose,
    fastingBloodSugarMgDl,
    fastingBloodSugarDate,
    hasRaisedBloodLipids,
    totalCholesterolMgDl,
    totalCholesterolDate,
    urineKetonesPresent,
    urineKetonesValue,
    urineKetonesDate,
    urineProteinPresent,
    urineProteinValue,
    urineProteinDate,
    hasChestPain,
    painInCenterOfChestOrLeftArm,
    painWhenWalkingUphill,
    slowsDownWhenPainOccurs,
    painRelievedWithin10Mins,
    painRelievedByNitrates,
    severeChestPainOver30Mins,
    transientNeurologicalDeficits,
    hasHistoryAnginaHeartAttack,
    hasHistoryStrokeOrTia,
  };

  const latestSnapshotRef = useRef<NcdFormSnapshot>(currentSnapshot);
  latestSnapshotRef.current = currentSnapshot;
  const editingAssessmentIdRef = useRef<string | null>(editingAssessmentId);
  editingAssessmentIdRef.current = editingAssessmentId;

  const questionProgress = useMemo(
    () => countNcdQuestionProgress(currentSnapshot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      eatsProcessedFoodWeekly,
      threeServingsVegetablesDaily,
      twoToThreeServingsFruitDaily,
      physicalActivityAtLeast150MinsWeekly,
      diagnosedDiabetes,
      diabetesMedicationStatus,
      hasPolyphagia,
      hasPolydipsia,
      hasPolyuria,
      hasRaisedBloodGlucose,
      fastingBloodSugarMgDl,
      hasRaisedBloodLipids,
      totalCholesterolMgDl,
      urineKetonesPresent,
      urineKetonesValue,
      urineProteinPresent,
      urineProteinValue,
      hasChestPain,
      painInCenterOfChestOrLeftArm,
      painWhenWalkingUphill,
      slowsDownWhenPainOccurs,
      painRelievedWithin10Mins,
      painRelievedByNitrates,
      severeChestPainOver30Mins,
      transientNeurologicalDeficits,
      hasHistoryAnginaHeartAttack,
      hasHistoryStrokeOrTia,
    ]
  );

  const performAutoSave = useCallback(async () => {
    if (!canWritePatients) return;

    const { payload, isMidTypingDate, validationError } = buildNcdAssessmentPayload(
      latestSnapshotRef.current
    );

    if (isMidTypingDate) {
      return;
    }

    if (validationError) {
      setAutoSaveStatus('error');
      setAutoSaveError(validationError);
      return;
    }

    const targetId = editingAssessmentIdRef.current || sessionAssessmentIdRef.current;
    const savingEditVersion = userEditVersionRef.current;
    const payloadKey = JSON.stringify({ targetId: targetId || null, payload });

    if (payloadKey === lastSavedPayloadJsonRef.current) {
      lastSavedEditVersionRef.current = Math.max(
        lastSavedEditVersionRef.current,
        savingEditVersion
      );
      if (!lastSavedAtRef.current) {
        setLastSavedAt(new Date().toISOString());
      }
      setAutoSaveStatus('saved');
      setAutoSaveError(null);
      return;
    }

    if (inFlightSaveRef.current) {
      pendingResaveRef.current = true;
      return;
    }

    inFlightSaveRef.current = true;
    setAutoSaveStatus('saving');
    setAutoSaveError(null);

    try {
      if (targetId) {
        const [updated, err] = await clinicService.updateNcdRiskAssessment(
          patient.id,
          targetId,
          payload
        );
        if (err) {
          setAutoSaveStatus('error');
          setAutoSaveError(err.message || 'Failed to save changes.');
        } else {
          if (updated) {
            setAssessments((prev) =>
              prev.some((a) => a.id === updated.id)
                ? prev.map((a) => (a.id === updated.id ? updated : a))
                : [updated, ...prev]
            );
          }
          const savedIso = updated?.updatedAt || new Date().toISOString();
          setLastSavedAt(savedIso);
          lastSavedPayloadJsonRef.current = JSON.stringify({ targetId, payload });
          lastSavedEditVersionRef.current = Math.max(
            lastSavedEditVersionRef.current,
            savingEditVersion
          );
          setAutoSaveStatus('saved');
          onRefreshChartRef.current?.();
        }
      } else {
        const [created, err] = await clinicService.saveNcdRiskAssessment(patient.id, payload);
        if (err) {
          setAutoSaveStatus('error');
          setAutoSaveError(err.message || 'Failed to save changes.');
        } else {
          const savedId = created?.id || null;
          if (created) {
            sessionAssessmentIdRef.current = created.id;
            setAssessments((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
          }
          const savedIso = created?.updatedAt || created?.createdAt || new Date().toISOString();
          setLastSavedAt(savedIso);
          lastSavedPayloadJsonRef.current = JSON.stringify({ targetId: savedId, payload });
          lastSavedEditVersionRef.current = Math.max(
            lastSavedEditVersionRef.current,
            savingEditVersion
          );
          setAutoSaveStatus('saved');
          onRefreshChartRef.current?.();
        }
      }
    } catch (e: any) {
      setAutoSaveStatus('error');
      setAutoSaveError(e?.message || 'Unexpected error saving changes.');
    } finally {
      inFlightSaveRef.current = false;
      const shouldResave =
        pendingResaveRef.current && userEditVersionRef.current > savingEditVersion;
      pendingResaveRef.current = false;
      if (shouldResave) {
        void performAutoSaveRef.current();
      }
    }
  }, [canWritePatients, patient.id]);

  const performAutoSaveRef = useRef(performAutoSave);
  performAutoSaveRef.current = performAutoSave;

  useEffect(() => {
    if (
      userEditVersion === 0 ||
      userEditVersion <= lastSavedEditVersionRef.current ||
      !canWritePatients
    ) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const delayMs = lastEditKindRef.current === 'discrete' ? 250 : 600;
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void performAutoSaveRef.current();
    }, delayMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // Trigger auto-save strictly when userEditVersion increments from an explicit user edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEditVersion]);

  const currentMeta = RISK_BAND_META[effectiveRiskBand];

  const formatLastSavedBadge = useCallback(
    (iso?: string | null): string | null => {
      if (!iso) return null;
      const formatted = formatClinicDateTime(iso, {
        dateFormat,
        timeFormat,
        timeZoneId,
        fallback: '',
      });
      return formatted ? `Last saved ${formatted}` : null;
    },
    [dateFormat, timeFormat, timeZoneId]
  );

  const lastSavedBadgeLabel = formatLastSavedBadge(lastSavedAt);

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonList rows={6} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="Could not load cardiometabolic risk assessment"
          message={error}
          onRetry={fetchAssessments}
        />
      </View>
    );
  }

  const renderSaveStatusBadge = () => {
    if (!canWritePatients && !lastSavedBadgeLabel) return null;
    if (autoSaveStatus === 'saving') {
      return <Badge label="Saving changes…" variant="warning" size="sm" icon="clock" />;
    }
    if (autoSaveStatus === 'saved') {
      return (
        <Badge
          label={lastSavedBadgeLabel || 'All changes saved'}
          variant="success"
          size="sm"
          icon="checkCircle"
        />
      );
    }
    if (autoSaveStatus === 'error') {
      return (
        <Button
          variant="dangerOutline"
          size="xs"
          icon="alertCircle"
          title="Autosave failed • Retry"
          accessibilityLabel="Retry saving changes"
          onPress={() => void performAutoSave()}
        />
      );
    }
    if (lastSavedBadgeLabel) {
      return <Badge label={lastSavedBadgeLabel} variant="routine" size="sm" icon="checkCircle" />;
    }
    return <Badge label="Auto-save active" variant="routine" size="sm" icon="check" />;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!canWritePatients ? (
        <View style={styles.readOnlyBanner} accessibilityRole="alert">
          <Icon name="lock" size={theme.sizes.iconSm} color={theme.colors.warningText} />
          <ThemedText variant="small" color={theme.colors.warningText} style={{ flex: 1 }}>
            Read-only mode: &apos;patients:write&apos; permission is required to save cardiometabolic &amp; NCD assessments.
          </ThemedText>
        </View>
      ) : null}

      {/* Explicit Clinical Governance & Auto-Save Status Bar */}
      <View style={styles.explicitNoticeBanner}>
        <View style={styles.noticeLeftRow}>
          <Icon name="info" size={16} color={theme.colors.primaryDark} />
          <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={{ flex: 1 }}>
            All questions must be explicitly answered. No answers are assumed or defaulted.
          </ThemedText>
        </View>
        <View style={styles.noticeStatusRow}>
          <Badge
            label={`${questionProgress.answeredCount}/${questionProgress.totalRequiredCount} Answered`}
            variant={
              questionProgress.answeredCount === questionProgress.totalRequiredCount
                ? 'success'
                : 'neutral'
            }
            size="sm"
          />
          {renderSaveStatusBadge()}
        </View>
      </View>

      {autoSaveStatus === 'error' && autoSaveError ? (
        <View style={styles.autoSaveErrorBanner} accessibilityRole="alert">
          <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
          <ThemedText variant="small" color={theme.colors.emergencyText} style={{ flex: 1 }}>
            {autoSaveError}
          </ThemedText>
          <Button
            title="Retry"
            variant="outline"
            size="sm"
            onPress={() => void performAutoSave()}
          />
        </View>
      ) : null}

      {/* Editing Banner */}
      {editingAssessmentId && (
        <View style={styles.editingBanner}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="edit" size={18} color={theme.colors.primaryDark} />
            <View style={{ flex: 1 }}>
              <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                Editing Prior Assessment ({assessmentDate || 'Recorded'})
              </ThemedText>
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                Changes auto-save directly to this existing record rather than creating a duplicate.
              </ThemedText>
            </View>
          </View>
          <Button
            title="Done Editing"
            variant="ghost"
            size="sm"
            onPress={handleCancelEdit}
          />
        </View>
      )}

      {/* SECTION 1: Dietary Fat & Sodium Intake */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Dietary Fat & Sodium Intake</ThemedText>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Consumes processed foods, canned meals, or instant noodles weekly
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, eatsProcessedFoodWeekly === false && styles.toggleBtnActive]}
              onPress={() => {
                setEatsProcessedFoodWeekly(eatsProcessedFoodWeekly === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={eatsProcessedFoodWeekly === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, eatsProcessedFoodWeekly === true && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setEatsProcessedFoodWeekly(eatsProcessedFoodWeekly === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={eatsProcessedFoodWeekly === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      {/* SECTION 2: Dietary Fiber & Nutrition */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Dietary Fiber & Nutrition</ThemedText>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Consumes at least 3 servings of vegetables daily
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, threeServingsVegetablesDaily === false && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setThreeServingsVegetablesDaily(threeServingsVegetablesDaily === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={threeServingsVegetablesDaily === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, threeServingsVegetablesDaily === true && styles.toggleBtnActive]}
              onPress={() => {
                setThreeServingsVegetablesDaily(threeServingsVegetablesDaily === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={threeServingsVegetablesDaily === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Consumes 2 to 3 servings of fresh fruit daily
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, twoToThreeServingsFruitDaily === false && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setTwoToThreeServingsFruitDaily(twoToThreeServingsFruitDaily === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={twoToThreeServingsFruitDaily === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, twoToThreeServingsFruitDaily === true && styles.toggleBtnActive]}
              onPress={() => {
                setTwoToThreeServingsFruitDaily(twoToThreeServingsFruitDaily === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={twoToThreeServingsFruitDaily === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      {/* SECTION 3: Physical Activity */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Physical Activity</ThemedText>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Engages in at least 150 minutes of moderate-intensity physical activity weekly
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, physicalActivityAtLeast150MinsWeekly === false && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setPhysicalActivityAtLeast150MinsWeekly(physicalActivityAtLeast150MinsWeekly === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={physicalActivityAtLeast150MinsWeekly === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, physicalActivityAtLeast150MinsWeekly === true && styles.toggleBtnActive]}
              onPress={() => {
                setPhysicalActivityAtLeast150MinsWeekly(physicalActivityAtLeast150MinsWeekly === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={physicalActivityAtLeast150MinsWeekly === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      {/* SECTION 4: Diabetes & Metabolic Assessment */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Diabetes & Metabolic Assessment</ThemedText>

        {/* Diagnosed Diabetes (Gate Question) */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Previously diagnosed with diabetes mellitus
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, diagnosedDiabetes === false && styles.toggleBtnActive]}
              onPress={() => {
                setDiagnosedDiabetes(diagnosedDiabetes === false ? null : false);
                setDiabetesMedicationStatus(null);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={diagnosedDiabetes === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, diagnosedDiabetes === true && styles.toggleBtnActiveEmergency]}
              onPress={() => {
                setDiagnosedDiabetes(diagnosedDiabetes === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={diagnosedDiabetes === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Progressive Disclosure: Diabetes Medication Follow-up */}
        {diagnosedDiabetes === true && (
          <View style={styles.nestedContainer}>
            <View style={styles.switchRow}>
              <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
                Currently taking prescribed diabetes medication (oral anti-hyperglycemic agents or insulin)
              </ThemedText>
              <View style={styles.toggleRow}>
                <Pressable
                  disabled={!canWritePatients}
                  style={[styles.toggleBtn, diabetesMedicationStatus === 'N' && styles.toggleBtnActive]}
                  onPress={() => {
                    setDiabetesMedicationStatus(diabetesMedicationStatus === 'N' ? null : 'N');
                    markUserEdited('discrete');
                  }}
                >
                  <ThemedText variant="smallBold" color={diabetesMedicationStatus === 'N' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                    No
                  </ThemedText>
                </Pressable>
                <Pressable
                  disabled={!canWritePatients}
                  style={[styles.toggleBtn, diabetesMedicationStatus === 'Y' && styles.toggleBtnActive]}
                  onPress={() => {
                    setDiabetesMedicationStatus(diabetesMedicationStatus === 'Y' ? null : 'Y');
                    markUserEdited('discrete');
                  }}
                >
                  <ThemedText variant="smallBold" color={diabetesMedicationStatus === 'Y' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                    Yes
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Hyperglycemic Symptoms */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Experiences excessive hunger (Polyphagia)
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasPolyphagia === false && styles.toggleBtnActive]}
              onPress={() => {
                setHasPolyphagia(hasPolyphagia === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasPolyphagia === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasPolyphagia === true && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setHasPolyphagia(hasPolyphagia === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasPolyphagia === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Experiences excessive thirst (Polydipsia)
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasPolydipsia === false && styles.toggleBtnActive]}
              onPress={() => {
                setHasPolydipsia(hasPolydipsia === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasPolydipsia === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasPolydipsia === true && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setHasPolydipsia(hasPolydipsia === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasPolydipsia === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Experiences frequent nighttime urination (Polyuria)
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasPolyuria === false && styles.toggleBtnActive]}
              onPress={() => {
                setHasPolyuria(hasPolyuria === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasPolyuria === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasPolyuria === true && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setHasPolyuria(hasPolyuria === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasPolyuria === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Elevated Blood Glucose & Biomarker */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Elevated blood glucose (Hyperglycemia) observed or reported
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasRaisedBloodGlucose === false && styles.toggleBtnActive]}
              onPress={() => {
                setHasRaisedBloodGlucose(hasRaisedBloodGlucose === false ? null : false);
                setFastingBloodSugarMgDl('');
                setFastingBloodSugarDate('');
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasRaisedBloodGlucose === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasRaisedBloodGlucose === true && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setHasRaisedBloodGlucose(hasRaisedBloodGlucose === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasRaisedBloodGlucose === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Progressive Disclosure: Fasting Blood Sugar Inputs */}
        {(hasRaisedBloodGlucose === true || (parseFloat(fastingBloodSugarMgDl) > 0)) && (
          <View style={styles.nestedContainer}>
            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Fasting Blood Sugar (mg/dL)"
                  placeholder="e.g. 105"
                  value={fastingBloodSugarMgDl}
                  editable={canWritePatients}
                  onChangeText={(txt) => {
                    setFastingBloodSugarMgDl(txt);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridItem}>
                <ValidatedDateInput
                  label="FBS Test Date"
                  placeholder="YYYY-MM-DD"
                  value={fastingBloodSugarDate}
                  disabled={!canWritePatients}
                  onChangeText={(txt) => {
                    setFastingBloodSugarDate(txt);
                    markUserEdited('text');
                  }}
                  boundaryMode="pastOrToday"
                />
              </View>
            </View>
          </View>
        )}

        {/* Elevated Lipids & Biomarker */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Elevated blood lipids (Dyslipidemia) observed or reported
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasRaisedBloodLipids === false && styles.toggleBtnActive]}
              onPress={() => {
                setHasRaisedBloodLipids(hasRaisedBloodLipids === false ? null : false);
                setTotalCholesterolMgDl('');
                setTotalCholesterolDate('');
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasRaisedBloodLipids === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasRaisedBloodLipids === true && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setHasRaisedBloodLipids(hasRaisedBloodLipids === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasRaisedBloodLipids === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Progressive Disclosure: Total Cholesterol Inputs */}
        {(hasRaisedBloodLipids === true || (parseFloat(totalCholesterolMgDl) > 0)) && (
          <View style={styles.nestedContainer}>
            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Total Cholesterol (mg/dL)"
                  placeholder="e.g. 195"
                  value={totalCholesterolMgDl}
                  editable={canWritePatients}
                  onChangeText={(txt) => {
                    setTotalCholesterolMgDl(txt);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridItem}>
                <ValidatedDateInput
                  label="Cholesterol Test Date"
                  placeholder="YYYY-MM-DD"
                  value={totalCholesterolDate}
                  disabled={!canWritePatients}
                  onChangeText={(txt) => {
                    setTotalCholesterolDate(txt);
                    markUserEdited('text');
                  }}
                  boundaryMode="pastOrToday"
                />
              </View>
            </View>
          </View>
        )}

        {/* Urinalysis Ketones & Biomarker */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Elevated urine ketones detected on dipstick
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, urineKetonesPresent === false && styles.toggleBtnActive]}
              onPress={() => {
                setUrineKetonesPresent(urineKetonesPresent === false ? null : false);
                setUrineKetonesValue('');
                setUrineKetonesDate('');
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={urineKetonesPresent === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, urineKetonesPresent === true && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setUrineKetonesPresent(urineKetonesPresent === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={urineKetonesPresent === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Progressive Disclosure: Ketones Result Inputs */}
        {urineKetonesPresent === true && (
          <View style={styles.nestedContainer}>
            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Urine Ketones Result"
                  placeholder="e.g. Negative, Trace, 1+, 2+"
                  value={urineKetonesValue}
                  editable={canWritePatients}
                  onChangeText={(txt) => {
                    setUrineKetonesValue(txt);
                    markUserEdited('text');
                  }}
                />
              </View>
              <View style={styles.gridItem}>
                <ValidatedDateInput
                  label="Ketones Test Date"
                  placeholder="YYYY-MM-DD"
                  value={urineKetonesDate}
                  disabled={!canWritePatients}
                  onChangeText={(txt) => {
                    setUrineKetonesDate(txt);
                    markUserEdited('text');
                  }}
                  boundaryMode="pastOrToday"
                />
              </View>
            </View>
          </View>
        )}

        {/* Urinalysis Protein & Biomarker */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Proteinuria detected on dipstick
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, urineProteinPresent === false && styles.toggleBtnActive]}
              onPress={() => {
                setUrineProteinPresent(urineProteinPresent === false ? null : false);
                setUrineProteinValue('');
                setUrineProteinDate('');
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={urineProteinPresent === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, urineProteinPresent === true && styles.toggleBtnActiveWarning]}
              onPress={() => {
                setUrineProteinPresent(urineProteinPresent === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={urineProteinPresent === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Progressive Disclosure: Protein Result Inputs */}
        {urineProteinPresent === true && (
          <View style={styles.nestedContainer}>
            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Urine Protein Result"
                  placeholder="e.g. Negative, Trace, 1+, 2+"
                  value={urineProteinValue}
                  editable={canWritePatients}
                  onChangeText={(txt) => {
                    setUrineProteinValue(txt);
                    markUserEdited('text');
                  }}
                />
              </View>
              <View style={styles.gridItem}>
                <ValidatedDateInput
                  label="Protein Test Date"
                  placeholder="YYYY-MM-DD"
                  value={urineProteinDate}
                  disabled={!canWritePatients}
                  onChangeText={(txt) => {
                    setUrineProteinDate(txt);
                    markUserEdited('text');
                  }}
                  boundaryMode="pastOrToday"
                />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* SECTION 5: Cardiovascular & Cerebrovascular Symptoms */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Cardiovascular & Cerebrovascular Symptoms</ThemedText>

        {/* Primary Chest Pain Gate Question */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Experiences pain or heaviness in the chest
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasChestPain === false && styles.toggleBtnActive]}
              onPress={() => {
                setHasChestPain(hasChestPain === false ? null : false);
                setPainInCenterOfChestOrLeftArm(null);
                setPainWhenWalkingUphill(null);
                setSlowsDownWhenPainOccurs(null);
                setPainRelievedWithin10Mins(null);
                setPainRelievedByNitrates(null);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasChestPain === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasChestPain === true && styles.toggleBtnActiveEmergency]}
              onPress={() => {
                setHasChestPain(hasChestPain === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasChestPain === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Progressive Disclosure: Chest Pain Follow-ups (Only asked if chest pain is present) */}
        {hasChestPain === true && (
          <View style={styles.nestedContainer}>
            <View style={styles.switchRow}>
              <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
                Pain located in the center of the chest or radiating to left arm
              </ThemedText>
              <View style={styles.toggleRow}>
                <Pressable
                  disabled={!canWritePatients}
                  style={[styles.toggleBtn, painInCenterOfChestOrLeftArm === false && styles.toggleBtnActive]}
                  onPress={() => {
                    setPainInCenterOfChestOrLeftArm(painInCenterOfChestOrLeftArm === false ? null : false);
                    markUserEdited('discrete');
                  }}
                >
                  <ThemedText variant="smallBold" color={painInCenterOfChestOrLeftArm === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                    No
                  </ThemedText>
                </Pressable>
                <Pressable
                  disabled={!canWritePatients}
                  style={[styles.toggleBtn, painInCenterOfChestOrLeftArm === true && styles.toggleBtnActiveEmergency]}
                  onPress={() => {
                    setPainInCenterOfChestOrLeftArm(painInCenterOfChestOrLeftArm === true ? null : true);
                    markUserEdited('discrete');
                  }}
                >
                  <ThemedText variant="smallBold" color={painInCenterOfChestOrLeftArm === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                    Yes
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            {/* Exertional Angina Gate Question */}
            <View style={styles.switchRow}>
              <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
                Pain provoked or worsened by walking uphill or hurrying
              </ThemedText>
              <View style={styles.toggleRow}>
                <Pressable
                  disabled={!canWritePatients}
                  style={[styles.toggleBtn, painWhenWalkingUphill === false && styles.toggleBtnActive]}
                  onPress={() => {
                    setPainWhenWalkingUphill(painWhenWalkingUphill === false ? null : false);
                    setSlowsDownWhenPainOccurs(null);
                    setPainRelievedWithin10Mins(null);
                    setPainRelievedByNitrates(null);
                    markUserEdited('discrete');
                  }}
                >
                  <ThemedText variant="smallBold" color={painWhenWalkingUphill === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                    No
                  </ThemedText>
                </Pressable>
                <Pressable
                  disabled={!canWritePatients}
                  style={[styles.toggleBtn, painWhenWalkingUphill === true && styles.toggleBtnActiveEmergency]}
                  onPress={() => {
                    setPainWhenWalkingUphill(painWhenWalkingUphill === true ? null : true);
                    markUserEdited('discrete');
                  }}
                >
                  <ThemedText variant="smallBold" color={painWhenWalkingUphill === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                    Yes
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            {/* Second-Level Progressive Disclosure: Exertional Angina Characteristics */}
            {painWhenWalkingUphill === true && (
              <View style={styles.subNestedContainer}>
                <View style={styles.switchRow}>
                  <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
                    Pain forces patient to stop or slow down
                  </ThemedText>
                  <View style={styles.toggleRow}>
                    <Pressable
                      disabled={!canWritePatients}
                      style={[styles.toggleBtn, slowsDownWhenPainOccurs === false && styles.toggleBtnActive]}
                      onPress={() => {
                        setSlowsDownWhenPainOccurs(slowsDownWhenPainOccurs === false ? null : false);
                        markUserEdited('discrete');
                      }}
                    >
                      <ThemedText variant="smallBold" color={slowsDownWhenPainOccurs === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                        No
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      disabled={!canWritePatients}
                      style={[styles.toggleBtn, slowsDownWhenPainOccurs === true && styles.toggleBtnActiveEmergency]}
                      onPress={() => {
                        setSlowsDownWhenPainOccurs(slowsDownWhenPainOccurs === true ? null : true);
                        markUserEdited('discrete');
                      }}
                    >
                      <ThemedText variant="smallBold" color={slowsDownWhenPainOccurs === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                        Yes
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.switchRow}>
                  <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
                    Pain resolves completely within 10 minutes
                  </ThemedText>
                  <View style={styles.toggleRow}>
                    <Pressable
                      disabled={!canWritePatients}
                      style={[styles.toggleBtn, painRelievedWithin10Mins === false && styles.toggleBtnActive]}
                      onPress={() => {
                        setPainRelievedWithin10Mins(painRelievedWithin10Mins === false ? null : false);
                        markUserEdited('discrete');
                      }}
                    >
                      <ThemedText variant="smallBold" color={painRelievedWithin10Mins === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                        No
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      disabled={!canWritePatients}
                      style={[styles.toggleBtn, painRelievedWithin10Mins === true && styles.toggleBtnActive]}
                      onPress={() => {
                        setPainRelievedWithin10Mins(painRelievedWithin10Mins === true ? null : true);
                        markUserEdited('discrete');
                      }}
                    >
                      <ThemedText variant="smallBold" color={painRelievedWithin10Mins === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                        Yes
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.switchRow}>
                  <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
                    Pain is relieved by rest or sublingual nitroglycerin
                  </ThemedText>
                  <View style={styles.toggleRow}>
                    <Pressable
                      disabled={!canWritePatients}
                      style={[styles.toggleBtn, painRelievedByNitrates === false && styles.toggleBtnActive]}
                      onPress={() => {
                        setPainRelievedByNitrates(painRelievedByNitrates === false ? null : false);
                        markUserEdited('discrete');
                      }}
                    >
                      <ThemedText variant="smallBold" color={painRelievedByNitrates === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                        No
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      disabled={!canWritePatients}
                      style={[styles.toggleBtn, painRelievedByNitrates === true && styles.toggleBtnActive]}
                      onPress={() => {
                        setPainRelievedByNitrates(painRelievedByNitrates === true ? null : true);
                        markUserEdited('discrete');
                      }}
                    >
                      <ThemedText variant="smallBold" color={painRelievedByNitrates === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                        Yes
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Severe Persistent Chest Pain */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Severe, persistent chest pain lasting longer than 30 minutes
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, severeChestPainOver30Mins === false && styles.toggleBtnActive]}
              onPress={() => {
                setSevereChestPainOver30Mins(severeChestPainOver30Mins === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={severeChestPainOver30Mins === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, severeChestPainOver30Mins === true && styles.toggleBtnActiveEmergency]}
              onPress={() => {
                setSevereChestPainOver30Mins(severeChestPainOver30Mins === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={severeChestPainOver30Mins === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Acute Neurological Deficits / TIA */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Transient numbness, weakness, or acute focal neurological deficits
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, transientNeurologicalDeficits === false && styles.toggleBtnActive]}
              onPress={() => {
                setTransientNeurologicalDeficits(transientNeurologicalDeficits === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={transientNeurologicalDeficits === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, transientNeurologicalDeficits === true && styles.toggleBtnActiveEmergency]}
              onPress={() => {
                setTransientNeurologicalDeficits(transientNeurologicalDeficits === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={transientNeurologicalDeficits === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Documented History of CAD / MI */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Documented history of angina or myocardial infarction (heart attack)
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasHistoryAnginaHeartAttack === false && styles.toggleBtnActive]}
              onPress={() => {
                setHasHistoryAnginaHeartAttack(hasHistoryAnginaHeartAttack === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasHistoryAnginaHeartAttack === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasHistoryAnginaHeartAttack === true && styles.toggleBtnActiveEmergency]}
              onPress={() => {
                setHasHistoryAnginaHeartAttack(hasHistoryAnginaHeartAttack === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasHistoryAnginaHeartAttack === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Documented History of Stroke / TIA */}
        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Documented history of stroke or transient ischemic attack (TIA)
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasHistoryStrokeOrTia === false && styles.toggleBtnActive]}
              onPress={() => {
                setHasHistoryStrokeOrTia(hasHistoryStrokeOrTia === false ? null : false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasHistoryStrokeOrTia === false ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              disabled={!canWritePatients}
              style={[styles.toggleBtn, hasHistoryStrokeOrTia === true && styles.toggleBtnActiveEmergency]}
              onPress={() => {
                setHasHistoryStrokeOrTia(hasHistoryStrokeOrTia === true ? null : true);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={hasHistoryStrokeOrTia === true ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      {/* SECTION 6: 10-Year Cardiovascular Disease Risk Stratification */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <ThemedText variant="h3">10-Year Cardiovascular Disease Risk Stratification</ThemedText>
          {renderSaveStatusBadge()}
        </View>

        {/* Compact CVD Risk Band Card (scaled to match workstation typography) */}
        <View style={[styles.riskBandHeroCard, { backgroundColor: currentMeta.bg }]}>
          <View style={styles.riskBandHeroRow}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="captionBold" color={currentMeta.color}>
                WHO / ISH CARDIOMETABOLIC RISK STRATIFICATION
              </ThemedText>
              <ThemedText variant="title" color={currentMeta.color} style={{ marginTop: 2 }}>
                {currentMeta.label}
              </ThemedText>
              <ThemedText variant="captionBold" color={currentMeta.color}>
                {currentMeta.desc}
              </ThemedText>
            </View>
            <View style={[styles.bandScoreChip, { borderColor: currentMeta.color }]}>
              <ThemedText variant="captionBold" color={currentMeta.color}>
                {effectiveRiskScorePercent ? `${effectiveRiskScorePercent}%` : 'Risk Band'}
              </ThemedText>
            </View>
          </View>

          {/* Risk Band Selector Chips */}
          <View style={styles.bandSelectorWrap}>
            {(Object.keys(RISK_BAND_META) as RiskBandType[]).map((bandKey) => {
              const meta = RISK_BAND_META[bandKey];
              const isSelected = effectiveRiskBand === bandKey;
              return (
                <Pressable
                  key={bandKey}
                  disabled={!canWritePatients}
                  style={[
                    styles.bandChipBtn,
                    isSelected && { backgroundColor: meta.color },
                  ]}
                  onPress={() => handleBandSelect(bandKey)}
                >
                  <ThemedText
                    variant="captionBold"
                    color={isSelected ? theme.colors.onPrimary : theme.colors.textSecondary}
                  >
                    {bandKey.replace('Band', 'Band ')}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Crisis Override Alert */}
          {cvdCalc.crisisOverrideApplied && (
            <View style={styles.overrideAlertBanner}>
              <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.emergency} />
              <View style={{ flex: 1 }}>
                <ThemedText variant="captionBold" color={theme.colors.emergency}>
                  CLINICAL CRISIS OVERRIDE ACTIVE
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.emergency}>
                  {cvdCalc.overrideReason}
                </ThemedText>
              </View>
            </View>
          )}

          {/* Algorithm vs Manual Status Row */}
          <View style={styles.autoCalcRow}>
            <View style={styles.autoCalcInfo}>
              <Icon name="activity" size={14} color={currentMeta.color} />
              <ThemedText variant="caption" color={currentMeta.color}>
                Calculated Risk Score: <ThemedText variant="captionBold" color={currentMeta.color}>
                  {cvdCalc.riskBand.replace('Band', 'Band ')} ({cvdCalc.calculatedScorePercent}%)
                </ThemedText>
                {isManuallyOverridden ? ' • (Custom manual input)' : ' • (Live computed)'}
              </ThemedText>
            </View>
            {isManuallyOverridden && (
              <Button
                variant="outline"
                size="xs"
                icon="refresh"
                title="Auto-Calculate"
                disabled={!canWritePatients}
                onPress={handleApplyCalculatedRisk}
              />
            )}
          </View>
        </View>

        {/* Assessment Details & Clinician Signature */}
        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Assessed By (Staff / Clinician Name)"
              placeholder="e.g. Dr. Santos / Nurse Joy"
              value={assessedByStaffName}
              editable={canWritePatients}
              onChangeText={(txt) => {
                setAssessedByStaffName(txt);
                markUserEdited('text');
              }}
            />
          </View>
          <View style={styles.gridItem}>
            <ValidatedDateInput
              label="Assessment Date"
              placeholder="YYYY-MM-DD"
              value={assessmentDate}
              disabled={!canWritePatients}
              onChangeText={(txt) => {
                setAssessmentDate(txt);
                markUserEdited('text');
              }}
              boundaryMode="pastOrToday"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Specific Risk Percentage (%)"
              placeholder="e.g. 15"
              value={effectiveRiskScorePercent}
              editable={canWritePatients}
              onChangeText={handleRiskPercentageChange}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Clinical Remarks / Physician Assessment Notes */}
        <Input
          label="Clinical Remarks / Physician Assessment Notes"
          placeholder="Cardiometabolic recommendations, lifestyle interventions, or referral plans"
          value={remarks}
          editable={canWritePatients}
          onChangeText={(txt) => {
            setRemarks(txt);
            markUserEdited('text');
          }}
        />
      </View>

      {/* Auto-Save Footer Bar */}
      {canWritePatients ? (
        <View style={styles.autoSaveFooterBar} accessibilityLiveRegion="polite">
          <View style={styles.autoSaveFooterLeft}>
            <Icon
              name={
                autoSaveStatus === 'saving'
                  ? 'clock'
                  : autoSaveStatus === 'error'
                    ? 'alertCircle'
                    : 'checkCircle'
              }
              size={theme.sizes.iconSm}
              color={
                autoSaveStatus === 'saving'
                  ? theme.colors.warningText
                  : autoSaveStatus === 'error'
                    ? theme.colors.emergencyText
                    : theme.colors.successText
              }
            />
            <ThemedText
              variant="small"
              color={
                autoSaveStatus === 'error'
                  ? theme.colors.emergencyText
                  : theme.colors.textSecondary
              }
            >
              {autoSaveStatus === 'saving'
                ? 'Saving changes…'
                : autoSaveStatus === 'saved'
                  ? lastSavedBadgeLabel
                    ? `All changes saved • ${lastSavedBadgeLabel}`
                    : 'All changes saved automatically'
                  : autoSaveStatus === 'error'
                    ? autoSaveError || 'Autosave failed — tap Retry to save'
                    : lastSavedBadgeLabel
                      ? `${lastSavedBadgeLabel} — changes save automatically as you answer`
                      : 'Auto-save active — changes save automatically as you answer'}
            </ThemedText>
          </View>
          <View style={styles.actionFooterRow}>
            {autoSaveStatus === 'error' && (
              <Button
                title="Retry"
                variant="outline"
                size="sm"
                onPress={() => void performAutoSave()}
              />
            )}
            {editingAssessmentId && (
              <Button
                title="Done Editing"
                variant="ghost"
                size="sm"
                onPress={handleCancelEdit}
              />
            )}
          </View>
        </View>
      ) : null}

      {/* Assessment History */}
      {(activeAssessments.length > 0 || voidedAssessments.length > 0) && (
        <View style={styles.sectionCard}>
          <View style={styles.historyHeaderRow}>
            <ThemedText variant="h3">Prior Assessments History</ThemedText>
            {activeAssessments.length > 0 && (
              <Badge
                label={`${activeAssessments.length} Active`}
                variant="routine"
                size="sm"
              />
            )}
          </View>

          {activeAssessments.map((a, idx) => {
            const bMeta = RISK_BAND_META[a.riskBand as RiskBandType] || RISK_BAND_META.BandA;
            const rawDate = a.assessmentDate || a.createdAt;
            const formattedDate = rawDate && !isNaN(new Date(rawDate).getTime())
              ? new Date(rawDate).toLocaleDateString()
              : new Date().toLocaleDateString();
            const isAuthor = isRecordAuthor(a);
            const isEditingThis = editingAssessmentId === a.id;
            const isLatest = idx === 0 && !editingAssessmentId;

            return (
              <View
                key={a.id}
                style={[
                  styles.historyRow,
                  isEditingThis && styles.historyRowEditing,
                ]}
              >
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => handleStartEdit(a)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit assessment from ${formattedDate}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {formattedDate} • {a.assessedByStaffName?.trim() || 'Clinician'}
                    </ThemedText>
                    {isLatest && <Badge label="Latest" variant="primary" size="xs" />}
                    {isEditingThis && <Badge label="Editing" variant="warning" size="xs" />}
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {a.calculatedRiskScorePercent ? `Score: ${a.calculatedRiskScorePercent}% • ` : ''}
                    FBS: {a.fastingBloodSugarMgDl ? `${a.fastingBloodSugarMgDl} mg/dL` : '—'} • Chol: {a.totalCholesterolMgDl ? `${a.totalCholesterolMgDl} mg/dL` : '—'}
                  </ThemedText>
                </Pressable>
                <View style={styles.historyActions}>
                  <Badge label={bMeta.label} variant={bMeta.badgeVariant} />
                  <Button
                    title="Edit"
                    variant="ghost"
                    size="sm"
                    icon="edit"
                    disabled={!canWritePatients}
                    onPress={() => handleStartEdit(a)}
                  />
                  {isAuthor ? (
                    <Button
                      title="Void"
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      disabled={!canWritePatients}
                      textStyle={{ color: theme.colors.emergencyText }}
                      onPress={() => handleOpenVoidModal(a)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}

          {/* Voided Assessments Section (Collapsible) */}
          {voidedAssessments.length > 0 && (
            <View style={styles.voidedSectionContainer}>
              <Button
                variant="ghost"
                size="xs"
                icon={showVoided ? 'chevronUp' : 'chevronDown'}
                title={
                  showVoided
                    ? `Hide ${voidedAssessments.length} retracted / voided ${voidedAssessments.length === 1 ? 'entry' : 'entries'}`
                    : `Show ${voidedAssessments.length} retracted / voided ${voidedAssessments.length === 1 ? 'entry' : 'entries'}`
                }
                onPress={() => setShowVoided((prev) => !prev)}
                style={styles.toggleVoidedBtn}
              />

              {showVoided &&
                voidedAssessments.map((a) => {
                  const rawDate = a.assessmentDate || a.createdAt;
                  const formattedDate = rawDate && !isNaN(new Date(rawDate).getTime())
                    ? new Date(rawDate).toLocaleDateString()
                    : new Date().toLocaleDateString();
                  const voidedDate = a.deletedAt && !isNaN(new Date(a.deletedAt).getTime())
                    ? new Date(a.deletedAt).toLocaleDateString()
                    : formattedDate;

                  return (
                    <View key={a.id} style={[styles.historyRow, styles.historyRowVoided]}>
                      <View style={{ flex: 1 }}>
                        <ThemedText
                          variant="bodyBold"
                          color={theme.colors.textSecondary}
                          style={styles.strikethroughText}
                        >
                          {formattedDate} • {a.assessedByStaffName?.trim() || 'Clinician'}
                        </ThemedText>
                        <ThemedText
                          variant="small"
                          color={theme.colors.textSecondary}
                          style={styles.strikethroughText}
                        >
                          {a.calculatedRiskScorePercent ? `Score: ${a.calculatedRiskScorePercent}% • ` : ''}
                          FBS: {a.fastingBloodSugarMgDl ? `${a.fastingBloodSugarMgDl} mg/dL` : '—'} • Chol: {a.totalCholesterolMgDl ? `${a.totalCholesterolMgDl} mg/dL` : '—'}
                        </ThemedText>
                        <ThemedText
                          variant="small"
                          color={theme.colors.textSecondary}
                          style={{ fontStyle: 'italic', marginTop: 2 }}
                        >
                          Voided on {voidedDate} by {a.deletedBy || 'Clinician'} • {a.voidReason || 'Entered in error'}
                        </ThemedText>
                      </View>
                      <Badge label="Entered in Error" variant="neutral" />
                    </View>
                  );
                })}
            </View>
          )}
        </View>
      )}

      {/* Void / Entered in Error Confirmation Modal */}
      <Modal
        visible={voidModalVisible}
        onClose={() => !voidingSubmitting && setVoidModalVisible(false)}
        title="Mark Assessment as Entered in Error"
        subtitle={
          voidingAssessment
            ? `Assessment dated ${
                voidingAssessment.assessmentDate?.split('T')[0] ||
                voidingAssessment.createdAt?.split('T')[0] ||
                'Selected date'
              } by ${voidingAssessment.assessedByStaffName || 'Clinician'}`
            : undefined
        }
        maxWidth={500}
        footer={
          <View style={styles.modalFooterRow}>
            <Button
              title="Cancel"
              variant="ghost"
              disabled={voidingSubmitting}
              onPress={() => setVoidModalVisible(false)}
            />
            <Button
              title={voidingSubmitting ? 'Voiding…' : 'Confirm Retraction'}
              variant="danger"
              icon="trash"
              loading={voidingSubmitting}
              disabled={voidingSubmitting}
              onPress={handleConfirmVoid}
            />
          </View>
        }
      >
        <View style={styles.modalBody}>
          <ThemedText variant="body" color={theme.colors.textSecondary}>
            Under healthcare compliance, clinical records cannot be permanently destroyed. Marking this assessment as entered in error will retract it from active CVD risk calculations and chart summaries while maintaining the audit trail.
          </ThemedText>

          <ThemedText variant="smallBold" color={theme.colors.text} style={{ marginTop: theme.spacing.sm }}>
            Select Reason for Retraction:
          </ThemedText>

          <View style={styles.reasonPillsContainer}>
            {VOID_REASONS.map((r) => {
              const selected = voidReason === r;
              return (
                <Pressable
                  key={r}
                  style={[styles.reasonPill, selected && styles.reasonPillSelected]}
                  onPress={() => setVoidReason(r)}
                >
                  <ThemedText
                    variant="small"
                    color={selected ? theme.colors.primaryDark : theme.colors.text}
                    style={selected ? { fontWeight: '700' } : undefined}
                  >
                    {r}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <Input
            label="Additional Notes / Remarks (Optional)"
            placeholder="e.g. Mistyped fasting blood sugar value"
            value={customVoidNotes}
            onChangeText={setCustomVoidNotes}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  explicitNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  noticeLeftRow: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  noticeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  autoSaveErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  riskBandHeroCard: {
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  riskBandHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  bandScoreChip: {
    borderWidth: 1,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    backgroundColor: theme.colors.surface,
  },
  bandSelectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  bandChipBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  overrideAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.emergencySubtle,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  autoCalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  autoCalcInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  questionText: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  toggleBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  toggleBtnActiveWarning: {
    backgroundColor: theme.colors.warning,
  },
  toggleBtnActiveEmergency: {
    backgroundColor: theme.colors.emergency,
  },
  nestedContainer: {
    marginLeft: theme.spacing.md,
    paddingLeft: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
    marginTop: 2,
    marginBottom: theme.spacing.xs,
  },
  subNestedContainer: {
    marginLeft: theme.spacing.md,
    paddingLeft: theme.spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.primaryBorder || theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
    marginTop: 2,
  },
  formGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  gridItem: {
    flex: 1,
  },
  autoSaveFooterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  autoSaveFooterLeft: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  actionFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  historyRowEditing: {
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
  },
  historyRowVoided: {
    opacity: 0.6,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
  },
  strikethroughText: {
    textDecorationLine: 'line-through',
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  voidedSectionContainer: {
    marginTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  toggleVoidedBtn: {
    alignSelf: 'flex-start',
  },
  modalBody: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  modalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  reasonPillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  reasonPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  reasonPillSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
});
