import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import { PERMISSIONS } from '../../constants/permissions';
import {
  Modal,
  Input,
  Button,
  Badge,
  Icon,
  ErrorState,
  SkeletonList,
  ThemedText,
  ValidatedDateInput,
  SegmentedControl,
  validatePhilHealthPinMod11,
  type IconName,
} from '../ui';
import { notify } from '../../utils/feedback';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useAuth } from '../../context/AuthContext';
import { useClinic } from '../../context/ClinicContext';
import { useStaff } from '../../context/StaffContext';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import { usePhilHealthCatalog } from '../../utils/usePhilHealthCatalog';
import { calculatePhilPenRisk, type RiskBandType } from '../../utils/philpenCalculator';
import {
  clinicService,
  type ClinicPatient,
  type ClinicLabOrderRecord,
  type PatientChart,
  type PatientAllergyRecord,
  type PatientPastMedicalHistory,
  type PatientFamilyHistory,
  type PatientSocialHistory,
  type PatientReproductiveHistory,
  type PatientImmunizationRecord,
  type NcdRiskAssessment,
  type PediatricZScoreResult,
  type PatientPhilHealthCoverageDto,
  type HealthScreeningType,
  type HealthScreeningStatus,
  type HealthScreeningDisposition,
  type HealthScreeningDetailRecord,
  type YakapServiceDeliveryMethod,
  type RecordTriageRequest,
} from '../../services/clinicService';
import {
  CohortBanner,
  StandardVitalsSection,
  AnthropometricsSection,
  VisualAcuitySection,
  EMPTY_VITALS_FORM,
  resolveCohort,
  evaluateBmi,
  evaluateCentralObesity,
  formatVitalsSummary,
  hydrateVitalsFormFromRecord,
  mapApiErrorsToVitalsFormErrors,
  parseOptionalInt,
  parseOptionalFloat,
  type VitalsFormState,
} from '../consultation/VitalsFormFields';
import {
  PHILHEALTH_MDISEASES_CONDITIONS,
  getLockedPersonalConditionCodes,
  isNoneHistoryEntry,
  reconcilePersonalHistoryWithClinicalRecords,
} from '../chart/ClinicalHistoryTab';
import { hasKnownAllergies } from '../patient/PatientDirectoryCard';
import OrganSystemsExamSection, {
  DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
  type OrganSystemDef,
  type OrganSystemsExamValues,
} from '../chart/OrganSystemsExamSection';
import {
  getScreeningCohortTabsForPatient,
  splitDelimitedCodes,
  toggleScreeningCode,
} from '../consultation/PlanManagementCard';
import OrderCatalogSearchModal, {
  type OrderCatalogItemPayload,
} from '../consultation/OrderCatalogSearchModal';
import StructuredAllergyIntakeModal, {
  AllergyPillList,
  type CreateAllergyRequest,
} from '../patient/StructuredAllergyIntakeModal';
import IssueMedicalCertificateModal from '../patient/IssueMedicalCertificateModal';
import AdministerVaccineModal from '../chart/AdministerVaccineModal';
import HistoricalVaccineModal from '../chart/HistoricalVaccineModal';
import {
  normalizeDeliveryType,
  normalizeContraceptiveMethod,
} from '../../constants/reproductiveHealth';
import { toIsoDateString } from '../../utils/yakapEnlistment';

export interface HealthScreeningModalProps {
  visible: boolean;
  onClose: () => void;
  patient: ClinicPatient | null;
  queueItemId?: string | null;
  initialScreeningId?: string | null;
  initialTrack?: 'Regular' | 'YakapAvailment';
  allowDuplicateActive?: boolean;
  onSuccess?: (screening: HealthScreeningDetailRecord) => void;
  onSessionQueueLinked?: (queueItemId: string) => void;
  onEscalateToConsultation?: (params: {
    patient: ClinicPatient;
    queueItemId: string;
    workflowMode: 'Regular' | 'YakapAvailment';
  }) => void;
  onIssueMedCert?: (params: {
    patient: ClinicPatient;
    queueItemId: string;
  }) => void;
}

type StationStep = 1 | 2 | 3 | 4;

const STATION_STEPS: Array<{
  step: StationStep;
  title: string;
  shortTitle: string;
  roleHint: string;
  icon: IconName;
}> = [
  { step: 1, title: 'Vitals & Vision', shortTitle: 'Vitals', roleHint: 'Nurse / Triage', icon: 'activity' },
  { step: 2, title: 'History & Risk', shortTitle: 'History', roleHint: 'Intake & PhilPEN', icon: 'clipboard' },
  { step: 3, title: 'Physical Exam & Labs', shortTitle: 'PE & Labs', roleHint: 'Physician', icon: 'stethoscope' },
  { step: 4, title: 'Summary & Sign-Off', shortTitle: 'Sign-Off', roleHint: 'Disposition', icon: 'file' },
];

const HEALTH_SCREENING_DRAFT_PREFIX = 'clinicez_health_screening_draft:';
const HEALTH_SCREENING_DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

interface HealthScreeningDraftSnapshot {
  version: 1;
  patientId: string;
  queueItemId?: string | null;
  screeningId?: string | null;
  activeStep: StationStep;
  screeningType: HealthScreeningType;
  workflowMode: 'Regular' | 'YakapAvailment';
  philHealthAtc: string;
  isWalkedIn: boolean;
  serviceDeliveryMethod: YakapServiceDeliveryMethod;
  vitalsForm: VitalsFormState;
  vitalsEdited: boolean;
  pastMedicalItems: PatientPastMedicalHistory[];
  familyMedicalItems: PatientFamilyHistory[];
  medicalHistoryNotes: string;
  familyHistoryNotes: string;
  historyEdited: boolean;
  socialHistory: Partial<PatientSocialHistory>;
  socialEdited: boolean;
  reproHistory: Partial<PatientReproductiveHistory>;
  reproEdited: boolean;
  ncdAnswers: Record<string, boolean | string | null>;
  ncdFbsMgDl: string;
  ncdFbsDate: string;
  ncdTotalCholMgDl: string;
  ncdTotalCholDate: string;
  ncdUrineKetonesValue: string;
  ncdUrineKetonesDate: string;
  ncdUrineProteinValue: string;
  ncdUrineProteinDate: string;
  ncdEdited: boolean;
  nurseScreeningNotes: string;
  peValues: OrganSystemsExamValues;
  peEdited: boolean;
  adultRoutineCodes: string[];
  pediatricRoutineCodes: string[];
  prenatalRoutineCodes: string[];
  breastCancerSelected: boolean;
  cervicalCancerSelected: boolean;
  colorectalCancerSelected: boolean;
  prostateCancerSelected: boolean;
  disposition: HealthScreeningDisposition;
  clinicalImpression: string;
  preventiveCounselingNotes: string;
  recommendedFollowUpDate: string;
  step2Saved: boolean;
  updatedAt: number;
}

function getScreeningDraftStorageKey(patientId: string, queueId?: string | null): string {
  return `${HEALTH_SCREENING_DRAFT_PREFIX}${patientId}:${queueId || 'direct'}`;
}

function getWebSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    // Ignore restricted frame access
  }
  return null;
}

function readScreeningDraft(patientId: string, queueId?: string | null): HealthScreeningDraftSnapshot | null {
  const storage = getWebSessionStorage();
  if (!storage) return null;
  const candidateKeys = queueId
    ? [getScreeningDraftStorageKey(patientId, queueId), getScreeningDraftStorageKey(patientId, null)]
    : [getScreeningDraftStorageKey(patientId, null)];
  for (const key of candidateKeys) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as HealthScreeningDraftSnapshot;
      if (
        parsed?.version === 1 &&
        parsed.patientId === patientId &&
        typeof parsed.updatedAt === 'number' &&
        Date.now() - parsed.updatedAt <= HEALTH_SCREENING_DRAFT_TTL_MS
      ) {
        return parsed;
      }
      storage.removeItem(key);
    } catch {
      // Ignore malformed draft payload
    }
  }
  return null;
}

function writeScreeningDraft(snapshot: HealthScreeningDraftSnapshot): void {
  const storage = getWebSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(
      getScreeningDraftStorageKey(snapshot.patientId, snapshot.queueItemId),
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore quota errors
  }
}

function clearScreeningDraft(patientId?: string | null, queueId?: string | null): void {
  const storage = getWebSessionStorage();
  if (!storage || !patientId) return;
  try {
    storage.removeItem(getScreeningDraftStorageKey(patientId, null));
    if (queueId) {
      storage.removeItem(getScreeningDraftStorageKey(patientId, queueId));
    }
  } catch {
    // Ignore storage cleanup errors
  }
}

function normalizeConditionRecords(
  items: PatientPastMedicalHistory[],
  catalogConditions: { code: string; description: string }[]
): PatientPastMedicalHistory[] {
  const clean: PatientPastMedicalHistory[] = [];
  const seenCodes = new Set<string>();
  for (const item of items) {
    if (!item || isNoneHistoryEntry(item.philHealthMdiseaseCode, item.conditionTitle)) continue;
    const explicitCode = item.philHealthMdiseaseCode?.trim();
    const matchedCatalog =
      (explicitCode ? catalogConditions.find((c) => c.code === explicitCode) : undefined) ??
      catalogConditions.find(
        (c) => c.description.trim().toLowerCase() === item.conditionTitle?.trim().toLowerCase()
      );
    const resolvedCode = matchedCatalog?.code || explicitCode || '998';
    if (resolvedCode !== '998' && seenCodes.has(resolvedCode)) continue;
    seenCodes.add(resolvedCode);
    clean.push({
      ...item,
      philHealthMdiseaseCode: resolvedCode,
      conditionTitle:
        resolvedCode === '998'
          ? item.conditionTitle || 'Others'
          : matchedCatalog?.description || item.conditionTitle,
    });
  }
  return clean;
}

function normalizeFamilyConditionRecords(
  items: PatientFamilyHistory[],
  catalogConditions: { code: string; description: string }[]
): PatientFamilyHistory[] {
  const clean: PatientFamilyHistory[] = [];
  const seenCodes = new Set<string>();
  for (const item of items) {
    if (!item || isNoneHistoryEntry(item.philHealthMdiseaseCode, item.conditionTitle)) continue;
    const explicitCode = item.philHealthMdiseaseCode?.trim();
    const matchedCatalog =
      (explicitCode ? catalogConditions.find((c) => c.code === explicitCode) : undefined) ??
      catalogConditions.find(
        (c) => c.description.trim().toLowerCase() === item.conditionTitle?.trim().toLowerCase()
      );
    const resolvedCode = matchedCatalog?.code || explicitCode || '998';
    if (resolvedCode !== '998' && seenCodes.has(resolvedCode)) continue;
    seenCodes.add(resolvedCode);
    clean.push({
      ...item,
      philHealthMdiseaseCode: resolvedCode,
      conditionTitle:
        resolvedCode === '998'
          ? item.conditionTitle || 'Others'
          : matchedCatalog?.description || item.conditionTitle,
    });
  }
  return clean;
}

function parseChronicConditionsToPastMedicalItems(
  chronicConditions: string | undefined,
  patientId: string,
  catalogConditions: { code: string; description: string }[]
): PatientPastMedicalHistory[] {
  if (!chronicConditions || isNoneHistoryEntry(null, chronicConditions)) return [];
  const items: PatientPastMedicalHistory[] = [];
  const seen = new Set<string>();
  const otherParts: string[] = [];

  for (const rawToken of chronicConditions.split(',')) {
    const token = rawToken.trim();
    if (!token || isNoneHistoryEntry(null, token)) continue;
    const match = catalogConditions.find((c) => {
      if (c.code === '998' || isNoneHistoryEntry(c.code, c.description)) return false;
      const desc = c.description.toLowerCase();
      const lower = token.toLowerCase();
      return lower === desc || lower.includes(desc) || desc.includes(lower);
    });
    if (match) {
      if (!seen.has(match.code)) {
        seen.add(match.code);
        items.push({
          id: `chart-chronic-${match.code}`,
          patientId,
          conditionTitle: match.description,
          philHealthMdiseaseCode: match.code,
          isResolved: false,
          createdAt: '',
        });
      }
    } else {
      otherParts.push(token);
    }
  }

  if (otherParts.length > 0) {
    items.push({
      id: 'chart-chronic-998',
      patientId,
      conditionTitle: 'Others',
      philHealthMdiseaseCode: '998',
      specificDescription: otherParts.join(', '),
      isResolved: false,
      createdAt: '',
    });
  }

  return items;
}

const REGULAR_PURPOSES: Array<{ value: HealthScreeningType; label: string }> = [
  { value: 'AnnualPhysicalExam', label: 'Annual Physical Exam (APE)' },
  { value: 'PreEmployment', label: 'Pre-Employment' },
  { value: 'SchoolPhysical', label: 'School Physical' },
  { value: 'RoutineWellness', label: 'Routine Wellness / NCD' },
  { value: 'CommunityScreening', label: 'Community Screening' },
];

const DISPOSITION_OPTIONS: Array<{
  value: HealthScreeningDisposition;
  label: string;
  description: string;
}> = [
  { value: 'Cleared', label: 'Cleared', description: 'Fit / cleared with no acute restrictions' },
  { value: 'ClearedWithAdvice', label: 'Cleared with Advice', description: 'Cleared with preventive lifestyle guidance' },
  { value: 'ForWorkup', label: 'For Diagnostic Workup', description: 'Pending ordered labs or follow-up review' },
  { value: 'EscalatedToConsultation', label: 'Escalate to MD Consultation', description: 'Convert visit to full physician consultation' },
];

function getDefaultFollowUpDate(): string {
  const next = new Date();
  next.setFullYear(next.getFullYear() + 1);
  return toIsoDateString(next);
}

function createDefaultSocialHistory(): Partial<PatientSocialHistory> {
  return {
    isSmoker: false,
    smokingStatus: 'never',
    isAlcoholDrinker: false,
    alcoholStatus: 'never',
    usesIllicitDrugs: false,
    isSexuallyActive: false,
  };
}

function createDefaultReproHistory(): Partial<PatientReproductiveHistory> {
  return {
    isApplicable: false,
    isMenopausal: false,
    hadPreEclampsiaHypertension: false,
    receivedFamilyPlanningCounseling: false,
    gravidity: 0,
    parity: 0,
    termBirths: 0,
    pretermBirths: 0,
    abortions: 0,
    livingChildren: 0,
  };
}

function createDefaultPeValues(): OrganSystemsExamValues {
  return {
    genSurveyId: '1',
    genSurveyRemarks: '',
    ...DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
  };
}

function getScreeningTypeLabel(type: HealthScreeningType): string {
  switch (type) {
    case 'AnnualPhysicalExam':
      return 'Annual Physical Exam (APE)';
    case 'PreEmployment':
      return 'Pre-Employment Health Screening';
    case 'SchoolPhysical':
      return 'School Physical Examination';
    case 'RoutineWellness':
      return 'Routine Wellness & NCD Screening';
    case 'CommunityScreening':
      return 'Community Health Screening';
    case 'YakapFpe':
      return 'PhilHealth YAKAP First Patient Encounter (FPE)';
    default:
      return 'Health Screening';
  }
}

export default function HealthScreeningModal({
  visible,
  onClose,
  patient,
  queueItemId = null,
  initialScreeningId = null,
  initialTrack = 'Regular',
  allowDuplicateActive = false,
  onSuccess,
  onSessionQueueLinked,
  onEscalateToConsultation,
  onIssueMedCert,
}: HealthScreeningModalProps) {
  const { isCompact } = useBreakpoint();
  const { can } = useAuth();
  const { accreditationNumber, settings: clinicSettings } = useClinic();
  const { current: currentStaff, currentName } = useStaff();

  const canPhysicianSignOff =
    can(PERMISSIONS.consultationsSign) || can(PERMISSIONS.consultationsWrite);
  const canNurseScreen =
    can(PERMISSIONS.triageWrite) && can(PERMISSIONS.patientsWrite);
  const allowNurseYakapFacilitator = Boolean(
    clinicSettings?.allowNurseMidwifeYakapFpeFacilitator
  );
  const hasPhilHealthAccreditation = Boolean(
    accreditationNumber?.trim() || clinicSettings?.isPhilHealthConfigured
  );

  // Dynamic EHR Options & PhilHealth Catalogs (zero static option arrays)
  const { options: alcoholOptions } = useEhrOptions('alcohol_type', { enabled: visible });
  const { options: activityOptions } = useEhrOptions('physical_activity', { enabled: visible });
  const { options: dietaryOptions } = useEhrOptions('dietary_intake', { enabled: visible });
  const { options: deliveryOptions } = useEhrOptions('delivery_type', { enabled: visible });
  const { options: contraceptiveOptions } = useEhrOptions('contraceptive_method', { enabled: visible });
  const { options: cvdRiskLevelOptions } = useEhrOptions('cvd_risk_level', { enabled: visible });
  const { options: generalSurveyOptions } = useEhrOptions('pe_general_survey', { enabled: visible });
  const { options: adultScreeningOptions } = useEhrOptions('yakap_adult_screening', { enabled: visible });
  const { options: pediatricScreeningOptions } = useEhrOptions('yakap_pediatric_screening', { enabled: visible });
  const { options: prenatalScreeningOptions } = useEhrOptions('yakap_prenatal_screening', { enabled: visible });
  const { options: cancerScreeningOptions } = useEhrOptions('yakap_cancer_screening', { enabled: visible });

  const { items: mdiseasesCatalog } = usePhilHealthCatalog('lib_mdiseases', visible);
  const { items: ncdQuestionsCatalog } = usePhilHealthCatalog('lib_ncdq', visible);
  const { items: childVaccines } = usePhilHealthCatalog('lib_immchild', visible);
  const { items: youngWomanVaccines } = usePhilHealthCatalog('lib_immyoungw', visible);
  const { items: pregWomanVaccines } = usePhilHealthCatalog('lib_immpregw', visible);
  const { items: elderlyVaccines } = usePhilHealthCatalog('lib_immelderly', visible);

  // Lifecycle & loading state
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState<StationStep>(1);

  // Visit & screening identity (zero writes on open)
  const [screeningId, setScreeningId] = useState<string | null>(initialScreeningId);
  const [screeningStatus, setScreeningStatus] = useState<HealthScreeningStatus>('InProgress');
  const [activeQueueItemId, setActiveQueueItemId] = useState<string | null>(queueItemId);
  const queueItemIdRef = useRef<string | null>(queueItemId);
  queueItemIdRef.current = activeQueueItemId;

  const [workflowMode, setWorkflowMode] = useState<'Regular' | 'YakapAvailment'>(
    initialTrack === 'YakapAvailment' ? 'YakapAvailment' : 'Regular'
  );
  const [screeningType, setScreeningType] = useState<HealthScreeningType>(
    initialTrack === 'YakapAvailment' ? 'YakapFpe' : 'AnnualPhysicalExam'
  );
  const [profilingTransNo, setProfilingTransNo] = useState<string | null>(null);
  const [completedScreening, setCompletedScreening] = useState<HealthScreeningDetailRecord | null>(null);

  // YAKAP intake fields
  const [coverage, setCoverage] = useState<PatientPhilHealthCoverageDto | null>(null);
  const [philHealthAtc, setPhilHealthAtc] = useState('');
  const [isWalkedIn, setIsWalkedIn] = useState(true);
  const [serviceDeliveryMethod, setServiceDeliveryMethod] =
    useState<YakapServiceDeliveryMethod>('FacilityBased');

  // Pre-hydrated chart & linked record IDs
  const [chart, setChart] = useState<PatientChart | null>(null);
  const [patientVitalsId, setPatientVitalsId] = useState<string | null>(null);
  const [hasExistingQueueTriage, setHasExistingQueueTriage] = useState(false);
  const [patientPhysicalExamId, setPatientPhysicalExamId] = useState<string | null>(null);
  const [screeningPhysicalExamId, setScreeningPhysicalExamId] = useState<string | null>(null);
  const [ncdRiskAssessmentId, setNcdRiskAssessmentId] = useState<string | null>(null);

  // Station 1: Vitals & Vision
  const [vitalsForm, setVitalsForm] = useState<VitalsFormState>(EMPTY_VITALS_FORM);
  const [vitalsErrors, setVitalsErrors] = useState<Partial<Record<keyof VitalsFormState, string>>>({});
  const [vitalsEdited, setVitalsEdited] = useState(false);
  const [zScorePreview, setZScorePreview] = useState<PediatricZScoreResult | null>(null);

  // Station 2: Longitudinal Histories & PhilPEN
  const [allergies, setAllergies] = useState<PatientAllergyRecord[]>([]);
  const [allergyModalOpen, setAllergyModalOpen] = useState(false);
  const [savingAllergy, setSavingAllergy] = useState(false);
  const [allergyEdited, setAllergyEdited] = useState(false);

  const [pastMedicalItems, setPastMedicalItems] = useState<PatientPastMedicalHistory[]>([]);
  const [familyMedicalItems, setFamilyMedicalItems] = useState<PatientFamilyHistory[]>([]);
  const [medicalHistoryNotes, setMedicalHistoryNotes] = useState('');
  const [familyHistoryNotes, setFamilyHistoryNotes] = useState('');
  const [historyEdited, setHistoryEdited] = useState(false);

  const [socialHistory, setSocialHistory] = useState<Partial<PatientSocialHistory>>(
    createDefaultSocialHistory
  );
  const [socialEdited, setSocialEdited] = useState(false);

  const [reproHistory, setReproHistory] = useState<Partial<PatientReproductiveHistory>>(
    createDefaultReproHistory
  );
  const [reproEdited, setReproEdited] = useState(false);

  const [immunizations, setImmunizations] = useState<PatientImmunizationRecord[]>([]);
  const [showAllVaccines, setShowAllVaccines] = useState(false);
  const [adminVaccineOpen, setAdminVaccineOpen] = useState(false);
  const [histVaccineOpen, setHistVaccineOpen] = useState(false);
  const [immunizationsEdited, setImmunizationsEdited] = useState(false);

  // PhilPEN NCD answers & state
  const [ncdAnswers, setNcdAnswers] = useState<Record<string, boolean | string | null>>({});
  const [ncdFbsMgDl, setNcdFbsMgDl] = useState('');
  const [ncdFbsDate, setNcdFbsDate] = useState('');
  const [ncdTotalCholMgDl, setNcdTotalCholMgDl] = useState('');
  const [ncdTotalCholDate, setNcdTotalCholDate] = useState('');
  const [ncdUrineKetonesValue, setNcdUrineKetonesValue] = useState('');
  const [ncdUrineKetonesDate, setNcdUrineKetonesDate] = useState('');
  const [ncdUrineProteinValue, setNcdUrineProteinValue] = useState('');
  const [ncdUrineProteinDate, setNcdUrineProteinDate] = useState('');
  const [ncdEdited, setNcdEdited] = useState(false);
  const [nurseScreeningNotes, setNurseScreeningNotes] = useState('');

  // Station 3: Physical Exam, Preventive Screenings & Baseline Labs
  const [peValues, setPeValues] = useState<OrganSystemsExamValues>(createDefaultPeValues);
  const [peEdited, setPeEdited] = useState(false);
  const [adultRoutineCodes, setAdultRoutineCodes] = useState<string[]>(['0']);
  const [pediatricRoutineCodes, setPediatricRoutineCodes] = useState<string[]>(['0']);
  const [prenatalRoutineCodes, setPrenatalRoutineCodes] = useState<string[]>(['0']);
  const [breastCancerSelected, setBreastCancerSelected] = useState(false);
  const [cervicalCancerSelected, setCervicalCancerSelected] = useState(false);
  const [colorectalCancerSelected, setColorectalCancerSelected] = useState(false);
  const [prostateCancerSelected, setProstateCancerSelected] = useState(false);
  const [activeCohortTab, setActiveCohortTab] = useState<'adult' | 'pediatric' | 'prenatal'>('adult');

  const [orderedLabs, setOrderedLabs] = useState<ClinicLabOrderRecord[]>([]);
  const [labOrderModalOpen, setLabOrderModalOpen] = useState(false);

  // Station 4: Summary, Disposition & Sign-Off
  const [disposition, setDisposition] = useState<HealthScreeningDisposition>('Cleared');
  const [clinicalImpression, setClinicalImpression] = useState('');
  const [preventiveCounselingNotes, setPreventiveCounselingNotes] = useState('');
  const [recommendedFollowUpDate, setRecommendedFollowUpDate] = useState(getDefaultFollowUpDate);
  const [medCertModalOpen, setMedCertModalOpen] = useState(false);

  const [step2Saved, setStep2Saved] = useState(false);
  const [restoredDraftFromRefresh, setRestoredDraftFromRefresh] = useState(false);
  const [prefilledHistoryCount, setPrefilledHistoryCount] = useState(0);

  const loadRequestIdRef = useRef(0);
  const hydratedRef = useRef(false);

  const resetScreeningState = useCallback(() => {
    const defaultMode: 'Regular' | 'YakapAvailment' =
      initialTrack === 'YakapAvailment' ? 'YakapAvailment' : 'Regular';
    hydratedRef.current = false;
    setLoadError(null);
    setSaving(false);
    setActiveStep(1);
    setScreeningId(initialScreeningId ?? null);
    setScreeningStatus('InProgress');
    setActiveQueueItemId(queueItemId ?? null);
    queueItemIdRef.current = queueItemId ?? null;
    setWorkflowMode(defaultMode);
    setScreeningType(defaultMode === 'YakapAvailment' ? 'YakapFpe' : 'AnnualPhysicalExam');
    setProfilingTransNo(null);
    setCompletedScreening(null);

    setCoverage(null);
    setPhilHealthAtc('');
    setIsWalkedIn(true);
    setServiceDeliveryMethod('FacilityBased');

    setChart(null);
    setPatientVitalsId(null);
    setHasExistingQueueTriage(false);
    setPatientPhysicalExamId(null);
    setScreeningPhysicalExamId(null);
    setNcdRiskAssessmentId(null);

    setVitalsForm(EMPTY_VITALS_FORM);
    setVitalsErrors({});
    setVitalsEdited(false);
    setZScorePreview(null);

    setAllergies([]);
    setAllergyModalOpen(false);
    setSavingAllergy(false);
    setAllergyEdited(false);

    setPastMedicalItems([]);
    setFamilyMedicalItems([]);
    setMedicalHistoryNotes('');
    setFamilyHistoryNotes('');
    setHistoryEdited(false);

    setSocialHistory(createDefaultSocialHistory());
    setSocialEdited(false);

    setReproHistory(createDefaultReproHistory());
    setReproEdited(false);

    setImmunizations([]);
    setShowAllVaccines(false);
    setAdminVaccineOpen(false);
    setHistVaccineOpen(false);
    setImmunizationsEdited(false);

    setNcdAnswers({});
    setNcdFbsMgDl('');
    setNcdFbsDate('');
    setNcdTotalCholMgDl('');
    setNcdTotalCholDate('');
    setNcdUrineKetonesValue('');
    setNcdUrineKetonesDate('');
    setNcdUrineProteinValue('');
    setNcdUrineProteinDate('');
    setNcdEdited(false);
    setNurseScreeningNotes('');

    setPeValues(createDefaultPeValues());
    setPeEdited(false);
    setAdultRoutineCodes(['0']);
    setPediatricRoutineCodes(['0']);
    setPrenatalRoutineCodes(['0']);
    setBreastCancerSelected(false);
    setCervicalCancerSelected(false);
    setColorectalCancerSelected(false);
    setProstateCancerSelected(false);
    setActiveCohortTab('adult');

    setOrderedLabs([]);
    setLabOrderModalOpen(false);

    setDisposition('Cleared');
    setClinicalImpression('');
    setPreventiveCounselingNotes('');
    setRecommendedFollowUpDate(getDefaultFollowUpDate());
    setMedCertModalOpen(false);
    setStep2Saved(false);
    setRestoredDraftFromRefresh(false);
    setPrefilledHistoryCount(0);
  }, [initialScreeningId, initialTrack, queueItemId]);

  const cohort = useMemo(() => resolveCohort(patient), [patient]);
  const mdiseasesCatalogRef = useRef(mdiseasesCatalog);
  mdiseasesCatalogRef.current = mdiseasesCatalog;
  const latestPatientRef = useRef<ClinicPatient | null>(patient);
  latestPatientRef.current = patient;
  const loadedSessionKeyRef = useRef<string | null>(null);

  // Hydrate all read-only data when modal opens (ZERO writes on open)
  const loadModalData = useCallback(
    async (targetPatient: ClinicPatient, options?: { ignoreDraft?: boolean }) => {
      const requestId = ++loadRequestIdRef.current;
      resetScreeningState();
      setLoading(true);

      try {
        const shouldFetchCoverage =
          hasPhilHealthAccreditation ||
          initialTrack === 'YakapAvailment' ||
          Boolean(targetPatient.philHealthNumber);

        const [
          [chartData, chartErr],
          [medHistoryData],
          [famHistoryData],
          [screeningsList],
          [specificScreening],
          [peData],
          [triageData],
          [labOrdersData],
          [coverageData],
        ] = await Promise.all([
          clinicService.getPatientChart(targetPatient.id),
          (
            clinicService.getPastMedicalHistories?.(targetPatient.id) ??
            Promise.resolve([null, null] as const)
          ).catch(() => [null, null] as const),
          (
            clinicService.getFamilyHistories?.(targetPatient.id) ??
            Promise.resolve([null, null] as const)
          ).catch(() => [null, null] as const),
          clinicService.getPatientHealthScreenings(
            targetPatient.id,
            queueItemId ?? undefined
          ),
          initialScreeningId
            ? clinicService.getHealthScreeningById(initialScreeningId)
            : Promise.resolve([null, null] as const),
          clinicService.getPatientPhysicalExam(targetPatient.id),
          queueItemId
            ? clinicService.getTriage(queueItemId)
            : Promise.resolve([null, null] as const),
          queueItemId
            ? clinicService.getLabOrders(targetPatient.id, undefined, undefined, {
                includeUnsigned: true,
              })
            : Promise.resolve([null, null] as const),
          shouldFetchCoverage
            ? clinicService.getPatientPhilHealthCoverage(targetPatient.id)
            : Promise.resolve([null, null] as const),
        ]);

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        if (chartErr && !chartData) {
          setLoadError(chartErr.message || 'Could not load patient chart.');
          setLoading(false);
          return;
        }

        const activeCatalog =
          mdiseasesCatalogRef.current.length > 0
            ? mdiseasesCatalogRef.current
            : PHILHEALTH_MDISEASES_CONDITIONS;

        const resolvedAllergies: PatientAllergyRecord[] =
          chartData?.allergies && chartData.allergies.length > 0
            ? chartData.allergies
            : targetPatient.structuredAllergies ?? [];
        setAllergies(resolvedAllergies);

        const rawPastItems: PatientPastMedicalHistory[] =
          medHistoryData?.items && medHistoryData.items.length > 0
            ? medHistoryData.items
            : chartData?.pastMedicalHistories && chartData.pastMedicalHistories.length > 0
              ? chartData.pastMedicalHistories
              : targetPatient.pastMedicalHistories && targetPatient.pastMedicalHistories.length > 0
                ? targetPatient.pastMedicalHistories.map((m, idx) => ({
                    id: m.id || `patient-pmh-${idx}`,
                    patientId: targetPatient.id,
                    conditionTitle: m.conditionTitle,
                    philHealthMdiseaseCode: m.philHealthMdiseaseCode ?? null,
                    icd10Code: m.icd10Code ?? null,
                    specificDescription: m.specificDescription ?? null,
                    diagnosisDate: m.onsetDate ?? null,
                    isResolved: Boolean(m.isResolved),
                    clinicalNotes: m.clinicalNotes ?? null,
                    createdAt: '',
                  }))
                : parseChronicConditionsToPastMedicalItems(
                    targetPatient.chronicConditions,
                    targetPatient.id,
                    activeCatalog
                  );

        const normalizedPast = normalizeConditionRecords(rawPastItems, activeCatalog);
        const seedCodes = normalizedPast
          .map((m) => m.philHealthMdiseaseCode)
          .filter((c): c is string => Boolean(c));
        const seedOtherDesc =
          normalizedPast.find((m) => m.philHealthMdiseaseCode === '998')?.specificDescription ?? '';

        const reconciled = reconcilePersonalHistoryWithClinicalRecords({
          selectedCodes: seedCodes,
          otherDesc: seedOtherDesc,
          problems: chartData?.problems ?? [],
          allergies: resolvedAllergies,
          catalogConditions: activeCatalog,
        });

        const hydratedPastMedical: PatientPastMedicalHistory[] = [];
        for (const code of reconciled.codes) {
          const existing = normalizedPast.find((m) => m.philHealthMdiseaseCode === code);
          if (existing) {
            hydratedPastMedical.push(
              code === '998' && reconciled.otherDesc
                ? { ...existing, specificDescription: reconciled.otherDesc }
                : existing
            );
          } else {
            const cat = activeCatalog.find((c) => c.code === code);
            hydratedPastMedical.push({
              id: `chart-prefill-${code}`,
              patientId: targetPatient.id,
              conditionTitle: cat?.description || (code === '998' ? 'Others' : code),
              philHealthMdiseaseCode: code,
              specificDescription: code === '998' ? reconciled.otherDesc || null : null,
              isResolved: false,
              createdAt: '',
            });
          }
        }

        const rawFamilyItems: PatientFamilyHistory[] =
          famHistoryData?.items && famHistoryData.items.length > 0
            ? famHistoryData.items
            : chartData?.familyHistories ?? [];
        const hydratedFamilyMedical = normalizeFamilyConditionRecords(rawFamilyItems, activeCatalog);

        const resolvedMedicalNotes =
          medHistoryData?.personalMedicalHistoryNotes ??
          chartData?.personalMedicalHistoryNotes ??
          targetPatient.personalMedicalHistoryNotes ??
          '';
        const resolvedFamilyNotes =
          famHistoryData?.familyMedicalHistoryNotes ??
          chartData?.familyMedicalHistoryNotes ??
          targetPatient.familyMedicalHistoryNotes ??
          '';

        setPastMedicalItems(hydratedPastMedical);
        setFamilyMedicalItems(hydratedFamilyMedical);
        setMedicalHistoryNotes(resolvedMedicalNotes);
        setFamilyHistoryNotes(resolvedFamilyNotes);
        setPrefilledHistoryCount(
          hydratedPastMedical.length + hydratedFamilyMedical.length + resolvedAllergies.length
        );

        if (chartData) {
          setChart(chartData);
          if (chartData.socialHistory) {
            setSocialHistory(chartData.socialHistory);
          } else {
            setSocialHistory(createDefaultSocialHistory());
          }
          if (chartData.reproductiveHistory) {
            setReproHistory({
              ...chartData.reproductiveHistory,
              deliveryType: normalizeDeliveryType(chartData.reproductiveHistory.deliveryType),
              contraceptiveMethod: normalizeContraceptiveMethod(
                chartData.reproductiveHistory.contraceptiveMethod
              ),
            });
          } else {
            setReproHistory(createDefaultReproHistory());
          }
          setImmunizations(chartData.immunizations ?? []);

          const latestNcd = chartData.latestNcdAssessment;
          if (latestNcd) {
            setNcdRiskAssessmentId(latestNcd.id);
            setNcdFbsMgDl(
              latestNcd.fastingBloodSugarMgDl != null
                ? String(latestNcd.fastingBloodSugarMgDl)
                : ''
            );
            setNcdFbsDate(
              latestNcd.fastingBloodSugarDate ? latestNcd.fastingBloodSugarDate.split('T')[0] : ''
            );
            setNcdTotalCholMgDl(
              latestNcd.totalCholesterolMgDl != null
                ? String(latestNcd.totalCholesterolMgDl)
                : ''
            );
            setNcdTotalCholDate(
              latestNcd.totalCholesterolDate ? latestNcd.totalCholesterolDate.split('T')[0] : ''
            );
            setNcdUrineKetonesValue(latestNcd.urineKetonesValue ?? '');
            setNcdUrineKetonesDate(
              latestNcd.urineKetonesDate ? latestNcd.urineKetonesDate.split('T')[0] : ''
            );
            setNcdUrineProteinValue(latestNcd.urineProteinValue ?? '');
            setNcdUrineProteinDate(
              latestNcd.urineProteinDate ? latestNcd.urineProteinDate.split('T')[0] : ''
            );
            setNcdAnswers({
              eatsProcessedFoodWeekly: latestNcd.eatsProcessedFoodWeekly ?? null,
              threeServingsVegetablesDaily: latestNcd.threeServingsVegetablesDaily ?? null,
              twoToThreeServingsFruitDaily: latestNcd.twoToThreeServingsFruitDaily ?? null,
              physicalActivityAtLeast150MinsWeekly:
                latestNcd.physicalActivityAtLeast150MinsWeekly ?? null,
              diagnosedDiabetes:
                latestNcd.diagnosedDiabetes === 'Y' || latestNcd.diagnosedDiabetes === true
                  ? true
                  : latestNcd.diagnosedDiabetes === 'N' || latestNcd.diagnosedDiabetes === false
                    ? false
                    : null,
              diabetesMedicationStatus:
                latestNcd.diabetesMedicationStatus === 'Y'
                  ? 'Y'
                  : latestNcd.diabetesMedicationStatus === 'N'
                    ? 'N'
                    : null,
              hasPolyphagia: latestNcd.hasPolyphagia ?? null,
              hasPolydipsia: latestNcd.hasPolydipsia ?? null,
              hasPolyuria: latestNcd.hasPolyuria ?? null,
              hasRaisedBloodGlucose: latestNcd.hasRaisedBloodGlucose ?? null,
              hasRaisedBloodLipids: latestNcd.hasRaisedBloodLipids ?? null,
              urineKetonesPresent: latestNcd.urineKetonesPresent ?? null,
              urineProteinPresent: latestNcd.urineProteinPresent ?? null,
              hasChestPain: latestNcd.hasChestPain ?? null,
              painInCenterOfChestOrLeftArm: latestNcd.painInCenterOfChestOrLeftArm ?? null,
              painWhenWalkingUphill: latestNcd.painWhenWalkingUphill ?? null,
              slowsDownWhenPainOccurs: latestNcd.slowsDownWhenPainOccurs ?? null,
              painRelievedWithin10Mins: latestNcd.painRelievedWithin10Mins ?? null,
              painRelievedByNitrates: latestNcd.painRelievedByNitrates ?? null,
              severeChestPainOver30Mins: latestNcd.severeChestPainOver30Mins ?? null,
              transientNeurologicalDeficits: latestNcd.transientNeurologicalDeficits ?? null,
              hasHistoryAnginaHeartAttack: latestNcd.hasHistoryAnginaHeartAttack ?? null,
              hasHistoryStrokeOrTia: latestNcd.hasHistoryStrokeOrTia ?? null,
            });
          } else {
            setNcdRiskAssessmentId(null);
            setNcdFbsMgDl('');
            setNcdFbsDate('');
            setNcdTotalCholMgDl('');
            setNcdTotalCholDate('');
            setNcdUrineKetonesValue('');
            setNcdUrineKetonesDate('');
            setNcdUrineProteinValue('');
            setNcdUrineProteinDate('');
            setNcdAnswers({});
          }
        } else {
          setChart(null);
          setSocialHistory(createDefaultSocialHistory());
          setReproHistory(createDefaultReproHistory());
          setImmunizations([]);
          setNcdRiskAssessmentId(null);
          setNcdFbsMgDl('');
          setNcdFbsDate('');
          setNcdTotalCholMgDl('');
          setNcdTotalCholDate('');
          setNcdUrineKetonesValue('');
          setNcdUrineKetonesDate('');
          setNcdUrineProteinValue('');
          setNcdUrineProteinDate('');
          setNcdAnswers({});
        }

        let defaultWalkInAtc = '';
        if (coverageData) {
          setCoverage(coverageData);
          defaultWalkInAtc = coverageData.membership?.defaultWalkInAtc ?? '';
        } else {
          setCoverage(null);
        }

        if (peData) {
          setPatientPhysicalExamId(peData.id);
          setPeValues({
            genSurveyId: peData.genSurveyId || '1',
            genSurveyRemarks: peData.genSurveyRemarks ?? '',
            skinId: peData.skinId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.skinId,
            skinRemarks: peData.skinRemarks ?? '',
            heentId: peData.heentId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heentId,
            heentRemarks: peData.heentRemarks ?? '',
            chestId: peData.chestId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.chestId,
            chestRemarks: peData.chestRemarks ?? '',
            heartId: peData.heartId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heartId,
            heartRemarks: peData.heartRemarks ?? '',
            abdomenId: peData.abdomenId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.abdomenId,
            abdomenRemarks: peData.abdomenRemarks ?? '',
            neuroId: peData.neuroId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.neuroId,
            neuroRemarks: peData.neuroRemarks ?? '',
            guId: peData.guId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.guId,
            guRemarks: peData.guRemarks ?? '',
            rectalId: peData.rectalId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.rectalId,
            rectalRemarks: peData.rectalRemarks ?? '',
          });
        } else {
          setPatientPhysicalExamId(null);
          setPeValues(createDefaultPeValues());
        }

        if (triageData) {
          setPatientVitalsId(triageData.id);
          setHasExistingQueueTriage(true);
          setVitalsForm(hydrateVitalsFormFromRecord(triageData, resolveCohort(targetPatient)));
        } else {
          setPatientVitalsId(null);
          setHasExistingQueueTriage(false);
          setVitalsForm(EMPTY_VITALS_FORM);
        }

        if (labOrdersData && queueItemId) {
          setOrderedLabs(labOrdersData.filter((o) => o.queueItemId === queueItemId));
        } else {
          setOrderedLabs([]);
        }

        // Hydrate existing active HealthScreening if resuming
        const matchedScreening =
          specificScreening ||
          (queueItemId
            ? (screeningsList ?? []).find(
                (s) => s.queueItemId === queueItemId && s.status !== 'Cancelled'
              )
            : null);

        if (matchedScreening) {
          setScreeningId(matchedScreening.id);
          setScreeningStatus(matchedScreening.status);
          const resolvedQueueId = matchedScreening.queueItemId ?? queueItemId ?? null;
          setActiveQueueItemId(resolvedQueueId);
          queueItemIdRef.current = resolvedQueueId;
          setWorkflowMode(matchedScreening.workflowMode);
          setScreeningType(matchedScreening.screeningType);
          setNurseScreeningNotes(matchedScreening.nurseScreeningNotes ?? '');
          setClinicalImpression(matchedScreening.clinicalImpression ?? '');
          setPreventiveCounselingNotes(matchedScreening.preventiveCounselingNotes ?? '');
          setRecommendedFollowUpDate(
            matchedScreening.recommendedFollowUpDate || getDefaultFollowUpDate()
          );
          setDisposition(matchedScreening.disposition ?? 'Cleared');
          if (matchedScreening.patientVitalsId) {
            setPatientVitalsId(matchedScreening.patientVitalsId);
          }
          if (matchedScreening.patientPhysicalExamId) {
            setPatientPhysicalExamId(matchedScreening.patientPhysicalExamId);
            setScreeningPhysicalExamId(matchedScreening.patientPhysicalExamId);
          } else {
            setScreeningPhysicalExamId(null);
          }
          if (matchedScreening.ncdRiskAssessmentId) {
            setNcdRiskAssessmentId(matchedScreening.ncdRiskAssessmentId);
          }
          setAdultRoutineCodes(
            splitDelimitedCodes(matchedScreening.adultRoutineScreeningCode).length > 0
              ? splitDelimitedCodes(matchedScreening.adultRoutineScreeningCode)
              : ['0']
          );
          setPediatricRoutineCodes(
            splitDelimitedCodes(matchedScreening.pediatricRoutineScreeningCode).length > 0
              ? splitDelimitedCodes(matchedScreening.pediatricRoutineScreeningCode)
              : ['0']
          );
          setPrenatalRoutineCodes(
            splitDelimitedCodes(matchedScreening.prenatalScreeningServicesCode).length > 0
              ? splitDelimitedCodes(matchedScreening.prenatalScreeningServicesCode)
              : ['0']
          );
          setBreastCancerSelected(Boolean(matchedScreening.breastCancerScreeningCode));
          setCervicalCancerSelected(Boolean(matchedScreening.cervicalCancerScreeningCode));
          setColorectalCancerSelected(Boolean(matchedScreening.colorectalCancerScreeningCode));
          setProstateCancerSelected(Boolean(matchedScreening.prostateCancerScreeningCode));
          setPhilHealthAtc(matchedScreening.philHealthAtc ?? defaultWalkInAtc);
          setIsWalkedIn(matchedScreening.isWalkedIn ?? true);
          if (matchedScreening.serviceDeliveryMethod) {
            setServiceDeliveryMethod(
              matchedScreening.serviceDeliveryMethod as YakapServiceDeliveryMethod
            );
          }
          setProfilingTransNo(matchedScreening.profilingTransNo ?? null);

          const serverStep2Saved =
            matchedScreening.status === 'AwaitingDoctor' ||
            matchedScreening.status === 'Completed' ||
            Boolean(matchedScreening.ncdRiskAssessmentId);
          setStep2Saved(serverStep2Saved);

          let serverStep: StationStep = 1;
          if (matchedScreening.status === 'Completed') {
            serverStep = 4;
          } else if (matchedScreening.status === 'AwaitingDoctor') {
            serverStep = 3;
          } else if (matchedScreening.patientPhysicalExamId) {
            serverStep = 4;
          } else if (matchedScreening.patientVitalsId) {
            serverStep = 2;
          }

          setVitalsEdited(false);
          setAllergyEdited(false);
          setHistoryEdited(false);
          setSocialEdited(false);
          setReproEdited(false);
          setImmunizationsEdited(false);
          setNcdEdited(false);
          setPeEdited(false);

          const resolvedDraftQueueId = matchedScreening.queueItemId ?? queueItemId ?? null;
          let draftApplied = false;
          if (matchedScreening.status === 'Completed') {
            clearScreeningDraft(targetPatient.id, resolvedDraftQueueId);
          } else if (!options?.ignoreDraft) {
            const draft = readScreeningDraft(targetPatient.id, resolvedDraftQueueId);
            if (draft) {
              draftApplied = true;
              setActiveStep(draft.activeStep);
              setScreeningType(draft.screeningType);
              setWorkflowMode(draft.workflowMode);
              setPhilHealthAtc(draft.philHealthAtc);
              setIsWalkedIn(draft.isWalkedIn);
              setServiceDeliveryMethod(draft.serviceDeliveryMethod);
              setStep2Saved((prev) => prev || Boolean(draft.step2Saved));
              if (draft.vitalsEdited) {
                setVitalsForm(draft.vitalsForm);
                setVitalsEdited(true);
              }
              if (draft.historyEdited) {
                setPastMedicalItems(normalizeConditionRecords(draft.pastMedicalItems, activeCatalog));
                setFamilyMedicalItems(
                  normalizeFamilyConditionRecords(draft.familyMedicalItems, activeCatalog)
                );
                setMedicalHistoryNotes(draft.medicalHistoryNotes);
                setFamilyHistoryNotes(draft.familyHistoryNotes);
                setHistoryEdited(true);
              }
              if (draft.socialEdited) {
                setSocialHistory(draft.socialHistory);
                setSocialEdited(true);
              }
              if (draft.reproEdited) {
                setReproHistory(draft.reproHistory);
                setReproEdited(true);
              }
              if (draft.ncdEdited) {
                setNcdAnswers(draft.ncdAnswers);
                setNcdFbsMgDl(draft.ncdFbsMgDl);
                setNcdFbsDate(draft.ncdFbsDate);
                setNcdTotalCholMgDl(draft.ncdTotalCholMgDl);
                setNcdTotalCholDate(draft.ncdTotalCholDate);
                setNcdUrineKetonesValue(draft.ncdUrineKetonesValue);
                setNcdUrineKetonesDate(draft.ncdUrineKetonesDate);
                setNcdUrineProteinValue(draft.ncdUrineProteinValue);
                setNcdUrineProteinDate(draft.ncdUrineProteinDate);
                setNcdEdited(true);
              }
              setNurseScreeningNotes(draft.nurseScreeningNotes);
              if (draft.peEdited) {
                setPeValues(draft.peValues);
                setPeEdited(true);
              }
              setAdultRoutineCodes(draft.adultRoutineCodes);
              setPediatricRoutineCodes(draft.pediatricRoutineCodes);
              setPrenatalRoutineCodes(draft.prenatalRoutineCodes);
              setBreastCancerSelected(draft.breastCancerSelected);
              setCervicalCancerSelected(draft.cervicalCancerSelected);
              setColorectalCancerSelected(draft.colorectalCancerSelected);
              setProstateCancerSelected(draft.prostateCancerSelected);
              setDisposition(draft.disposition);
              setClinicalImpression(draft.clinicalImpression);
              setPreventiveCounselingNotes(draft.preventiveCounselingNotes);
              setRecommendedFollowUpDate(draft.recommendedFollowUpDate);
              setRestoredDraftFromRefresh(true);
            }
          }
          if (!draftApplied) {
            setActiveStep(serverStep);
          }
        } else {
          setScreeningId(null);
          setScreeningStatus('InProgress');
          setActiveQueueItemId(queueItemId ?? null);
          queueItemIdRef.current = queueItemId ?? null;
          const defaultMode =
            initialTrack === 'YakapAvailment' ? 'YakapAvailment' : 'Regular';
          setWorkflowMode(defaultMode);
          setScreeningType(
            defaultMode === 'YakapAvailment' ? 'YakapFpe' : 'AnnualPhysicalExam'
          );
          setPhilHealthAtc(defaultWalkInAtc);
          setScreeningPhysicalExamId(null);
          setStep2Saved(false);

          setVitalsEdited(false);
          setAllergyEdited(false);
          setHistoryEdited(false);
          setSocialEdited(false);
          setReproEdited(false);
          setImmunizationsEdited(false);
          setNcdEdited(false);
          setPeEdited(false);

          let draftApplied = false;
          if (!options?.ignoreDraft) {
            const draft = readScreeningDraft(targetPatient.id, queueItemId ?? null);
            if (draft) {
              draftApplied = true;
              setActiveStep(draft.activeStep);
              setScreeningType(draft.screeningType);
              setWorkflowMode(draft.workflowMode);
              setPhilHealthAtc(draft.philHealthAtc);
              setIsWalkedIn(draft.isWalkedIn);
              setServiceDeliveryMethod(draft.serviceDeliveryMethod);
              setStep2Saved(Boolean(draft.step2Saved));
              if (draft.vitalsEdited) {
                setVitalsForm(draft.vitalsForm);
                setVitalsEdited(true);
              }
              if (draft.historyEdited) {
                setPastMedicalItems(normalizeConditionRecords(draft.pastMedicalItems, activeCatalog));
                setFamilyMedicalItems(
                  normalizeFamilyConditionRecords(draft.familyMedicalItems, activeCatalog)
                );
                setMedicalHistoryNotes(draft.medicalHistoryNotes);
                setFamilyHistoryNotes(draft.familyHistoryNotes);
                setHistoryEdited(true);
              }
              if (draft.socialEdited) {
                setSocialHistory(draft.socialHistory);
                setSocialEdited(true);
              }
              if (draft.reproEdited) {
                setReproHistory(draft.reproHistory);
                setReproEdited(true);
              }
              if (draft.ncdEdited) {
                setNcdAnswers(draft.ncdAnswers);
                setNcdFbsMgDl(draft.ncdFbsMgDl);
                setNcdFbsDate(draft.ncdFbsDate);
                setNcdTotalCholMgDl(draft.ncdTotalCholMgDl);
                setNcdTotalCholDate(draft.ncdTotalCholDate);
                setNcdUrineKetonesValue(draft.ncdUrineKetonesValue);
                setNcdUrineKetonesDate(draft.ncdUrineKetonesDate);
                setNcdUrineProteinValue(draft.ncdUrineProteinValue);
                setNcdUrineProteinDate(draft.ncdUrineProteinDate);
                setNcdEdited(true);
              }
              setNurseScreeningNotes(draft.nurseScreeningNotes);
              if (draft.peEdited) {
                setPeValues(draft.peValues);
                setPeEdited(true);
              }
              setAdultRoutineCodes(draft.adultRoutineCodes);
              setPediatricRoutineCodes(draft.pediatricRoutineCodes);
              setPrenatalRoutineCodes(draft.prenatalRoutineCodes);
              setBreastCancerSelected(draft.breastCancerSelected);
              setCervicalCancerSelected(draft.cervicalCancerSelected);
              setColorectalCancerSelected(draft.colorectalCancerSelected);
              setProstateCancerSelected(draft.prostateCancerSelected);
              setDisposition(draft.disposition);
              setClinicalImpression(draft.clinicalImpression);
              setPreventiveCounselingNotes(draft.preventiveCounselingNotes);
              setRecommendedFollowUpDate(draft.recommendedFollowUpDate);
              setRestoredDraftFromRefresh(true);
            }
          }
          if (!draftApplied) {
            setActiveStep(1);
          }
        }

        const patientCohort = resolveCohort(targetPatient);
        setActiveCohortTab(patientCohort.isPediatric ? 'pediatric' : 'adult');
      } catch (e: any) {
        if (requestId === loadRequestIdRef.current) {
          setLoadError(e?.message || 'Failed to load health screening data.');
        }
      } finally {
        if (requestId === loadRequestIdRef.current) {
          hydratedRef.current = true;
          setLoading(false);
        }
      }
    },
    [hasPhilHealthAccreditation, initialScreeningId, initialTrack, queueItemId, resetScreeningState]
  );

  const sessionKey =
    visible && patient
      ? `${patient.id}:${initialScreeningId ?? ''}:${queueItemId ?? ''}:${initialTrack}`
      : null;

  useEffect(() => {
    if (sessionKey && latestPatientRef.current) {
      if (loadedSessionKeyRef.current === sessionKey) {
        return;
      }
      loadedSessionKeyRef.current = sessionKey;
      void loadModalData(latestPatientRef.current);
    } else {
      loadedSessionKeyRef.current = null;
      loadRequestIdRef.current++;
      resetScreeningState();
    }
  }, [sessionKey, loadModalData, resetScreeningState]);

  const initialDefaultMode: 'Regular' | 'YakapAvailment' =
    initialTrack === 'YakapAvailment' ? 'YakapAvailment' : 'Regular';
  const initialDefaultType: HealthScreeningType =
    initialDefaultMode === 'YakapAvailment' ? 'YakapFpe' : 'AnnualPhysicalExam';

  // Auto-save unsaved screening progress to tab-scoped sessionStorage so browser refresh preserves edits
  useEffect(() => {
    if (
      !visible ||
      !patient ||
      loading ||
      loadError ||
      !hydratedRef.current ||
      completedScreening ||
      screeningStatus === 'Completed'
    ) {
      return;
    }

    const hasDraftState =
      vitalsEdited ||
      historyEdited ||
      socialEdited ||
      reproEdited ||
      ncdEdited ||
      peEdited ||
      nurseScreeningNotes.trim().length > 0 ||
      clinicalImpression.trim().length > 0 ||
      preventiveCounselingNotes.trim().length > 0 ||
      philHealthAtc.trim().length > 0 ||
      activeStep > 1 ||
      workflowMode !== initialDefaultMode ||
      screeningType !== initialDefaultType;

    if (!hasDraftState) return;

    writeScreeningDraft({
      version: 1,
      patientId: patient.id,
      queueItemId: activeQueueItemId,
      screeningId,
      activeStep,
      screeningType,
      workflowMode,
      philHealthAtc,
      isWalkedIn,
      serviceDeliveryMethod,
      vitalsForm,
      vitalsEdited,
      pastMedicalItems,
      familyMedicalItems,
      medicalHistoryNotes,
      familyHistoryNotes,
      historyEdited,
      socialHistory,
      socialEdited,
      reproHistory,
      reproEdited,
      ncdAnswers,
      ncdFbsMgDl,
      ncdFbsDate,
      ncdTotalCholMgDl,
      ncdTotalCholDate,
      ncdUrineKetonesValue,
      ncdUrineKetonesDate,
      ncdUrineProteinValue,
      ncdUrineProteinDate,
      ncdEdited,
      nurseScreeningNotes,
      peValues,
      peEdited,
      adultRoutineCodes,
      pediatricRoutineCodes,
      prenatalRoutineCodes,
      breastCancerSelected,
      cervicalCancerSelected,
      colorectalCancerSelected,
      prostateCancerSelected,
      disposition,
      clinicalImpression,
      preventiveCounselingNotes,
      recommendedFollowUpDate,
      step2Saved,
      updatedAt: Date.now(),
    });
  }, [
    visible,
    patient,
    loading,
    loadError,
    completedScreening,
    screeningStatus,
    activeQueueItemId,
    screeningId,
    activeStep,
    screeningType,
    workflowMode,
    philHealthAtc,
    isWalkedIn,
    serviceDeliveryMethod,
    vitalsForm,
    vitalsEdited,
    pastMedicalItems,
    familyMedicalItems,
    medicalHistoryNotes,
    familyHistoryNotes,
    historyEdited,
    socialHistory,
    socialEdited,
    reproHistory,
    reproEdited,
    ncdAnswers,
    ncdFbsMgDl,
    ncdFbsDate,
    ncdTotalCholMgDl,
    ncdTotalCholDate,
    ncdUrineKetonesValue,
    ncdUrineKetonesDate,
    ncdUrineProteinValue,
    ncdUrineProteinDate,
    ncdEdited,
    nurseScreeningNotes,
    peValues,
    peEdited,
    adultRoutineCodes,
    pediatricRoutineCodes,
    prenatalRoutineCodes,
    breastCancerSelected,
    cervicalCancerSelected,
    colorectalCancerSelected,
    prostateCancerSelected,
    disposition,
    clinicalImpression,
    preventiveCounselingNotes,
    recommendedFollowUpDate,
    step2Saved,
    initialDefaultMode,
    initialDefaultType,
  ]);

  const handleResetDraftToSaved = useCallback(() => {
    if (!patient) return;
    clearScreeningDraft(patient.id, activeQueueItemId);
    void loadModalData(patient, { ignoreDraft: true });
  }, [patient, activeQueueItemId, loadModalData]);

  const handleExplicitClose = useCallback(() => {
    clearScreeningDraft(patient?.id, queueItemIdRef.current);
    onClose();
  }, [patient?.id, onClose]);

  // Station 1 live anthropometrics & red-flag detection
  const bmiEval = useMemo(
    () =>
      evaluateBmi(
        vitalsForm.height,
        vitalsForm.weight,
        vitalsForm.bodyLength,
        cohort.isInfant,
        cohort.isPediatric
      ),
    [vitalsForm.height, vitalsForm.weight, vitalsForm.bodyLength, cohort.isInfant, cohort.isPediatric]
  );

  const centralObesityEval = useMemo(
    () =>
      evaluateCentralObesity(
        vitalsForm.waistCircumference,
        vitalsForm.hipCircumference,
        cohort.isFemale
      ),
    [vitalsForm.waistCircumference, vitalsForm.hipCircumference, cohort.isFemale]
  );

  // Pediatric Z-score live preview (only triggers after user edits height/weight)
  useEffect(() => {
    if (!visible || !patient || !cohort.isUnderFive || !vitalsEdited) {
      return;
    }
    const lenOrHt = parseFloat(vitalsForm.bodyLength || vitalsForm.height);
    const wt = parseFloat(vitalsForm.weight);
    if (isNaN(lenOrHt) || lenOrHt <= 0 || isNaN(wt) || wt <= 0 || !patient.dateOfBirth) {
      setZScorePreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      const [zRes] = await clinicService.calculatePediatricZScore({
        dateOfBirth: patient.dateOfBirth,
        sex: patient.sex,
        lengthOrHeightCm: lenOrHt,
        weightKg: wt,
        isMeasuredRecumbent: vitalsForm.posture === 'RECUMBENT',
      });
      if (zRes) {
        setZScorePreview(zRes);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [
    visible,
    patient,
    cohort.isUnderFive,
    vitalsEdited,
    vitalsForm.bodyLength,
    vitalsForm.height,
    vitalsForm.weight,
    vitalsForm.posture,
  ]);

  const redFlags = useMemo(() => {
    const flags: string[] = [];
    const sbp = parseFloat(vitalsForm.bpSys);
    const dbp = parseFloat(vitalsForm.bpDia);
    const temp = parseFloat(vitalsForm.temp);
    const spo2 = parseFloat(vitalsForm.spo2);
    const hr = parseFloat(vitalsForm.hr);

    if ((!isNaN(sbp) && sbp >= 180) || (!isNaN(dbp) && dbp >= 120)) {
      flags.push(`Hypertensive crisis BP (${vitalsForm.bpSys || '?'}/${vitalsForm.bpDia || '?'})`);
    }
    if (!isNaN(temp) && temp >= 38.0) {
      flags.push(`Fever (${vitalsForm.temp}°C)`);
    }
    if (!isNaN(spo2) && spo2 < 94) {
      flags.push(`Low SpO2 (${vitalsForm.spo2}%)`);
    }
    if (!isNaN(hr) && (hr < 50 || hr > 120)) {
      flags.push(`Abnormal Heart Rate (${vitalsForm.hr} bpm)`);
    }
    return flags;
  }, [vitalsForm.bpSys, vitalsForm.bpDia, vitalsForm.temp, vitalsForm.spo2, vitalsForm.hr]);

  // Live PhilPEN computation fed by Station 1 BP/BMI & Station 2 smoking status
  const philpenResult = useMemo(() => {
    const sbp = parseFloat(vitalsForm.bpSys);
    const dbp = parseFloat(vitalsForm.bpDia);
    const fbs = parseFloat(ncdFbsMgDl);
    const chol = parseFloat(ncdTotalCholMgDl);
    const isSmoker =
      socialHistory.smokingStatus === 'current' || Boolean(socialHistory.isSmoker);

    return calculatePhilPenRisk({
      ageYears: cohort.ageYears,
      sex: patient?.sex,
      isSmoker,
      systolicBp: !isNaN(sbp) ? sbp : undefined,
      diastolicBp: !isNaN(dbp) ? dbp : undefined,
      diagnosedDiabetes: ncdAnswers.diagnosedDiabetes === true,
      fastingBloodSugarMgDl: !isNaN(fbs) ? fbs : undefined,
      totalCholesterolMgDl: !isNaN(chol) ? chol : undefined,
      bodyMassIndex: bmiEval?.bmi,
      hasAnginaOrHeartAttack: ncdAnswers.hasHistoryAnginaHeartAttack === true,
      hasStrokeOrTia: ncdAnswers.hasHistoryStrokeOrTia === true,
      severeChestPainOver30Mins: ncdAnswers.severeChestPainOver30Mins === true,
      transientNeurologicalDeficits: ncdAnswers.transientNeurologicalDeficits === true,
    });
  }, [
    cohort.ageYears,
    patient?.sex,
    vitalsForm.bpSys,
    vitalsForm.bpDia,
    bmiEval?.bmi,
    socialHistory.smokingStatus,
    socialHistory.isSmoker,
    ncdAnswers,
    ncdFbsMgDl,
    ncdTotalCholMgDl,
  ]);

  const updateVitalsField = useCallback(
    <K extends keyof VitalsFormState>(field: K, value: VitalsFormState[K]) => {
      setVitalsForm((prev) => ({ ...prev, [field]: value }));
      setVitalsErrors((prev) => ({ ...prev, [field]: undefined }));
      setVitalsEdited(true);
    },
    []
  );

  // Lazy direct-visit materialization (ONLY called on explicit save/order/complete/escalate)
  const ensureActiveQueueItem = useCallback(async (): Promise<string | null> => {
    if (!patient) return null;
    if (queueItemIdRef.current) {
      return queueItemIdRef.current;
    }
    const [visit, err] = await clinicService.ensureDirectVisit({
      patientId: patient.id,
      patientName: patient.fullName,
      visitType: 'PreventiveHealthAssessment',
      visitWorkflowMode: workflowMode,
      initialStatus: 'Triaged',
      chiefComplaint: getScreeningTypeLabel(screeningType),
      allowDuplicateActive,
    });
    if (err || !visit) {
      notify.error(err?.message || 'Unable to materialize visit record for screening.');
      return null;
    }
    queueItemIdRef.current = visit.id;
    setActiveQueueItemId(visit.id);
    clearScreeningDraft(patient.id, null);
    onSessionQueueLinked?.(visit.id);
    return visit.id;
  }, [patient, workflowMode, screeningType, allowDuplicateActive, onSessionQueueLinked]);

  const buildProgressPayload = useCallback(
    (overrides?: {
      queueItemId?: string | null;
      patientVitalsId?: string | null;
      patientPhysicalExamId?: string | null;
      ncdRiskAssessmentId?: string | null;
      sendToDoctor?: boolean;
    }) => {
      if (!patient) return null;
      return {
        screeningId: screeningId ?? undefined,
        patientId: patient.id,
        queueItemId: overrides?.queueItemId ?? queueItemIdRef.current ?? undefined,
        screeningType,
        workflowMode,
        allowDuplicateActive,
        sendToDoctor: overrides?.sendToDoctor,
        patientVitalsId: overrides?.patientVitalsId ?? patientVitalsId ?? undefined,
        patientPhysicalExamId:
          overrides?.patientPhysicalExamId ?? screeningPhysicalExamId ?? undefined,
        ncdRiskAssessmentId:
          overrides?.ncdRiskAssessmentId ?? ncdRiskAssessmentId ?? undefined,
        serviceItemId:
          workflowMode === 'Regular'
            ? clinicSettings?.defaultHealthScreeningServiceItemId ?? undefined
            : undefined,
        nurseScreeningNotes: nurseScreeningNotes.trim() || null,
        clinicalImpression: clinicalImpression.trim() || null,
        preventiveCounselingNotes: preventiveCounselingNotes.trim() || null,
        recommendedFollowUpDate: recommendedFollowUpDate.trim() || null,
        adultRoutineScreeningCode: adultRoutineCodes.join(',') || '0',
        pediatricRoutineScreeningCode: pediatricRoutineCodes.join(',') || '0',
        prenatalScreeningServicesCode: prenatalRoutineCodes.join(',') || '0',
        breastCancerScreeningCode: breastCancerSelected ? '11' : null,
        cervicalCancerScreeningCode: cervicalCancerSelected ? '13' : null,
        colorectalCancerScreeningCode: colorectalCancerSelected ? '12' : null,
        prostateCancerScreeningCode: prostateCancerSelected ? '14' : null,
        philHealthAtc:
          workflowMode === 'YakapAvailment' ? philHealthAtc.trim() || null : null,
        isWalkedIn: workflowMode === 'YakapAvailment' ? isWalkedIn : undefined,
        serviceDeliveryMethod:
          workflowMode === 'YakapAvailment' ? serviceDeliveryMethod : undefined,
      };
    },
    [
      patient,
      screeningId,
      screeningType,
      workflowMode,
      allowDuplicateActive,
      patientVitalsId,
      screeningPhysicalExamId,
      ncdRiskAssessmentId,
      clinicSettings?.defaultHealthScreeningServiceItemId,
      nurseScreeningNotes,
      clinicalImpression,
      preventiveCounselingNotes,
      recommendedFollowUpDate,
      adultRoutineCodes,
      pediatricRoutineCodes,
      prenatalRoutineCodes,
      breastCancerSelected,
      cervicalCancerSelected,
      colorectalCancerSelected,
      prostateCancerSelected,
      philHealthAtc,
      isWalkedIn,
      serviceDeliveryMethod,
    ]
  );

  // Persist Station 1 vitals
  const persistStation1Vitals = useCallback(
    async (resolvedQueueItemId: string): Promise<string | null> => {
      const hasAnyVital =
        Boolean(vitalsForm.bpSys.trim()) ||
        Boolean(vitalsForm.bpDia.trim()) ||
        Boolean(vitalsForm.hr.trim()) ||
        Boolean(vitalsForm.rr.trim()) ||
        Boolean(vitalsForm.temp.trim()) ||
        Boolean(vitalsForm.spo2.trim()) ||
        Boolean(vitalsForm.height.trim()) ||
        Boolean(vitalsForm.weight.trim()) ||
        Boolean(vitalsForm.bodyLength.trim()) ||
        Boolean(vitalsForm.headCircumference.trim()) ||
        Boolean(vitalsForm.midUpperArmCircumference.trim()) ||
        Boolean(vitalsForm.skinfoldThickness.trim()) ||
        Boolean(vitalsForm.limbsCircumference.trim()) ||
        Boolean(vitalsForm.waistCircumference.trim()) ||
        Boolean(vitalsForm.hipCircumference.trim()) ||
        Boolean(vitalsForm.visualAcuityLeft.trim()) ||
        Boolean(vitalsForm.visualAcuityRight.trim()) ||
        Boolean(vitalsForm.pain.trim()) ||
        Boolean(vitalsForm.notes.trim());

      if (!hasAnyVital && patientVitalsId) {
        return patientVitalsId;
      }
      if (!hasAnyVital && !vitalsEdited) {
        return patientVitalsId;
      }

      const payload: RecordTriageRequest = {
        nurseId: currentStaff?.id,
        recordedByNurseName: currentName || undefined,
        systolicBp: parseOptionalInt(vitalsForm.bpSys),
        diastolicBp: parseOptionalInt(vitalsForm.bpDia),
        heartRateBpm: parseOptionalInt(vitalsForm.hr),
        temperatureCelsius: parseOptionalFloat(vitalsForm.temp),
        respiratoryRateBreathsPerMin: parseOptionalInt(vitalsForm.rr),
        oxygenSaturationPercent: parseOptionalInt(vitalsForm.spo2),
        heightCm: parseOptionalFloat(vitalsForm.height),
        weightKg: parseOptionalFloat(vitalsForm.weight),
        painScore: parseOptionalInt(vitalsForm.pain),
        notes: vitalsForm.notes.trim() || undefined,
        visualAcuityLeft: vitalsForm.visualAcuityLeft.trim() || undefined,
        visualAcuityRight: vitalsForm.visualAcuityRight.trim() || undefined,
        headCircumferenceCm: parseOptionalFloat(vitalsForm.headCircumference),
        midUpperArmCircumferenceCm: parseOptionalFloat(
          vitalsForm.midUpperArmCircumference
        ),
        isMeasuredRecumbent: vitalsForm.posture === 'RECUMBENT',
        waistCircumferenceCm: parseOptionalFloat(vitalsForm.waistCircumference),
        hipCircumferenceCm: parseOptionalFloat(vitalsForm.hipCircumference),
        bodyLengthCm: parseOptionalFloat(vitalsForm.bodyLength),
        skinfoldThicknessMm: parseOptionalFloat(vitalsForm.skinfoldThickness),
        limbsCircumferenceCm: parseOptionalFloat(vitalsForm.limbsCircumference),
        zScoreWeightForAge: zScorePreview?.weightForAgeZScore,
        zScoreLengthForAge: zScorePreview?.heightForAgeZScore,
        zScoreWeightForLength: zScorePreview?.weightForHeightZScore,
        philHealthZScoreCategory: zScorePreview?.philHealthZScoreCategory,
        philHealthZScoreCode: zScorePreview?.philHealthZScoreCode,
        priority: redFlags.length > 0 ? 'Urgent' : vitalsForm.triagePriority,
        chiefComplaint: getScreeningTypeLabel(screeningType),
      };

      const [saved, err] = hasExistingQueueTriage
        ? await clinicService.updateTriage(resolvedQueueItemId, payload)
        : await clinicService.recordTriage(resolvedQueueItemId, payload);

      if (err || !saved) {
        const mapped = mapApiErrorsToVitalsFormErrors(err);
        if (Object.keys(mapped).length > 0) {
          setVitalsErrors(mapped);
        }
        notify.error(err?.message || 'Could not save vital signs.');
        return null;
      }

      setPatientVitalsId(saved.id);
      setHasExistingQueueTriage(true);
      setVitalsEdited(false);
      return saved.id;
    },
    [
      vitalsForm,
      patientVitalsId,
      vitalsEdited,
      currentStaff?.id,
      currentName,
      zScorePreview,
      redFlags.length,
      screeningType,
      hasExistingQueueTriage,
    ]
  );

  // Persist Station 2 dirty 1NF longitudinal sections
  const persistStation2Histories = useCallback(async (): Promise<{
    ncdId: string | null;
    ok: boolean;
  }> => {
    if (!patient) return { ncdId: ncdRiskAssessmentId, ok: false };

    let nextNcdId = ncdRiskAssessmentId;

    if (historyEdited) {
      const [, medErr] = await clinicService.savePastMedicalHistories(patient.id, {
        items: pastMedicalItems.map((m) => ({
          conditionTitle: m.conditionTitle,
          philHealthMdiseaseCode: m.philHealthMdiseaseCode ?? undefined,
          icd10Code: m.icd10Code ?? undefined,
          specificDescription: m.specificDescription ?? undefined,
          isResolved: m.isResolved,
          clinicalNotes: m.clinicalNotes ?? undefined,
        })),
        notes: medicalHistoryNotes.trim() || null,
      });
      if (medErr) {
        notify.error(medErr.message || 'Failed to save past medical history.');
        return { ncdId: nextNcdId, ok: false };
      }

      const [, famErr] = await clinicService.saveFamilyHistories(patient.id, {
        items: familyMedicalItems.map((f) => ({
          conditionTitle: f.conditionTitle,
          philHealthMdiseaseCode: f.philHealthMdiseaseCode ?? undefined,
          icd10Code: f.icd10Code ?? undefined,
          specificDescription: f.specificDescription ?? undefined,
          relationship: f.relationship ?? undefined,
          clinicalNotes: f.clinicalNotes ?? undefined,
        })),
        notes: familyHistoryNotes.trim() || null,
      });
      if (famErr) {
        notify.error(famErr.message || 'Failed to save family history.');
        return { ncdId: nextNcdId, ok: false };
      }
      setHistoryEdited(false);
    }

    if (socialEdited && !cohort.isPediatric) {
      const [, socErr] = await clinicService.updateSocialHistory(patient.id, {
        isSmoker: socialHistory.smokingStatus === 'current' || Boolean(socialHistory.isSmoker),
        smokingStatus: socialHistory.smokingStatus || 'never',
        packsPerDay: socialHistory.packsPerDay,
        yearsSmoking: socialHistory.yearsSmoking,
        smokingStoppedDate: socialHistory.smokingStoppedDate,
        isAlcoholDrinker:
          socialHistory.alcoholStatus === 'current' || Boolean(socialHistory.isAlcoholDrinker),
        alcoholStatus: socialHistory.alcoholStatus || 'never',
        alcoholFrequency: socialHistory.alcoholFrequency,
        usesIllicitDrugs: Boolean(socialHistory.usesIllicitDrugs),
        drugTypes: socialHistory.drugTypes,
        substanceUseHistory: socialHistory.substanceUseHistory,
        isSexuallyActive: Boolean(socialHistory.isSexuallyActive),
        physicalActivityFrequency: socialHistory.physicalActivityFrequency,
        dietaryHabits: socialHistory.dietaryHabits,
        remarks: socialHistory.remarks,
      });
      if (socErr) {
        notify.error(socErr.message || 'Failed to save social history.');
        return { ncdId: nextNcdId, ok: false };
      }
      setSocialEdited(false);
    }

    if (reproEdited && cohort.isFemale && cohort.ageYears >= 9) {
      const [, repErr] = await clinicService.updateReproductiveHistory(patient.id, {
        isApplicable: Boolean(reproHistory.isApplicable),
        menarcheAge: reproHistory.menarcheAge,
        lastMenstrualPeriod: reproHistory.lastMenstrualPeriod,
        periodDurationDays: reproHistory.periodDurationDays,
        cycleIntervalDays: reproHistory.cycleIntervalDays,
        isMenopausal: Boolean(reproHistory.isMenopausal),
        contraceptiveMethod: reproHistory.contraceptiveMethod,
        gravidity: reproHistory.gravidity ?? 0,
        parity: reproHistory.parity ?? 0,
        termBirths: reproHistory.termBirths ?? 0,
        pretermBirths: reproHistory.pretermBirths ?? 0,
        abortions: reproHistory.abortions ?? 0,
        livingChildren: reproHistory.livingChildren ?? 0,
        deliveryType: reproHistory.deliveryType,
        hadPreEclampsiaHypertension: Boolean(reproHistory.hadPreEclampsiaHypertension),
        receivedFamilyPlanningCounseling: Boolean(
          reproHistory.receivedFamilyPlanningCounseling
        ),
        remarks: reproHistory.remarks,
      });
      if (repErr) {
        notify.error(repErr.message || 'Failed to save reproductive history.');
        return { ncdId: nextNcdId, ok: false };
      }
      setReproEdited(false);
    }

    if (cohort.ageYears >= 20 && (ncdEdited || (!nextNcdId && workflowMode === 'YakapAvailment'))) {
      const fbsNum = parseFloat(ncdFbsMgDl);
      const hasValidFbs = !isNaN(fbsNum) && fbsNum > 0;
      const cholNum = parseFloat(ncdTotalCholMgDl);
      const hasValidChol = !isNaN(cholNum) && cholNum > 0;
      const hasChestPainVal = ncdAnswers.hasChestPain === true;
      const painWalkingUphillVal =
        hasChestPainVal && ncdAnswers.painWhenWalkingUphill === true;

      const ncdPayload = {
        assessmentDate: new Date().toISOString(),
        assessedByStaffId: currentStaff?.id,
        assessedByStaffName: currentName || 'Clinician',
        riskBand: philpenResult.riskBand,
        calculatedRiskScorePercent: philpenResult.calculatedScorePercent,
        eatsProcessedFoodWeekly:
          (ncdAnswers.eatsProcessedFoodWeekly as boolean | null | undefined) ?? undefined,
        threeServingsVegetablesDaily:
          (ncdAnswers.threeServingsVegetablesDaily as boolean | null | undefined) ?? undefined,
        twoToThreeServingsFruitDaily:
          (ncdAnswers.twoToThreeServingsFruitDaily as boolean | null | undefined) ?? undefined,
        physicalActivityAtLeast150MinsWeekly:
          (ncdAnswers.physicalActivityAtLeast150MinsWeekly as boolean | null | undefined) ??
          undefined,
        diagnosedDiabetes:
          ncdAnswers.diagnosedDiabetes === true
            ? 'Y'
            : ncdAnswers.diagnosedDiabetes === false
              ? 'N'
              : undefined,
        diabetesMedicationStatus:
          ncdAnswers.diagnosedDiabetes === true
            ? ((ncdAnswers.diabetesMedicationStatus as 'Y' | 'N' | null | undefined) ?? undefined)
            : undefined,
        hasPolyphagia: (ncdAnswers.hasPolyphagia as boolean | null | undefined) ?? undefined,
        hasPolydipsia: (ncdAnswers.hasPolydipsia as boolean | null | undefined) ?? undefined,
        hasPolyuria: (ncdAnswers.hasPolyuria as boolean | null | undefined) ?? undefined,
        hasRaisedBloodGlucose:
          (ncdAnswers.hasRaisedBloodGlucose as boolean | null | undefined) ??
          (hasValidFbs && fbsNum >= 126 ? true : undefined),
        fastingBloodSugarMgDl: hasValidFbs ? fbsNum : undefined,
        fastingBloodSugarDate:
          ncdAnswers.hasRaisedBloodGlucose === true && ncdFbsDate.trim()
            ? ncdFbsDate.trim()
            : undefined,
        hasRaisedBloodLipids:
          (ncdAnswers.hasRaisedBloodLipids as boolean | null | undefined) ??
          (hasValidChol && cholNum >= 200 ? true : undefined),
        totalCholesterolMgDl: hasValidChol ? cholNum : undefined,
        totalCholesterolDate:
          ncdAnswers.hasRaisedBloodLipids === true && ncdTotalCholDate.trim()
            ? ncdTotalCholDate.trim()
            : undefined,
        urineKetonesPresent:
          (ncdAnswers.urineKetonesPresent as boolean | null | undefined) ?? undefined,
        urineKetonesValue:
          ncdAnswers.urineKetonesPresent === true && ncdUrineKetonesValue.trim()
            ? ncdUrineKetonesValue.trim()
            : undefined,
        urineKetonesDate:
          ncdAnswers.urineKetonesPresent === true && ncdUrineKetonesDate.trim()
            ? ncdUrineKetonesDate.trim()
            : undefined,
        urineProteinPresent:
          (ncdAnswers.urineProteinPresent as boolean | null | undefined) ?? undefined,
        urineProteinValue:
          ncdAnswers.urineProteinPresent === true && ncdUrineProteinValue.trim()
            ? ncdUrineProteinValue.trim()
            : undefined,
        urineProteinDate:
          ncdAnswers.urineProteinPresent === true && ncdUrineProteinDate.trim()
            ? ncdUrineProteinDate.trim()
            : undefined,
        hasChestPain: (ncdAnswers.hasChestPain as boolean | null | undefined) ?? undefined,
        painInCenterOfChestOrLeftArm: hasChestPainVal
          ? ((ncdAnswers.painInCenterOfChestOrLeftArm as boolean | null | undefined) ?? undefined)
          : undefined,
        painWhenWalkingUphill: hasChestPainVal
          ? ((ncdAnswers.painWhenWalkingUphill as boolean | null | undefined) ?? undefined)
          : undefined,
        slowsDownWhenPainOccurs: painWalkingUphillVal
          ? ((ncdAnswers.slowsDownWhenPainOccurs as boolean | null | undefined) ?? undefined)
          : undefined,
        painRelievedWithin10Mins: painWalkingUphillVal
          ? ((ncdAnswers.painRelievedWithin10Mins as boolean | null | undefined) ?? undefined)
          : undefined,
        painRelievedByNitrates: painWalkingUphillVal
          ? ((ncdAnswers.painRelievedByNitrates as boolean | null | undefined) ?? undefined)
          : undefined,
        severeChestPainOver30Mins:
          (ncdAnswers.severeChestPainOver30Mins as boolean | null | undefined) ?? undefined,
        transientNeurologicalDeficits:
          (ncdAnswers.transientNeurologicalDeficits as boolean | null | undefined) ?? undefined,
        hasHistoryAnginaHeartAttack:
          (ncdAnswers.hasHistoryAnginaHeartAttack as boolean | null | undefined) ?? undefined,
        hasHistoryStrokeOrTia:
          (ncdAnswers.hasHistoryStrokeOrTia as boolean | null | undefined) ?? undefined,
      };

      const [savedNcd, ncdErr] = nextNcdId
        ? await clinicService.updateNcdRiskAssessment(patient.id, nextNcdId, ncdPayload)
        : await clinicService.saveNcdRiskAssessment(patient.id, ncdPayload);

      if (ncdErr || !savedNcd) {
        notify.error(ncdErr?.message || 'Failed to save PhilPEN NCD risk assessment.');
        return { ncdId: nextNcdId, ok: false };
      }
      nextNcdId = savedNcd.id;
      setNcdRiskAssessmentId(savedNcd.id);
      setNcdEdited(false);
    }

    return { ncdId: nextNcdId, ok: true };
  }, [
    patient,
    ncdRiskAssessmentId,
    historyEdited,
    pastMedicalItems,
    medicalHistoryNotes,
    familyMedicalItems,
    familyHistoryNotes,
    socialEdited,
    cohort.isPediatric,
    cohort.isFemale,
    cohort.ageYears,
    socialHistory,
    reproEdited,
    reproHistory,
    ncdEdited,
    workflowMode,
    ncdFbsMgDl,
    ncdFbsDate,
    ncdTotalCholMgDl,
    ncdTotalCholDate,
    ncdUrineKetonesValue,
    ncdUrineKetonesDate,
    ncdUrineProteinValue,
    ncdUrineProteinDate,
    currentStaff?.id,
    currentName,
    philpenResult.riskBand,
    philpenResult.calculatedScorePercent,
    ncdAnswers,
  ]);

  // Persist Station 3 Physical Exam
  const persistStation3PhysicalExam = useCallback(async (): Promise<string | null> => {
    if (!patient) return null;
    if (!peEdited && patientPhysicalExamId) {
      setScreeningPhysicalExamId(patientPhysicalExamId);
      return patientPhysicalExamId;
    }
    const [savedPe, peErr] = await clinicService.updatePatientPhysicalExam(patient.id, {
      genSurveyId: peValues.genSurveyId || '1',
      genSurveyRemarks: peValues.genSurveyRemarks || null,
      skinId: peValues.skinId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.skinId,
      skinRemarks: peValues.skinRemarks || null,
      heentId: peValues.heentId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heentId,
      heentRemarks: peValues.heentRemarks || null,
      chestId: peValues.chestId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.chestId,
      chestRemarks: peValues.chestRemarks || null,
      heartId: peValues.heartId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heartId,
      heartRemarks: peValues.heartRemarks || null,
      abdomenId: peValues.abdomenId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.abdomenId,
      abdomenRemarks: peValues.abdomenRemarks || null,
      neuroId: peValues.neuroId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.neuroId,
      neuroRemarks: peValues.neuroRemarks || null,
      guId: peValues.guId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.guId,
      guRemarks: peValues.guRemarks || null,
      rectalId: peValues.rectalId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.rectalId,
      rectalRemarks: peValues.rectalRemarks || null,
    });
    if (peErr || !savedPe) {
      notify.error(peErr?.message || 'Failed to save Physical Examination.');
      return null;
    }
    setPatientPhysicalExamId(savedPe.id);
    setScreeningPhysicalExamId(savedPe.id);
    setPeEdited(false);
    return savedPe.id;
  }, [patient, peEdited, patientPhysicalExamId, peValues]);

  // Save Station 1 & advance
  const handleSaveStation1AndNext = useCallback(async () => {
    if (!patient || saving) return;
    setSaving(true);
    try {
      const qId = await ensureActiveQueueItem();
      if (!qId) return;

      const vitalsId = await persistStation1Vitals(qId);
      if (vitalsEdited && !vitalsId) return;

      const progressPayload = buildProgressPayload({
        queueItemId: qId,
        patientVitalsId: vitalsId ?? patientVitalsId,
      });
      if (!progressPayload) return;

      const [saved, err] = await clinicService.saveHealthScreeningProgress(progressPayload);
      if (err || !saved) {
        notify.error(err?.message || 'Could not save health screening progress.');
        return;
      }
      setScreeningId(saved.id);
      setScreeningStatus(saved.status);
      notify.success('Vitals & screening progress saved.');
      setActiveStep(2);
    } finally {
      setSaving(false);
    }
  }, [
    patient,
    saving,
    ensureActiveQueueItem,
    persistStation1Vitals,
    vitalsEdited,
    buildProgressPayload,
    patientVitalsId,
  ]);

  // Save Station 2 & Send to Doctor (or Continue to Station 3)
  const handleSaveStation2 = useCallback(
    async (sendToDoctor: boolean) => {
      if (!patient || saving) return;
      setSaving(true);
      try {
        const qId = await ensureActiveQueueItem();
        if (!qId) return;

        let latestVitalsId = patientVitalsId;
        if (vitalsEdited || !latestVitalsId) {
          latestVitalsId = await persistStation1Vitals(qId);
          if (vitalsEdited && !latestVitalsId) return;
        }

        const { ncdId, ok } = await persistStation2Histories();
        if (!ok) return;

        const progressPayload = buildProgressPayload({
          queueItemId: qId,
          patientVitalsId: latestVitalsId,
          ncdRiskAssessmentId: ncdId,
          sendToDoctor,
        });
        if (!progressPayload) return;

        const [saved, err] = await clinicService.saveHealthScreeningProgress(progressPayload);
        if (err || !saved) {
          notify.error(err?.message || 'Could not save screening intake.');
          return;
        }
        setScreeningId(saved.id);
        setScreeningStatus(saved.status);
        setStep2Saved(true);
        onSuccess?.(saved);

        if (sendToDoctor) {
          clearScreeningDraft(patient.id, qId);
          notify.success('Health screening saved and routed to Physician (Awaiting Doctor PE).');
          onClose();
        } else {
          notify.success('History & risk assessment saved.');
          setActiveStep(3);
        }
      } finally {
        setSaving(false);
      }
    },
    [
      patient,
      saving,
      ensureActiveQueueItem,
      patientVitalsId,
      vitalsEdited,
      persistStation1Vitals,
      persistStation2Histories,
      buildProgressPayload,
      onSuccess,
      onClose,
    ]
  );

  // Save Station 3 & advance to Station 4
  const handleSaveStation3AndNext = useCallback(async () => {
    if (!patient || saving) return;
    setSaving(true);
    try {
      const qId = await ensureActiveQueueItem();
      if (!qId) return;

      const peId = await persistStation3PhysicalExam();
      if (!peId) return;
      setScreeningPhysicalExamId(peId);

      const progressPayload = buildProgressPayload({
        queueItemId: qId,
        patientPhysicalExamId: peId,
      });
      if (!progressPayload) return;

      const [saved, err] = await clinicService.saveHealthScreeningProgress(progressPayload);
      if (err || !saved) {
        notify.error(err?.message || 'Could not save Physical Exam progress.');
        return;
      }
      setScreeningId(saved.id);
      setScreeningStatus(saved.status);
      notify.success('Physical exam & preventive screenings saved.');
      setActiveStep(4);
    } finally {
      setSaving(false);
    }
  }, [
    patient,
    saving,
    ensureActiveQueueItem,
    persistStation3PhysicalExam,
    buildProgressPayload,
  ]);

  // Escalate to MD Consultation (from Station 1 red flag or Station 4)
  const handleEscalateToConsultation = useCallback(
    async (reason?: string) => {
      if (!patient || saving) return;
      setSaving(true);
      try {
        const qId = await ensureActiveQueueItem();
        if (!qId) return;

        let currentVitalsId = patientVitalsId;
        if (vitalsEdited || !currentVitalsId) {
          currentVitalsId = await persistStation1Vitals(qId);
          if (vitalsEdited && !currentVitalsId) return;
        }

        let currentScreeningId = screeningId;
        if (!currentScreeningId) {
          const progressPayload = buildProgressPayload({
            queueItemId: qId,
            patientVitalsId: currentVitalsId,
          });
          if (progressPayload) {
            const [created] = await clinicService.saveHealthScreeningProgress(progressPayload);
            if (created) {
              currentScreeningId = created.id;
              setScreeningId(created.id);
            }
          }
        }

        if (currentScreeningId) {
          const [escalated, escErr] = await clinicService.escalateHealthScreening(
            currentScreeningId,
            {
              escalationReason:
                reason ||
                (redFlags.length > 0
                  ? `Red-flag vitals detected: ${redFlags.join('; ')}`
                  : clinicalImpression.trim() || 'Escalated from Health Screening'),
              isUrgent: redFlags.length > 0,
            }
          );
          if (escErr) {
            notify.error(escErr.message || 'Could not escalate screening to consultation.');
            return;
          }
          if (escalated) {
            setScreeningStatus(escalated.status);
            onSuccess?.(escalated);
          }
        } else {
          await clinicService.escalateToConsultation(qId, {
            priority: redFlags.length > 0 ? 'Urgent' : 'Routine',
            escalationReason: reason || redFlags.join('; ') || 'Escalated from Health Screening',
          });
        }

        clearScreeningDraft(patient.id, qId);
        notify.success('Visit escalated to Physician Consultation with recorded vitals intact.');
        onClose();
        onEscalateToConsultation?.({
          patient,
          queueItemId: qId,
          workflowMode,
        });
      } finally {
        setSaving(false);
      }
    },
    [
      patient,
      saving,
      ensureActiveQueueItem,
      patientVitalsId,
      vitalsEdited,
      persistStation1Vitals,
      screeningId,
      buildProgressPayload,
      redFlags,
      clinicalImpression,
      onSuccess,
      onClose,
      onEscalateToConsultation,
      workflowMode,
    ]
  );

  // Authority resolution for Station 4 sign-off
  const requiresPhysicianForType =
    workflowMode === 'YakapAvailment'
      ? !allowNurseYakapFacilitator
      : screeningType === 'AnnualPhysicalExam' ||
        screeningType === 'PreEmployment' ||
        screeningType === 'SchoolPhysical';

  const canCompleteSelectedTrack = canPhysicianSignOff
    ? true
    : workflowMode === 'YakapAvailment'
      ? canNurseScreen && allowNurseYakapFacilitator
      : (screeningType === 'RoutineWellness' || screeningType === 'CommunityScreening') &&
        canNurseScreen;

  // YAKAP FPE Readiness Checklist
  const yakapReadiness = useMemo(() => {
    const effectivePin =
      coverage?.membership?.philHealthPin ||
      coverage?.philHealthNumber ||
      patient?.philHealthNumber ||
      '';
    const hasValidPin = validatePhilHealthPinMod11(effectivePin).isValid;
    const currentYear = new Date().getFullYear();
    const hasActiveEnlistment = Boolean(
      coverage?.currentYearFpeStatus?.hasActiveEnlistment ||
        coverage?.enlistments?.some(
          (e) => e.effectiveYear === currentYear && e.status !== 'Expired' && e.status !== 'Cancelled'
        )
    );
    const hasAtcOrWalkIn = Boolean(philHealthAtc.trim() || isWalkedIn);
    const hasVitals = Boolean(
      patientVitalsId ||
        vitalsForm.bpSys.trim() ||
        vitalsForm.height.trim() ||
        vitalsForm.weight.trim()
    );
    const hasPhysicalExam = Boolean(screeningPhysicalExamId || peEdited);
    const hasNcdRisk = cohort.ageYears < 20 || Boolean(ncdRiskAssessmentId || ncdEdited);

    return {
      hasValidPin,
      hasActiveEnlistment,
      hasAtcOrWalkIn,
      hasVitals,
      hasPhysicalExam,
      hasNcdRisk,
      isReady:
        hasValidPin &&
        hasActiveEnlistment &&
        hasAtcOrWalkIn &&
        hasVitals &&
        hasPhysicalExam &&
        hasNcdRisk,
    };
  }, [
    coverage,
    patient?.philHealthNumber,
    philHealthAtc,
    isWalkedIn,
    patientVitalsId,
    vitalsForm.bpSys,
    vitalsForm.height,
    vitalsForm.weight,
    screeningPhysicalExamId,
    peEdited,
    cohort.ageYears,
    ncdRiskAssessmentId,
    ncdEdited,
  ]);

  // Complete Station 4 Sign-Off
  const handleCompleteSignOff = useCallback(async () => {
    if (!patient || saving) return;
    if (disposition === 'EscalatedToConsultation') {
      await handleEscalateToConsultation(clinicalImpression.trim() || undefined);
      return;
    }

    if (!canCompleteSelectedTrack) {
      notify.error('Physician authority is required to sign off this screening type.');
      return;
    }

    setSaving(true);
    try {
      const qId = await ensureActiveQueueItem();
      if (!qId) return;

      let vitalsId = patientVitalsId;
      if (vitalsEdited || !vitalsId) {
        vitalsId = await persistStation1Vitals(qId);
        if (vitalsEdited && !vitalsId) return;
      }

      const { ncdId, ok: histOk } = await persistStation2Histories();
      if (!histOk) return;

      let peId = patientPhysicalExamId;
      if (peEdited || ((canPhysicianSignOff || requiresPhysicianForType) && !peId)) {
        peId = await persistStation3PhysicalExam();
        if (!peId && (peEdited || requiresPhysicianForType)) return;
      }

      let currentScreeningId = screeningId;
      const progressPayload = buildProgressPayload({
        queueItemId: qId,
        patientVitalsId: vitalsId,
        patientPhysicalExamId: peId,
        ncdRiskAssessmentId: ncdId,
      });
      if (progressPayload) {
        const [saved, saveErr] = await clinicService.saveHealthScreeningProgress(progressPayload);
        if (saveErr || !saved) {
          notify.error(saveErr?.message || 'Could not save screening before completion.');
          return;
        }
        currentScreeningId = saved.id;
        setScreeningId(saved.id);
      }

      if (!currentScreeningId) return;

      const facilitatorType =
        workflowMode === 'YakapAvailment'
          ? canPhysicianSignOff
            ? 'P'
            : 'H'
          : undefined;

      const [completed, compErr] = await clinicService.completeHealthScreening(currentScreeningId, {
        disposition,
        clinicalImpression: clinicalImpression.trim() || null,
        preventiveCounselingNotes: preventiveCounselingNotes.trim() || null,
        recommendedFollowUpDate: recommendedFollowUpDate.trim() || null,
        patientVitalsId: vitalsId,
        patientPhysicalExamId: peId,
        ncdRiskAssessmentId: ncdId,
        serviceItemId:
          workflowMode === 'Regular'
            ? clinicSettings?.defaultHealthScreeningServiceItemId ?? null
            : null,
        adultRoutineScreeningCode: adultRoutineCodes.join(',') || '0',
        pediatricRoutineScreeningCode: pediatricRoutineCodes.join(',') || '0',
        prenatalScreeningServicesCode: prenatalRoutineCodes.join(',') || '0',
        breastCancerScreeningCode: breastCancerSelected ? '11' : null,
        cervicalCancerScreeningCode: cervicalCancerSelected ? '13' : null,
        colorectalCancerScreeningCode: colorectalCancerSelected ? '12' : null,
        prostateCancerScreeningCode: prostateCancerSelected ? '14' : null,
        philHealthAtc: workflowMode === 'YakapAvailment' ? philHealthAtc.trim() || null : null,
        isWalkedIn: workflowMode === 'YakapAvailment' ? isWalkedIn : undefined,
        serviceDeliveryMethod:
          workflowMode === 'YakapAvailment' ? serviceDeliveryMethod : undefined,
        facilitatorType,
        facilitatorName: currentName || undefined,
      });

      if (compErr || !completed) {
        notify.error(compErr?.message || 'Could not finalize health screening.');
        return;
      }

      if (peId) {
        setScreeningPhysicalExamId(peId);
      }
      setStep2Saved(true);
      clearScreeningDraft(patient.id, qId);
      setScreeningStatus(completed.status);
      setProfilingTransNo(completed.profilingTransNo ?? null);
      setCompletedScreening(completed);
      notify.success(
        completed.profilingTransNo
          ? `YAKAP Health Screening completed (FPE Trans No: ${completed.profilingTransNo}).`
          : 'Health screening completed and signed off.'
      );
      onSuccess?.(completed);
    } finally {
      setSaving(false);
    }
  }, [
    patient,
    saving,
    disposition,
    handleEscalateToConsultation,
    clinicalImpression,
    canCompleteSelectedTrack,
    ensureActiveQueueItem,
    patientVitalsId,
    vitalsEdited,
    persistStation1Vitals,
    persistStation2Histories,
    patientPhysicalExamId,
    peEdited,
    canPhysicianSignOff,
    requiresPhysicianForType,
    persistStation3PhysicalExam,
    screeningId,
    buildProgressPayload,
    workflowMode,
    preventiveCounselingNotes,
    recommendedFollowUpDate,
    clinicSettings?.defaultHealthScreeningServiceItemId,
    adultRoutineCodes,
    pediatricRoutineCodes,
    prenatalRoutineCodes,
    breastCancerSelected,
    cervicalCancerSelected,
    colorectalCancerSelected,
    prostateCancerSelected,
    philHealthAtc,
    isWalkedIn,
    serviceDeliveryMethod,
    currentName,
    onSuccess,
  ]);

  // Order screening lab handler (Station 3)
  const handleOrderScreeningLab = useCallback(
    async (order: OrderCatalogItemPayload) => {
      if (!patient) return;
      const qId = await ensureActiveQueueItem();
      if (!qId) return;

      const [created, err] = await clinicService.createLabOrder({
        patientId: patient.id,
        patientName: patient.fullName,
        queueItemId: qId,
        orderedByDoctorId: order.orderedByDoctorId || currentStaff?.id,
        orderedByDoctorName: order.orderedByDoctorName || currentName || undefined,
        notes: 'Ordered during Health Screening',
        items: [
          {
            testName: order.name,
            category: order.category || 'Diagnostic',
            instructions: order.instructions,
            isDoneOutsideFacility: order.fulfillmentMode === 'outside',
            diagnosticFee: order.fulfillmentMode === 'outside' ? 0 : order.standardPrice,
            testCode: order.code || undefined,
          },
        ],
      });

      if (err || !created) {
        notify.error(err?.message || 'Could not order screening diagnostic.');
        return;
      }

      setOrderedLabs((prev) => [created, ...prev]);
      notify.success(`Ordered ${order.name}.`);
    },
    [patient, ensureActiveQueueItem, currentStaff?.id, currentName]
  );

  // Allergy add / remove handlers (Station 2)
  const handleAddAllergy = useCallback(
    async (req: CreateAllergyRequest): Promise<boolean> => {
      if (!patient) return false;
      setSavingAllergy(true);
      try {
        const [created, err] = await clinicService.createPatientAllergy(patient.id, {
          category: req.category,
          allergen: req.allergen,
          allergenDrugCode: req.allergenDrugCode ?? undefined,
          severity: req.severity,
          reactionManifestation: req.reactionManifestation ?? undefined,
          isAnaphylactic: req.isAnaphylactic,
          onsetDate: req.onsetDate ?? undefined,
          notes: req.notes ?? undefined,
        });
        if (err || !created) {
          notify.error(err?.message || 'Could not add allergy.');
          return false;
        }
        setAllergies((prev) => [created, ...prev]);
        setAllergyEdited(true);
        notify.success(`Recorded allergy to ${created.allergen}.`);
        return true;
      } finally {
        setSavingAllergy(false);
      }
    },
    [patient]
  );

  const handleRemoveAllergy = useCallback(
    async (index: number) => {
      if (!patient) return;
      const target = allergies[index];
      if (!target) return;
      const [, err] = await clinicService.deletePatientAllergy(patient.id, target.id);
      if (err) {
        notify.error(err.message || 'Could not remove allergy.');
        return;
      }
      setAllergies((prev) => prev.filter((a) => a.id !== target.id));
      setAllergyEdited(true);
    },
    [patient, allergies]
  );

  const diseaseList = useMemo(() => {
    const source = mdiseasesCatalog.length > 0 ? mdiseasesCatalog : PHILHEALTH_MDISEASES_CONDITIONS;
    return source.filter((item) => !isNoneHistoryEntry(item.code, item.description));
  }, [mdiseasesCatalog]);

  const lockedPersonalCodes = useMemo(
    () =>
      getLockedPersonalConditionCodes({
        problems: chart?.problems ?? [],
        allergies,
        catalogConditions: diseaseList,
      }),
    [chart?.problems, allergies, diseaseList]
  );

  const togglePersonalDisease = useCallback(
    (code: string, description: string) => {
      if (lockedPersonalCodes.has(code)) {
        notify.info(lockedPersonalCodes.get(code) || 'Condition is linked to active problems or allergies.');
        return;
      }
      setHistoryEdited(true);
      setPastMedicalItems((prev) => {
        const exists = prev.some((m) => m.philHealthMdiseaseCode === code);
        if (exists) {
          return prev.filter((m) => m.philHealthMdiseaseCode !== code);
        }
        return [
          ...prev,
          {
            id: `draft-${code}`,
            patientId: patient?.id ?? '',
            conditionTitle: description,
            philHealthMdiseaseCode: code,
            isResolved: false,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    },
    [lockedPersonalCodes, patient?.id]
  );

  const toggleFamilyDisease = useCallback(
    (code: string, description: string) => {
      setHistoryEdited(true);
      setFamilyMedicalItems((prev) => {
        const exists = prev.some((f) => f.philHealthMdiseaseCode === code);
        if (exists) {
          return prev.filter((f) => f.philHealthMdiseaseCode !== code);
        }
        return [
          ...prev,
          {
            id: `draft-fam-${code}`,
            patientId: patient?.id ?? '',
            conditionTitle: description,
            philHealthMdiseaseCode: code,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    },
    [patient?.id]
  );

  const cohortTabs = useMemo(
    () =>
      getScreeningCohortTabsForPatient({
        patientAgeYears: cohort.ageYears,
        patientDateOfBirth: patient?.dateOfBirth,
        patientSex: patient?.sex,
        adultSelectedCount: adultRoutineCodes.filter((c) => c !== '0').length,
        pediatricSelectedCount: pediatricRoutineCodes.filter((c) => c !== '0').length,
        prenatalSelectedCount: prenatalRoutineCodes.filter((c) => c !== '0').length,
      }),
    [
      cohort.ageYears,
      patient?.dateOfBirth,
      patient?.sex,
      adultRoutineCodes,
      pediatricRoutineCodes,
      prenatalRoutineCodes,
    ]
  );

  const handleSetAllPeNormal = useCallback(() => {
    setPeValues((prev) => ({
      ...prev,
      genSurveyId: '1',
      genSurveyRemarks: '',
      ...DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
      skinRemarks: '',
      heentRemarks: '',
      chestRemarks: '',
      heartRemarks: '',
      abdomenRemarks: '',
      neuroRemarks: '',
      guRemarks: '',
      rectalRemarks: '',
    }));
    setPeEdited(true);
  }, []);

  if (!visible || !patient) {
    return null;
  }

  const showTrackToggle =
    hasPhilHealthAccreditation ||
    initialTrack === 'YakapAvailment' ||
    workflowMode === 'YakapAvailment';

  const currentYearFpeCompleted = Boolean(
    coverage?.currentYearFpeStatus?.isCompleted &&
      coverage.currentYearFpeStatus.enlistmentId &&
      screeningStatus !== 'Completed'
  );

  const ncdRiskBadgeLabel = (() => {
    const match = cvdRiskLevelOptions.find(
      (opt) => opt.code === philpenResult.riskBand || opt.philHealthCode === philpenResult.riskBand
    );
    return match ? match.label : `${philpenResult.riskBand} (${philpenResult.calculatedScorePercent}%)`;
  })();

  const canGoNextFromStep1 = () => handleSaveStation1AndNext();

  const renderNcdBooleanRow = (
    questionKey: string,
    label: string,
    options?: {
      positiveIsHealthy?: boolean;
      onAfterChange?: (val: boolean) => Record<string, boolean | string | null> | undefined;
    }
  ) => {
    const current = ncdAnswers[questionKey];
    const yesStyle = options?.positiveIsHealthy ? styles.chipSuccess : styles.chipWarning;
    const yesTextColor = options?.positiveIsHealthy
      ? theme.colors.successText
      : theme.colors.warningText;
    const noStyle = options?.positiveIsHealthy ? styles.chipWarning : styles.chipSuccess;
    const noTextColor = options?.positiveIsHealthy
      ? theme.colors.warningText
      : theme.colors.successText;

    return (
      <View key={questionKey} style={styles.ncdQuestionRow} testID={`ncd-row-${questionKey}`}>
        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.flexOne}>
          {label}
        </ThemedText>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => {
              const extra = options?.onAfterChange ? options.onAfterChange(false) : undefined;
              setNcdAnswers((prev) => ({ ...prev, [questionKey]: false, ...(extra ?? {}) }));
              setNcdEdited(true);
            }}
            style={[styles.purposeChip, current === false && noStyle]}
            testID={`ncd-${questionKey}-no`}
          >
            <ThemedText
              variant={current === false ? 'smallBold' : 'small'}
              color={current === false ? noTextColor : theme.colors.textSecondary}
            >
              No
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              const extra = options?.onAfterChange ? options.onAfterChange(true) : undefined;
              setNcdAnswers((prev) => ({ ...prev, [questionKey]: true, ...(extra ?? {}) }));
              setNcdEdited(true);
            }}
            style={[styles.purposeChip, current === true && yesStyle]}
            testID={`ncd-${questionKey}-yes`}
          >
            <ThemedText
              variant={current === true ? 'smallBold' : 'small'}
              color={current === true ? yesTextColor : theme.colors.textSecondary}
            >
              Yes
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      onClose={handleExplicitClose}
      title="Health Screening & Preventive Assessment"
      subtitle={`${patient.fullName} · ${cohort.label} · ${
        activeQueueItemId ? `Visit Linked` : 'Direct Visit — creates on save'
      }`}
      maxWidth={960}
      maxHeight="95%"
      testID="health-screening-modal"
      headerExtra={
        <View style={styles.headerExtraRow}>
          <Badge
            label={activeQueueItemId ? 'Active Visit' : 'Direct Visit — creates on save'}
            variant={activeQueueItemId ? 'primary' : 'neutral'}
            size="sm"
            icon={activeQueueItemId ? 'ticket' : 'clock'}
          />
          {screeningStatus === 'AwaitingDoctor' ? (
            <Badge label="Awaiting Doctor PE" variant="warning" size="sm" icon="stethoscope" />
          ) : screeningStatus === 'Completed' ? (
            <Badge label="Completed" variant="success" size="sm" icon="checkCircle" />
          ) : null}
        </View>
      }
      footer={
        completedScreening ? (
          <View style={styles.footerBar}>
            <Button title="Done" variant="outline" onPress={handleExplicitClose} />
            {activeQueueItemId ? (
              <Button
                title="Issue Medical Certificate / Fit-to-Work"
                icon="file"
                variant="primary"
                onPress={() => {
                  if (onIssueMedCert) {
                    handleExplicitClose();
                    onIssueMedCert({ patient, queueItemId: activeQueueItemId });
                  } else {
                    setMedCertModalOpen(true);
                  }
                }}
                testID="screening-issue-medcert-btn"
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.footerBar}>
            <Button title="Cancel" variant="ghost" onPress={handleExplicitClose} disabled={saving} />

            <View style={styles.footerActionsRight}>
              {activeStep > 1 ? (
                <Button
                  title="Previous"
                  variant="outline"
                  icon="arrowLeft"
                  onPress={() => setActiveStep((prev) => Math.max(1, prev - 1) as StationStep)}
                  disabled={saving}
                />
              ) : null}

              {activeStep === 1 ? (
                <Button
                  title="Save Vitals & Continue"
                  rightIcon="arrowRight"
                  onPress={canGoNextFromStep1}
                  loading={saving}
                  disabled={loading || !!loadError || saving}
                  testID="screening-step1-next-btn"
                />
              ) : null}

              {activeStep === 2 ? (
                <>
                  <Button
                    title="Save & Send to Doctor"
                    icon="send"
                    variant="outline"
                    onPress={() => handleSaveStation2(true)}
                    loading={saving}
                    disabled={loading || !!loadError || saving}
                    testID="screening-send-to-doctor-btn"
                  />
                  <Button
                    title="Continue to PE & Labs"
                    rightIcon="arrowRight"
                    onPress={() => handleSaveStation2(false)}
                    loading={saving}
                    disabled={loading || !!loadError || saving}
                    testID="screening-step2-next-btn"
                  />
                </>
              ) : null}

              {activeStep === 3 ? (
                <Button
                  title="Save PE & Review Sign-Off"
                  rightIcon="arrowRight"
                  onPress={handleSaveStation3AndNext}
                  loading={saving}
                  disabled={loading || !!loadError || saving}
                  testID="screening-step3-next-btn"
                />
              ) : null}

              {activeStep === 4 ? (
                disposition === 'EscalatedToConsultation' &&
                (canCompleteSelectedTrack || canNurseScreen) ? (
                  <Button
                    title="Escalate to MD Consultation"
                    icon="emergency"
                    variant="danger"
                    onPress={handleCompleteSignOff}
                    loading={saving}
                    disabled={loading || !!loadError || saving}
                    testID={
                      canCompleteSelectedTrack ? 'screening-complete-btn' : 'screening-escalate-btn'
                    }
                  />
                ) : canCompleteSelectedTrack ? (
                  <Button
                    title="Complete & Sign Off"
                    icon="checkCircle"
                    variant="success"
                    onPress={handleCompleteSignOff}
                    loading={saving}
                    disabled={loading || !!loadError || saving}
                    testID="screening-complete-btn"
                  />
                ) : (
                  <Button
                    title="Save & Route to Physician"
                    icon="send"
                    variant="primary"
                    onPress={() => handleSaveStation2(true)}
                    loading={saving}
                    disabled={loading || !!loadError || saving}
                    testID="screening-route-physician-btn"
                  />
                )
              ) : null}
            </View>
          </View>
        )
      }
    >
      {loading ? (
        <SkeletonList rows={6} />
      ) : loadError ? (
        <ErrorState
          title="Could not load Health Screening"
          message={loadError}
          onRetry={() => loadModalData(patient, { ignoreDraft: true })}
        />
      ) : (
        <View style={styles.container}>
          {restoredDraftFromRefresh ? (
            <View style={styles.draftRestoredBanner} testID="screening-draft-restored-banner">
              <View style={styles.draftRestoredTextRow}>
                <Icon name="refresh" size={theme.sizes.iconSm} color={theme.colors.infoText} />
                <ThemedText variant="small" color={theme.colors.infoText} style={styles.flexOne}>
                  Unsaved screening progress restored after page refresh.
                </ThemedText>
              </View>
              <Button
                title="Reset to Saved"
                variant="ghost"
                size="xs"
                onPress={handleResetDraftToSaved}
                testID="screening-reset-draft-btn"
              />
            </View>
          ) : null}
          {/* Program Bar: Screening Track + Purpose + YAKAP Intake Strip */}
          <View style={styles.programBar}>
            {showTrackToggle ? (
              <View style={styles.trackRow}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Screening Track
                </ThemedText>
                <SegmentedControl
                  options={[
                    { value: 'Regular', label: 'Clinic Health Screening', icon: 'heartPulse' },
                    { value: 'YakapAvailment', label: 'PhilHealth YAKAP FPE', icon: 'yakap' },
                  ]}
                  value={workflowMode}
                  onChange={(val) => {
                    const nextMode = val as 'Regular' | 'YakapAvailment';
                    setWorkflowMode(nextMode);
                    if (nextMode === 'YakapAvailment') {
                      setScreeningType('YakapFpe');
                    } else if (screeningType === 'YakapFpe') {
                      setScreeningType('AnnualPhysicalExam');
                    }
                  }}
                />
              </View>
            ) : null}

            {workflowMode === 'Regular' ? (
              <View style={styles.purposeSection}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Screening Purpose
                </ThemedText>
                <View style={styles.chipRow}>
                  {REGULAR_PURPOSES.map((purpose) => {
                    const active = screeningType === purpose.value;
                    return (
                      <Pressable
                        key={purpose.value}
                        onPress={() => setScreeningType(purpose.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[styles.purposeChip, active && styles.purposeChipActive]}
                      >
                        <ThemedText
                          variant={active ? 'smallBold' : 'small'}
                          color={active ? theme.colors.primary : theme.colors.textSecondary}
                        >
                          {purpose.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.yakapIntakeStrip} testID="yakap-intake-strip">
                <View style={styles.yakapBadgesRow}>
                  <Badge
                    label={
                      validatePhilHealthPinMod11(
                        coverage?.membership?.philHealthPin || patient.philHealthNumber || ''
                      ).isValid
                        ? `PIN: ${patient.philHealthNumber || coverage?.membership?.philHealthPin}`
                        : 'Valid PhilHealth PIN Required'
                    }
                    variant={
                      validatePhilHealthPinMod11(
                        coverage?.membership?.philHealthPin || patient.philHealthNumber || ''
                      ).isValid
                        ? 'success'
                        : 'warning'
                    }
                    size="sm"
                    icon="shield"
                  />
                  <Badge
                    label={
                      coverage?.currentYearFpeStatus?.hasActiveEnlistment
                        ? `${coverage.currentYearFpeStatus.effectiveYear} Enlisted`
                        : 'Enlistment Required'
                    }
                    variant={
                      coverage?.currentYearFpeStatus?.hasActiveEnlistment ? 'success' : 'warning'
                    }
                    size="sm"
                    icon="calendar"
                  />
                </View>

                {currentYearFpeCompleted ? (
                  <View style={styles.warningCallout}>
                    <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                    <ThemedText variant="caption" color={theme.colors.warningText} style={styles.flexOne}>
                      FPE already completed for {coverage?.currentYearFpeStatus.effectiveYear} on{' '}
                      {coverage?.currentYearFpeStatus.profilingDate || 'record'} (Trans No:{' '}
                      {coverage?.currentYearFpeStatus.profilingTransNo || 'Assigned'}).
                    </ThemedText>
                  </View>
                ) : null}

                <View style={[styles.yakapControlsRow, isCompact && styles.stackCol]}>
                  <Input
                    containerStyle={styles.flexOne}
                    label="PhilHealth ATC (Authorization Transaction Code)"
                    value={philHealthAtc}
                    onChangeText={setPhilHealthAtc}
                    placeholder={isWalkedIn ? 'Optional when Walk-In' : 'Enter PhilHealth ATC'}
                  />
                  <View style={styles.walkInGroup}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Encounter Type
                    </ThemedText>
                    <View style={styles.chipRow}>
                      <Pressable
                        onPress={() => setIsWalkedIn(true)}
                        style={[styles.purposeChip, isWalkedIn && styles.purposeChipActive]}
                      >
                        <ThemedText
                          variant={isWalkedIn ? 'smallBold' : 'small'}
                          color={isWalkedIn ? theme.colors.primary : theme.colors.textSecondary}
                        >
                          Walk-In
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => setIsWalkedIn(false)}
                        style={[styles.purposeChip, !isWalkedIn && styles.purposeChipActive]}
                      >
                        <ThemedText
                          variant={!isWalkedIn ? 'smallBold' : 'small'}
                          color={!isWalkedIn ? theme.colors.primary : theme.colors.textSecondary}
                        >
                          With ATC
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* 4-Step Connected Station Workflow Stepper */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stepperRow}
            >
              {STATION_STEPS.map((st, idx) => {
                const isActive = activeStep === st.step;
                const isDone =
                  (st.step === 1 && (Boolean(patientVitalsId) || Boolean(screeningId))) ||
                  (st.step === 2 &&
                    (step2Saved ||
                      screeningStatus === 'AwaitingDoctor' ||
                      screeningStatus === 'Completed')) ||
                  (st.step === 3 &&
                    (Boolean(screeningPhysicalExamId) ||
                      peEdited ||
                      screeningStatus === 'Completed')) ||
                  (st.step === 4 && screeningStatus === 'Completed');

                const statusLabel = isDone
                  ? isActive
                    ? 'Completed · Active'
                    : 'Completed'
                  : isActive
                    ? `Current · ${st.roleHint}`
                    : st.roleHint;

                return (
                  <React.Fragment key={st.step}>
                    <Pressable
                      onPress={() => setActiveStep(st.step)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                      style={[
                        styles.stepNodeCard,
                        isDone && !isActive && styles.stepNodeCardDone,
                        isActive && styles.stepNodeCardActive,
                      ]}
                      testID={`screening-step-${st.step}`}
                    >
                      <View
                        style={[
                          styles.stepCircle,
                          isDone && styles.stepCircleDone,
                          isActive && styles.stepCircleActive,
                        ]}
                      >
                        {isDone && !isActive ? (
                          <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.onPrimary} />
                        ) : (
                          <ThemedText
                            variant="captionBold"
                            color={
                              isActive || isDone
                                ? theme.colors.onPrimary
                                : theme.colors.textMuted
                            }
                          >
                            {st.step}
                          </ThemedText>
                        )}
                      </View>
                      <View style={styles.stepTextCol}>
                        <ThemedText
                          variant={isActive ? 'smallBold' : 'small'}
                          color={
                            isActive
                              ? theme.colors.primary
                              : isDone
                                ? theme.colors.text
                                : theme.colors.textSecondary
                          }
                          numberOfLines={1}
                        >
                          {isCompact ? st.shortTitle : st.title}
                        </ThemedText>
                        <ThemedText
                          variant="caption"
                          color={
                            isActive
                              ? theme.colors.primary
                              : isDone
                                ? theme.colors.successText
                                : theme.colors.textMuted
                          }
                          numberOfLines={1}
                        >
                          {statusLabel}
                        </ThemedText>
                      </View>
                    </Pressable>
                    {idx < STATION_STEPS.length - 1 ? (
                      <View
                        style={[
                          styles.stepConnector,
                          isDone && styles.stepConnectorDone,
                        ]}
                      />
                    ) : null}
                  </React.Fragment>
                );
              })}
            </ScrollView>
          </View>

          {/* STATION 1: VITALS, ANTHROPOMETRICS & VISUAL ACUITY */}
          {activeStep === 1 ? (
            <View style={styles.stationBody} testID="screening-station-1">
              <CohortBanner cohort={cohort} />

              {redFlags.length > 0 ? (
                <View style={styles.redFlagBanner} testID="screening-red-flag-banner">
                  <View style={styles.redFlagTextCol}>
                    <View style={styles.redFlagTitleRow}>
                      <Icon name="emergency" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
                      <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
                        Clinical Red Flag Detected
                      </ThemedText>
                    </View>
                    <ThemedText variant="small" color={theme.colors.emergencyText}>
                      {redFlags.join(' · ')}
                    </ThemedText>
                  </View>
                  <Button
                    title="Escalate to MD Consultation"
                    variant="danger"
                    size="sm"
                    icon="emergency"
                    onPress={() => handleEscalateToConsultation()}
                    loading={saving}
                    testID="red-flag-escalate-btn"
                  />
                </View>
              ) : null}

              <StandardVitalsSection
                form={vitalsForm}
                updateField={updateVitalsField}
                cohort={cohort}
                errors={vitalsErrors}
              />

              <AnthropometricsSection
                form={vitalsForm}
                updateField={updateVitalsField}
                cohort={cohort}
                calculatedBmi={bmiEval?.bmi}
                bmiCategory={bmiEval?.category}
                centralObesity={centralObesityEval}
                zScorePreview={zScorePreview}
                errors={vitalsErrors}
              />

              <VisualAcuitySection
                form={vitalsForm}
                updateField={updateVitalsField}
                errors={vitalsErrors}
              />
            </View>
          ) : null}

          {/* STATION 2: LONGITUDINAL HISTORY & PHILPEN NCD RISK */}
          {activeStep === 2 ? (
            <View style={styles.stationBody} testID="screening-station-2">
              {/* Allergies */}
              <View style={styles.sectionCard}>
                <View style={styles.cardTitleRow}>
                  <View style={styles.titleWithBadge}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Documented Allergies
                    </ThemedText>
                    <Badge
                      label={allergyEdited ? 'Edited' : 'Reviewed — No Changes'}
                      variant={allergyEdited ? 'warning' : 'routine'}
                      size="sm"
                    />
                  </View>
                  <Button
                    title="Add / Manage Allergies"
                    variant="outline"
                    size="xs"
                    icon="plus"
                    onPress={() => setAllergyModalOpen(true)}
                  />
                </View>
                {patient.alerts?.trim() || chart?.demographics?.alerts?.trim() ? (
                  <View style={styles.warningCallout} testID="screening-clinical-alerts-banner">
                    <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                    <ThemedText variant="small" color={theme.colors.warningText} style={styles.flexOne}>
                      Clinical Alert: {patient.alerts?.trim() || chart?.demographics?.alerts?.trim()}
                    </ThemedText>
                  </View>
                ) : null}
                {allergies.length > 0 ? (
                  <AllergyPillList
                    allergies={allergies.map((a) => ({
                      category: a.category,
                      allergen: a.allergen,
                      allergenDrugCode: a.allergenDrugCode ?? null,
                      severity: a.severity,
                      reactionManifestation: a.reactionManifestation ?? null,
                      isAnaphylactic: a.isAnaphylactic,
                      onsetDate: a.onsetDate ?? null,
                      notes: a.notes ?? null,
                    }))}
                    onRemove={handleRemoveAllergy}
                  />
                ) : hasKnownAllergies(patient.allergies) ? (
                  <View style={styles.infoBanner} testID="screening-legacy-allergies-banner">
                    <ThemedText variant="small" color={theme.colors.infoText}>
                      Recorded on Patient Profile: {patient.allergies}. Use "Add / Manage Allergies" to formalize into structured allergy entries.
                    </ThemedText>
                  </View>
                ) : (
                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    No known allergies recorded on chart.
                  </ThemedText>
                )}
              </View>

              {/* Past Medical & Family History */}
              <View style={styles.sectionCard}>
                <View style={styles.cardTitleRow}>
                  <View style={styles.titleWithBadge}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Past Medical & Family History
                    </ThemedText>
                    <Badge
                      label={historyEdited ? 'Edited' : 'Reviewed — No Changes'}
                      variant={historyEdited ? 'warning' : 'routine'}
                      size="sm"
                    />
                    {prefilledHistoryCount > 0 && !historyEdited ? (
                      <Badge
                        label={`Pre-filled from Chart (${prefilledHistoryCount})`}
                        variant="primary"
                        size="sm"
                        icon="clipboard"
                      />
                    ) : null}
                  </View>
                </View>

                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Personal Medical History
                </ThemedText>
                <View style={styles.chipRow}>
                  {diseaseList.map((item) => {
                    const isLocked = lockedPersonalCodes.has(item.code);
                    const selected =
                      isLocked ||
                      pastMedicalItems.some((m) => m.philHealthMdiseaseCode === item.code);
                    return (
                      <Pressable
                        key={`pmh-${item.code}`}
                        onPress={() => togglePersonalDisease(item.code, item.description)}
                        style={[
                          styles.purposeChip,
                          selected && styles.chipSuccess,
                          isLocked && styles.chipLocked,
                        ]}
                        testID={`pmh-chip-${item.code}`}
                      >
                        <Icon
                          name={isLocked ? 'lock' : selected ? 'check' : 'plus'}
                          size={theme.sizes.iconSm}
                          color={selected ? theme.colors.successText : theme.colors.textSecondary}
                        />
                        <ThemedText
                          variant={selected ? 'smallBold' : 'small'}
                          color={selected ? theme.colors.successText : theme.colors.textSecondary}
                        >
                          {item.description}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                {lockedPersonalCodes.has('998') ||
                pastMedicalItems.some((m) => m.philHealthMdiseaseCode === '998') ? (
                  <Input
                    label="Specify Other Personal Condition"
                    value={
                      pastMedicalItems.find((m) => m.philHealthMdiseaseCode === '998')
                        ?.specificDescription ?? ''
                    }
                    onChangeText={(txt) => {
                      setHistoryEdited(true);
                      setPastMedicalItems((prev) => {
                        const has998 = prev.some((m) => m.philHealthMdiseaseCode === '998');
                        if (has998) {
                          return prev.map((m) =>
                            m.philHealthMdiseaseCode === '998'
                              ? { ...m, specificDescription: txt }
                              : m
                          );
                        }
                        return [
                          ...prev,
                          {
                            id: 'draft-998',
                            patientId: patient.id,
                            conditionTitle: 'Others',
                            philHealthMdiseaseCode: '998',
                            specificDescription: txt,
                            isResolved: false,
                            createdAt: new Date().toISOString(),
                          },
                        ];
                      });
                    }}
                    placeholder="Enter specific condition"
                    testID="pmh-other-desc-input"
                  />
                ) : null}

                <Input
                  label="Personal Medical History Notes"
                  value={medicalHistoryNotes}
                  onChangeText={(txt) => {
                    setMedicalHistoryNotes(txt);
                    setHistoryEdited(true);
                  }}
                  placeholder="Optional clinical details"
                />

                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Family Medical History
                </ThemedText>
                <View style={styles.chipRow}>
                  {diseaseList.map((item) => {
                    const selected = familyMedicalItems.some(
                      (f) => f.philHealthMdiseaseCode === item.code
                    );
                    return (
                      <Pressable
                        key={`fam-${item.code}`}
                        onPress={() => toggleFamilyDisease(item.code, item.description)}
                        style={[styles.purposeChip, selected && styles.chipSuccess]}
                        testID={`fam-chip-${item.code}`}
                      >
                        <Icon
                          name={selected ? 'check' : 'plus'}
                          size={theme.sizes.iconSm}
                          color={selected ? theme.colors.successText : theme.colors.textSecondary}
                        />
                        <ThemedText
                          variant={selected ? 'smallBold' : 'small'}
                          color={selected ? theme.colors.successText : theme.colors.textSecondary}
                        >
                          {item.description}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                {familyMedicalItems.some((f) => f.philHealthMdiseaseCode === '998') ? (
                  <Input
                    label="Specify Other Family Condition"
                    value={
                      familyMedicalItems.find((f) => f.philHealthMdiseaseCode === '998')
                        ?.specificDescription ?? ''
                    }
                    onChangeText={(txt) => {
                      setHistoryEdited(true);
                      setFamilyMedicalItems((prev) =>
                        prev.map((f) =>
                          f.philHealthMdiseaseCode === '998'
                            ? { ...f, specificDescription: txt }
                            : f
                        )
                      );
                    }}
                    placeholder="Enter specific family condition"
                    testID="fam-other-desc-input"
                  />
                ) : null}

                <Input
                  label="Family History Notes"
                  value={familyHistoryNotes}
                  onChangeText={(txt) => {
                    setFamilyHistoryNotes(txt);
                    setHistoryEdited(true);
                  }}
                  placeholder="Optional family relationship details"
                />
              </View>

              {/* Lifestyle & Social History (Suppressed < 18) */}
              <View style={styles.sectionCard}>
                <View style={styles.cardTitleRow}>
                  <View style={styles.titleWithBadge}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Lifestyle & Social History
                    </ThemedText>
                    <Badge
                      label={socialEdited ? 'Edited' : 'Reviewed — No Changes'}
                      variant={socialEdited ? 'warning' : 'routine'}
                      size="sm"
                    />
                  </View>
                </View>

                {cohort.isPediatric ? (
                  <View style={styles.infoBanner}>
                    <ThemedText variant="small" color={theme.colors.infoText}>
                      Pediatric patient ({cohort.ageYears} yrs): adult behavioral risk factors (smoking, alcohol, substance use) are auto-suppressed.
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.formStack}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Tobacco & Smoking Status
                    </ThemedText>
                    <View style={styles.chipRow}>
                      {(['never', 'current', 'quit'] as const).map((status) => {
                        const active = (socialHistory.smokingStatus || 'never') === status;
                        return (
                          <Pressable
                            key={status}
                            onPress={() => {
                              setSocialHistory((prev) => ({
                                ...prev,
                                smokingStatus: status,
                                isSmoker: status === 'current',
                              }));
                              setSocialEdited(true);
                            }}
                            style={[styles.purposeChip, active && styles.purposeChipActive]}
                          >
                            <ThemedText
                              variant={active ? 'smallBold' : 'small'}
                              color={active ? theme.colors.primary : theme.colors.textSecondary}
                            >
                              {status === 'never'
                                ? 'Non-Smoker'
                                : status === 'current'
                                  ? 'Current Smoker'
                                  : 'Former Smoker (Quit)'}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>

                    {socialHistory.smokingStatus === 'current' ? (
                      <View style={[styles.formRow, isCompact && styles.stackCol]}>
                        <Input
                          containerStyle={styles.flexOne}
                          label="Packs per Day"
                          value={socialHistory.packsPerDay != null ? String(socialHistory.packsPerDay) : ''}
                          onChangeText={(txt) => {
                            setSocialHistory((prev) => ({
                              ...prev,
                              packsPerDay: parseFloat(txt) || undefined,
                            }));
                            setSocialEdited(true);
                          }}
                          keyboardType="numeric"
                        />
                        <Input
                          containerStyle={styles.flexOne}
                          label="Years Smoking"
                          value={socialHistory.yearsSmoking != null ? String(socialHistory.yearsSmoking) : ''}
                          onChangeText={(txt) => {
                            setSocialHistory((prev) => ({
                              ...prev,
                              yearsSmoking: parseFloat(txt) || undefined,
                            }));
                            setSocialEdited(true);
                          }}
                          keyboardType="numeric"
                        />
                      </View>
                    ) : null}

                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Alcohol Consumption
                    </ThemedText>
                    <View style={styles.chipRow}>
                      {(['never', 'current', 'quit'] as const).map((status) => {
                        const active = (socialHistory.alcoholStatus || 'never') === status;
                        return (
                          <Pressable
                            key={status}
                            onPress={() => {
                              setSocialHistory((prev) => ({
                                ...prev,
                                alcoholStatus: status,
                                isAlcoholDrinker: status === 'current',
                              }));
                              setSocialEdited(true);
                            }}
                            style={[styles.purposeChip, active && styles.purposeChipActive]}
                          >
                            <ThemedText
                              variant={active ? 'smallBold' : 'small'}
                              color={active ? theme.colors.primary : theme.colors.textSecondary}
                            >
                              {status === 'never'
                                ? 'Non-Drinker'
                                : status === 'current'
                                  ? 'Current Drinker'
                                  : 'Former Drinker'}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>

                    {socialHistory.alcoholStatus === 'current' && alcoholOptions.length > 0 ? (
                      <View style={styles.chipRow}>
                        {alcoholOptions.map((opt) => {
                          const active = socialHistory.alcoholFrequency === opt.label;
                          return (
                            <Pressable
                              key={opt.code}
                              onPress={() => {
                                setSocialHistory((prev) => ({
                                  ...prev,
                                  alcoholFrequency: opt.label,
                                }));
                                setSocialEdited(true);
                              }}
                              style={[styles.purposeChip, active && styles.purposeChipActive]}
                            >
                              <ThemedText
                                variant={active ? 'smallBold' : 'small'}
                                color={active ? theme.colors.primary : theme.colors.textSecondary}
                              >
                                {opt.label}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}

                    {activityOptions.length > 0 ? (
                      <>
                        <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                          Physical Activity
                        </ThemedText>
                        <View style={styles.chipRow}>
                          {activityOptions.map((opt) => {
                            const active = socialHistory.physicalActivityFrequency === opt.label;
                            return (
                              <Pressable
                                key={opt.code}
                                onPress={() => {
                                  setSocialHistory((prev) => ({
                                    ...prev,
                                    physicalActivityFrequency: opt.label,
                                  }));
                                  setSocialEdited(true);
                                }}
                                style={[styles.purposeChip, active && styles.purposeChipActive]}
                              >
                                <ThemedText
                                  variant={active ? 'smallBold' : 'small'}
                                  color={active ? theme.colors.primary : theme.colors.textSecondary}
                                >
                                  {opt.label}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </View>
                      </>
                    ) : null}

                    {dietaryOptions.length > 0 ? (
                      <>
                        <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                          Dietary Habits
                        </ThemedText>
                        <View style={styles.chipRow}>
                          {dietaryOptions.map((opt) => {
                            const current = (socialHistory.dietaryHabits || '')
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const active = current.some(
                              (c) => c.toLowerCase() === opt.label.toLowerCase()
                            );
                            return (
                              <Pressable
                                key={opt.code}
                                onPress={() => {
                                  const next = active
                                    ? current.filter(
                                        (c) => c.toLowerCase() !== opt.label.toLowerCase()
                                      )
                                    : [...current, opt.label];
                                  setSocialHistory((prev) => ({
                                    ...prev,
                                    dietaryHabits: next.join(', '),
                                  }));
                                  setSocialEdited(true);
                                }}
                                style={[styles.purposeChip, active && styles.chipSuccess]}
                              >
                                <ThemedText
                                  variant={active ? 'smallBold' : 'small'}
                                  color={
                                    active ? theme.colors.successText : theme.colors.textSecondary
                                  }
                                >
                                  {opt.label}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </View>
                      </>
                    ) : null}
                  </View>
                )}
              </View>

              {/* Women's / Reproductive Health (Female >= 9 yrs only) */}
              {cohort.isFemale && cohort.ageYears >= 9 ? (
                <View style={styles.sectionCard} testID="screening-reproductive-section">
                  <View style={styles.cardTitleRow}>
                    <View style={styles.titleWithBadge}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        Women&apos;s & Reproductive Health
                      </ThemedText>
                      <Badge
                        label={reproEdited ? 'Edited' : 'Reviewed — No Changes'}
                        variant={reproEdited ? 'warning' : 'routine'}
                        size="sm"
                      />
                    </View>
                    <View style={styles.chipRow}>
                      <Pressable
                        onPress={() => {
                          setReproHistory((prev) => ({ ...prev, isApplicable: false }));
                          setReproEdited(true);
                        }}
                        style={[
                          styles.purposeChip,
                          !reproHistory.isApplicable && styles.purposeChipActive,
                        ]}
                      >
                        <ThemedText
                          variant={!reproHistory.isApplicable ? 'smallBold' : 'small'}
                          color={
                            !reproHistory.isApplicable
                              ? theme.colors.primary
                              : theme.colors.textSecondary
                          }
                        >
                          Not Applicable
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setReproHistory((prev) => ({ ...prev, isApplicable: true }));
                          setReproEdited(true);
                        }}
                        style={[
                          styles.purposeChip,
                          Boolean(reproHistory.isApplicable) && styles.purposeChipActive,
                        ]}
                      >
                        <ThemedText
                          variant={reproHistory.isApplicable ? 'smallBold' : 'small'}
                          color={
                            reproHistory.isApplicable
                              ? theme.colors.primary
                              : theme.colors.textSecondary
                          }
                        >
                          Applicable
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>

                  {reproHistory.isApplicable ? (
                    <View style={styles.formStack}>
                      <View style={[styles.formRow, isCompact && styles.stackCol]}>
                        <Input
                          containerStyle={styles.flexOne}
                          label="Menarche Age (yrs)"
                          value={
                            reproHistory.menarcheAge != null ? String(reproHistory.menarcheAge) : ''
                          }
                          onChangeText={(txt) => {
                            setReproHistory((prev) => ({
                              ...prev,
                              menarcheAge: parseInt(txt, 10) || undefined,
                            }));
                            setReproEdited(true);
                          }}
                          keyboardType="numeric"
                        />
                        <View style={styles.flexOne}>
                          <ValidatedDateInput
                            label="Last Menstrual Period (LMP)"
                            value={reproHistory.lastMenstrualPeriod || ''}
                            onChangeText={(txt) => {
                              setReproHistory((prev) => ({
                                ...prev,
                                lastMenstrualPeriod: txt,
                              }));
                              setReproEdited(true);
                            }}
                            boundaryMode="pastOrToday"
                            placeholder="YYYY-MM-DD"
                          />
                        </View>
                      </View>
                      <View style={[styles.formRow, isCompact && styles.stackCol]}>
                        <Input
                          containerStyle={styles.flexOne}
                          label="Gravida"
                          value={String(reproHistory.gravidity ?? 0)}
                          onChangeText={(txt) => {
                            setReproHistory((prev) => ({
                              ...prev,
                              gravidity: parseInt(txt, 10) || 0,
                            }));
                            setReproEdited(true);
                          }}
                          keyboardType="numeric"
                        />
                        <Input
                          containerStyle={styles.flexOne}
                          label="Para"
                          value={String(reproHistory.parity ?? 0)}
                          onChangeText={(txt) => {
                            setReproHistory((prev) => ({
                              ...prev,
                              parity: parseInt(txt, 10) || 0,
                            }));
                            setReproEdited(true);
                          }}
                          keyboardType="numeric"
                        />
                      </View>
                      {deliveryOptions.length > 0 ? (
                        <View style={styles.chipRow}>
                          {deliveryOptions.map((opt) => {
                            const active = reproHistory.deliveryType === opt.label;
                            return (
                              <Pressable
                                key={opt.code}
                                onPress={() => {
                                  setReproHistory((prev) => ({
                                    ...prev,
                                    deliveryType: opt.label,
                                  }));
                                  setReproEdited(true);
                                }}
                                style={[styles.purposeChip, active && styles.purposeChipActive]}
                              >
                                <ThemedText
                                  variant={active ? 'smallBold' : 'small'}
                                  color={active ? theme.colors.primary : theme.colors.textSecondary}
                                >
                                  {opt.label}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                      {contraceptiveOptions.length > 0 ? (
                        <View style={styles.chipRow}>
                          {contraceptiveOptions.map((opt) => {
                            const active = reproHistory.contraceptiveMethod === opt.label;
                            return (
                              <Pressable
                                key={opt.code}
                                onPress={() => {
                                  setReproHistory((prev) => ({
                                    ...prev,
                                    contraceptiveMethod: opt.label,
                                  }));
                                  setReproEdited(true);
                                }}
                                style={[styles.purposeChip, active && styles.purposeChipActive]}
                              >
                                <ThemedText
                                  variant={active ? 'smallBold' : 'small'}
                                  color={active ? theme.colors.primary : theme.colors.textSecondary}
                                >
                                  {opt.label}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Immunizations */}
              <View style={styles.sectionCard}>
                <View style={styles.cardTitleRow}>
                  <View style={styles.titleWithBadge}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Immunizations ({immunizations.length} recorded)
                    </ThemedText>
                    <Badge
                      label={immunizationsEdited ? 'Edited' : 'Reviewed — No Changes'}
                      variant={immunizationsEdited ? 'warning' : 'routine'}
                      size="sm"
                    />
                  </View>
                  <View style={styles.chipRow}>
                    <Button
                      title="Administer"
                      variant="outline"
                      size="xs"
                      icon="syringe"
                      onPress={() => setAdminVaccineOpen(true)}
                    />
                    <Button
                      title="Historical"
                      variant="ghost"
                      size="xs"
                      icon="plus"
                      onPress={() => setHistVaccineOpen(true)}
                    />
                  </View>
                </View>

                {immunizations.length > 0 ? (
                  <View style={styles.chipRow}>
                    {immunizations.slice(0, 8).map((imm) => (
                      <Badge
                        key={imm.id}
                        label={`${imm.vaccineName} (Dose ${imm.doseSequence})`}
                        variant="success"
                        size="sm"
                        icon="checkCircle"
                      />
                    ))}
                  </View>
                ) : (
                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    No vaccines logged on chart yet.
                  </ThemedText>
                )}

                {(cohort.isPediatric || showAllVaccines) && childVaccines.length > 0 ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Recommended Pediatric EPI catalog items available: {childVaccines.filter((v) => v.description.toLowerCase() !== 'none').length}
                  </ThemedText>
                ) : null}
                {((cohort.isFemale && cohort.ageYears >= 9 && cohort.ageYears <= 49) || showAllVaccines) &&
                (youngWomanVaccines.length > 0 || pregWomanVaccines.length > 0) ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Women&apos;s / Maternal vaccines catalog loaded ({youngWomanVaccines.length + pregWomanVaccines.length} items)
                  </ThemedText>
                ) : null}
                {(cohort.isSenior || showAllVaccines) && elderlyVaccines.length > 0 ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Senior citizen vaccines catalog loaded ({elderlyVaccines.length} items)
                  </ThemedText>
                ) : null}
                <Button
                  title={showAllVaccines ? 'Hide Cohort Catalog Summary' : 'Show All Vaccine Cohorts'}
                  variant="ghost"
                  size="xs"
                  onPress={() => setShowAllVaccines((prev) => !prev)}
                />
              </View>

              {/* PhilPEN Cardiometabolic & NCD Risk (Adults >= 20) */}
              {cohort.ageYears >= 20 ? (
                <View style={styles.sectionCard} testID="screening-philpen-section">
                  <View style={styles.cardTitleRow}>
                    <View style={styles.titleWithBadge}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        PhilPEN NCD & Cardiometabolic Risk (Adults 20+)
                      </ThemedText>
                      <Badge
                        label={ncdRiskBadgeLabel}
                        variant={
                          philpenResult.riskBand === 'BandD' || philpenResult.riskBand === 'BandE'
                            ? 'emergency'
                            : philpenResult.riskBand === 'BandC'
                              ? 'warning'
                              : 'success'
                        }
                        size="sm"
                      />
                    </View>
                  </View>

                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {philpenResult.managementRecommendation}
                  </ThemedText>

                  <View style={[styles.formRow, isCompact && styles.stackCol]}>
                    <Input
                      containerStyle={styles.flexOne}
                      label="Fasting Blood Sugar (mg/dL)"
                      value={ncdFbsMgDl}
                      onChangeText={(txt) => {
                        setNcdFbsMgDl(txt);
                        setNcdEdited(true);
                      }}
                      placeholder="e.g. 95"
                      keyboardType="numeric"
                    />
                    <Input
                      containerStyle={styles.flexOne}
                      label="Total Cholesterol (mg/dL)"
                      value={ncdTotalCholMgDl}
                      onChangeText={(txt) => {
                        setNcdTotalCholMgDl(txt);
                        setNcdEdited(true);
                      }}
                      placeholder="e.g. 180"
                      keyboardType="numeric"
                    />
                  </View>

                  {/* Full PhilPEN Q1-Q24 Questionnaire with Conditional Skip-Logic */}
                  <View style={styles.formStack}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Nutrition & Physical Activity
                    </ThemedText>
                    {renderNcdBooleanRow(
                      'eatsProcessedFoodWeekly',
                      'Consumes processed foods, canned meals, or instant noodles weekly?'
                    )}
                    {renderNcdBooleanRow(
                      'threeServingsVegetablesDaily',
                      'Consumes at least 3 servings of vegetables daily?',
                      { positiveIsHealthy: true }
                    )}
                    {renderNcdBooleanRow(
                      'twoToThreeServingsFruitDaily',
                      'Consumes 2 to 3 servings of fresh fruit daily?',
                      { positiveIsHealthy: true }
                    )}
                    {renderNcdBooleanRow(
                      'physicalActivityAtLeast150MinsWeekly',
                      'Engages in at least 150 mins/week of moderate-intensity physical activity?',
                      { positiveIsHealthy: true }
                    )}
                  </View>

                  <View style={styles.formStack}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Diabetes, Metabolic & Urinalysis Assessment
                    </ThemedText>
                    {renderNcdBooleanRow(
                      'diagnosedDiabetes',
                      'Previously diagnosed with Diabetes Mellitus?',
                      {
                        onAfterChange: (val) =>
                          val ? undefined : { diabetesMedicationStatus: null },
                      }
                    )}
                    {ncdAnswers.diagnosedDiabetes === true ? (
                      <View
                        style={styles.ncdNestedContainer}
                        testID="ncd-diabetes-medication-followup"
                      >
                        <View style={styles.ncdQuestionRow}>
                          <ThemedText
                            variant="small"
                            color={theme.colors.textSecondary}
                            style={styles.flexOne}
                          >
                            Currently taking prescribed diabetes medication (oral agents or insulin)?
                          </ThemedText>
                          <View style={styles.chipRow}>
                            <Pressable
                              onPress={() => {
                                setNcdAnswers((prev) => ({
                                  ...prev,
                                  diabetesMedicationStatus: 'N',
                                }));
                                setNcdEdited(true);
                              }}
                              style={[
                                styles.purposeChip,
                                ncdAnswers.diabetesMedicationStatus === 'N' && styles.chipWarning,
                              ]}
                              testID="ncd-diabetesMedicationStatus-no"
                            >
                              <ThemedText
                                variant={
                                  ncdAnswers.diabetesMedicationStatus === 'N'
                                    ? 'smallBold'
                                    : 'small'
                                }
                                color={
                                  ncdAnswers.diabetesMedicationStatus === 'N'
                                    ? theme.colors.warningText
                                    : theme.colors.textSecondary
                                }
                              >
                                No
                              </ThemedText>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                setNcdAnswers((prev) => ({
                                  ...prev,
                                  diabetesMedicationStatus: 'Y',
                                }));
                                setNcdEdited(true);
                              }}
                              style={[
                                styles.purposeChip,
                                ncdAnswers.diabetesMedicationStatus === 'Y' && styles.chipSuccess,
                              ]}
                              testID="ncd-diabetesMedicationStatus-yes"
                            >
                              <ThemedText
                                variant={
                                  ncdAnswers.diabetesMedicationStatus === 'Y'
                                    ? 'smallBold'
                                    : 'small'
                                }
                                color={
                                  ncdAnswers.diabetesMedicationStatus === 'Y'
                                    ? theme.colors.successText
                                    : theme.colors.textSecondary
                                }
                              >
                                Yes
                              </ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    ) : null}

                    {renderNcdBooleanRow(
                      'hasPolyphagia',
                      'Experiences excessive hunger (Polyphagia)?'
                    )}
                    {renderNcdBooleanRow(
                      'hasPolydipsia',
                      'Experiences excessive thirst (Polydipsia)?'
                    )}
                    {renderNcdBooleanRow(
                      'hasPolyuria',
                      'Experiences frequent urination (Polyuria)?'
                    )}

                    {renderNcdBooleanRow(
                      'hasRaisedBloodGlucose',
                      'Elevated blood glucose (Hyperglycemia) observed or reported?',
                      {
                        onAfterChange: (val) => {
                          if (!val) {
                            setNcdFbsMgDl('');
                            setNcdFbsDate('');
                          }
                          return undefined;
                        },
                      }
                    )}
                    {ncdAnswers.hasRaisedBloodGlucose === true ? (
                      <View style={styles.ncdNestedContainer}>
                        <ValidatedDateInput
                          label="FBS Test Date"
                          value={ncdFbsDate}
                          onChangeText={(txt) => {
                            setNcdFbsDate(txt);
                            setNcdEdited(true);
                          }}
                          boundaryMode="pastOrToday"
                          placeholder="YYYY-MM-DD"
                        />
                      </View>
                    ) : null}

                    {renderNcdBooleanRow(
                      'hasRaisedBloodLipids',
                      'Elevated blood lipids (Dyslipidemia) observed or reported?',
                      {
                        onAfterChange: (val) => {
                          if (!val) {
                            setNcdTotalCholMgDl('');
                            setNcdTotalCholDate('');
                          }
                          return undefined;
                        },
                      }
                    )}
                    {ncdAnswers.hasRaisedBloodLipids === true ? (
                      <View style={styles.ncdNestedContainer}>
                        <ValidatedDateInput
                          label="Cholesterol Test Date"
                          value={ncdTotalCholDate}
                          onChangeText={(txt) => {
                            setNcdTotalCholDate(txt);
                            setNcdEdited(true);
                          }}
                          boundaryMode="pastOrToday"
                          placeholder="YYYY-MM-DD"
                        />
                      </View>
                    ) : null}

                    {renderNcdBooleanRow(
                      'urineKetonesPresent',
                      'Elevated urine ketones detected on dipstick?',
                      {
                        onAfterChange: (val) => {
                          if (!val) {
                            setNcdUrineKetonesValue('');
                            setNcdUrineKetonesDate('');
                          }
                          return undefined;
                        },
                      }
                    )}
                    {ncdAnswers.urineKetonesPresent === true ? (
                      <View style={styles.ncdNestedContainer}>
                        <View style={[styles.formRow, isCompact && styles.stackCol]}>
                          <Input
                            containerStyle={styles.flexOne}
                            label="Urine Ketones Result"
                            value={ncdUrineKetonesValue}
                            onChangeText={(txt) => {
                              setNcdUrineKetonesValue(txt);
                              setNcdEdited(true);
                            }}
                            placeholder="e.g. Negative, Trace, 1+, 2+"
                          />
                          <View style={styles.flexOne}>
                            <ValidatedDateInput
                              label="Ketones Test Date"
                              value={ncdUrineKetonesDate}
                              onChangeText={(txt) => {
                                setNcdUrineKetonesDate(txt);
                                setNcdEdited(true);
                              }}
                              boundaryMode="pastOrToday"
                              placeholder="YYYY-MM-DD"
                            />
                          </View>
                        </View>
                      </View>
                    ) : null}

                    {renderNcdBooleanRow(
                      'urineProteinPresent',
                      'Proteinuria detected on dipstick?',
                      {
                        onAfterChange: (val) => {
                          if (!val) {
                            setNcdUrineProteinValue('');
                            setNcdUrineProteinDate('');
                          }
                          return undefined;
                        },
                      }
                    )}
                    {ncdAnswers.urineProteinPresent === true ? (
                      <View style={styles.ncdNestedContainer}>
                        <View style={[styles.formRow, isCompact && styles.stackCol]}>
                          <Input
                            containerStyle={styles.flexOne}
                            label="Urine Protein Result"
                            value={ncdUrineProteinValue}
                            onChangeText={(txt) => {
                              setNcdUrineProteinValue(txt);
                              setNcdEdited(true);
                            }}
                            placeholder="e.g. Negative, Trace, 1+, 2+"
                          />
                          <View style={styles.flexOne}>
                            <ValidatedDateInput
                              label="Protein Test Date"
                              value={ncdUrineProteinDate}
                              onChangeText={(txt) => {
                                setNcdUrineProteinDate(txt);
                                setNcdEdited(true);
                              }}
                              boundaryMode="pastOrToday"
                              placeholder="YYYY-MM-DD"
                            />
                          </View>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.formStack}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Cardiovascular & Cerebrovascular Symptoms (Rose Angina)
                    </ThemedText>
                    {renderNcdBooleanRow(
                      'hasChestPain',
                      'Experiences pain or heaviness in the chest?',
                      {
                        onAfterChange: (val) =>
                          val
                            ? undefined
                            : {
                                painInCenterOfChestOrLeftArm: null,
                                painWhenWalkingUphill: null,
                                slowsDownWhenPainOccurs: null,
                                painRelievedWithin10Mins: null,
                                painRelievedByNitrates: null,
                              },
                      }
                    )}

                    {ncdAnswers.hasChestPain === true ? (
                      <View
                        style={styles.ncdNestedContainer}
                        testID="ncd-rose-angina-skip-section"
                      >
                        {renderNcdBooleanRow(
                          'painInCenterOfChestOrLeftArm',
                          'Pain located in the center of the chest or radiating to left arm?'
                        )}
                        {renderNcdBooleanRow(
                          'painWhenWalkingUphill',
                          'Pain provoked or worsened by walking uphill or hurrying?',
                          {
                            onAfterChange: (val) =>
                              val
                                ? undefined
                                : {
                                    slowsDownWhenPainOccurs: null,
                                    painRelievedWithin10Mins: null,
                                    painRelievedByNitrates: null,
                                  },
                          }
                        )}

                        {ncdAnswers.painWhenWalkingUphill === true ? (
                          <View
                            style={styles.ncdSubNestedContainer}
                            testID="ncd-rose-angina-exertional-section"
                          >
                            {renderNcdBooleanRow(
                              'slowsDownWhenPainOccurs',
                              'Pain forces patient to stop or slow down?'
                            )}
                            {renderNcdBooleanRow(
                              'painRelievedWithin10Mins',
                              'Pain resolves completely within 10 minutes?',
                              { positiveIsHealthy: true }
                            )}
                            {renderNcdBooleanRow(
                              'painRelievedByNitrates',
                              'Pain is relieved by rest or sublingual nitroglycerin?',
                              { positiveIsHealthy: true }
                            )}
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {renderNcdBooleanRow(
                      'severeChestPainOver30Mins',
                      'Severe, persistent chest pain lasting > 30 minutes?'
                    )}
                    {renderNcdBooleanRow(
                      'transientNeurologicalDeficits',
                      'Transient numbness, weakness, or acute focal neurological deficits (TIA)?'
                    )}
                    {renderNcdBooleanRow(
                      'hasHistoryAnginaHeartAttack',
                      'Documented history of angina or myocardial infarction (heart attack)?'
                    )}
                    {renderNcdBooleanRow(
                      'hasHistoryStrokeOrTia',
                      'Documented history of stroke or transient ischemic attack (TIA)?'
                    )}
                  </View>

                  {ncdQuestionsCatalog.length > 0 ? (
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      PhilPEN catalog synchronized ({ncdQuestionsCatalog.length} items).
                    </ThemedText>
                  ) : null}
                </View>
              ) : null}

              <Input
                label="Nurse Screening & Handoff Notes"
                value={nurseScreeningNotes}
                onChangeText={setNurseScreeningNotes}
                placeholder="Key triage observations or nursing remarks for the physician..."
                multiline
              />
            </View>
          ) : null}

          {/* STATION 3: PHYSICAL EXAM & BASELINE SCREENING LABS */}
          {activeStep === 3 ? (
            <View style={styles.stationBody} testID="screening-station-3">
              {/* Compact Nurse Handoff Summary Card */}
              <View style={styles.handoffSummaryCard} testID="nurse-handoff-summary-card">
                <View style={styles.cardTitleRow}>
                  <View style={styles.titleWithBadge}>
                    <Icon name="clipboard" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Nurse Handoff Summary
                    </ThemedText>
                  </View>
                  {cohort.ageYears >= 20 ? (
                    <Badge label={`PhilPEN: ${ncdRiskBadgeLabel}`} variant="info" size="sm" />
                  ) : null}
                </View>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Vitals: {formatVitalsSummary({
                    systolicBp: parseOptionalInt(vitalsForm.bpSys),
                    diastolicBp: parseOptionalInt(vitalsForm.bpDia),
                    heartRateBpm: parseOptionalInt(vitalsForm.hr),
                    temperatureCelsius: parseOptionalFloat(vitalsForm.temp),
                    respiratoryRateBreathsPerMin: parseOptionalInt(vitalsForm.rr),
                    oxygenSaturationPercent: parseOptionalInt(vitalsForm.spo2),
                    bmi: bmiEval?.bmi,
                    philHealthZScoreCategory: zScorePreview?.philHealthZScoreCategory,
                  }) || 'Not yet recorded'}
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Vision: OD {vitalsForm.visualAcuityRight || 'N/A'} · OS {vitalsForm.visualAcuityLeft || 'N/A'} · Allergies:{' '}
                  {allergies.length > 0 ? allergies.map((a) => a.allergen).join(', ') : 'None'}
                </ThemedText>
                {nurseScreeningNotes.trim() ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Nurse Notes: {nurseScreeningNotes.trim()}
                  </ThemedText>
                ) : null}
              </View>

              {/* General Survey + 8 Organ Systems Physical Exam */}
              <View style={styles.sectionCard}>
                <View style={styles.cardTitleRow}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    General Survey & 9-System Physical Exam
                  </ThemedText>
                  <Button
                    title="All Essentially Normal"
                    variant="outline"
                    size="sm"
                    icon="check"
                    onPress={handleSetAllPeNormal}
                    testID="all-essentially-normal-btn"
                  />
                </View>

                <View style={styles.formStack}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    General Survey
                  </ThemedText>
                  <View style={styles.chipRow}>
                    {generalSurveyOptions.map((opt) => {
                      const code = opt.philHealthCode || opt.code;
                      const active = peValues.genSurveyId === code;
                      return (
                        <Pressable
                          key={opt.code}
                          onPress={() => {
                            setPeValues((prev) => ({ ...prev, genSurveyId: code }));
                            setPeEdited(true);
                          }}
                          style={[styles.purposeChip, active && styles.chipSuccess]}
                        >
                          <ThemedText
                            variant={active ? 'smallBold' : 'small'}
                            color={active ? theme.colors.successText : theme.colors.textSecondary}
                          >
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {peValues.genSurveyId && peValues.genSurveyId !== '1' ? (
                    <Input
                      label="General Survey Remarks"
                      value={peValues.genSurveyRemarks || ''}
                      onChangeText={(txt) => {
                        setPeValues((prev) => ({ ...prev, genSurveyRemarks: txt }));
                        setPeEdited(true);
                      }}
                      placeholder="Describe general survey findings"
                    />
                  ) : null}
                </View>

                <OrganSystemsExamSection
                  values={peValues}
                  onChange={(key: OrganSystemDef['key'], code: string) => {
                    setPeValues((prev) => ({ ...prev, [key]: code }));
                    setPeEdited(true);
                  }}
                  onRemarksChange={(remarksKey, remarks) => {
                    setPeValues((prev) => ({ ...prev, [remarksKey]: remarks }));
                    setPeEdited(true);
                  }}
                  onSetAllNormal={handleSetAllPeNormal}
                  savingStatus={peEdited ? 'idle' : screeningPhysicalExamId ? 'saved' : 'idle'}
                />
              </View>

              {/* Preventive & Cancer Screening Checklist */}
              <View style={styles.sectionCard}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Preventive & Cancer Screening Checklist
                </ThemedText>

                <View style={styles.chipRow}>
                  {cohortTabs.map((tab) => {
                    const active = activeCohortTab === tab.id;
                    return (
                      <Pressable
                        key={tab.id}
                        onPress={() => setActiveCohortTab(tab.id)}
                        style={[styles.purposeChip, active && styles.purposeChipActive]}
                      >
                        <ThemedText
                          variant={active ? 'smallBold' : 'small'}
                          color={active ? theme.colors.primary : theme.colors.textSecondary}
                        >
                          {tab.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                {activeCohortTab === 'adult' ? (
                  <View style={styles.chipRow}>
                    {adultScreeningOptions.map((opt) => {
                      const code = opt.philHealthCode || opt.code;
                      const active = adultRoutineCodes.includes(code);
                      return (
                        <Pressable
                          key={opt.code}
                          onPress={() =>
                            setAdultRoutineCodes((prev) => toggleScreeningCode(prev, code))
                          }
                          style={[styles.purposeChip, active && styles.chipSuccess]}
                        >
                          <ThemedText
                            variant={active ? 'smallBold' : 'small'}
                            color={active ? theme.colors.successText : theme.colors.textSecondary}
                          >
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {activeCohortTab === 'pediatric' ? (
                  <View style={styles.chipRow}>
                    {pediatricScreeningOptions.map((opt) => {
                      const code = opt.philHealthCode || opt.code;
                      const active = pediatricRoutineCodes.includes(code);
                      return (
                        <Pressable
                          key={opt.code}
                          onPress={() =>
                            setPediatricRoutineCodes((prev) => toggleScreeningCode(prev, code))
                          }
                          style={[styles.purposeChip, active && styles.chipSuccess]}
                        >
                          <ThemedText
                            variant={active ? 'smallBold' : 'small'}
                            color={active ? theme.colors.successText : theme.colors.textSecondary}
                          >
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {activeCohortTab === 'prenatal' ? (
                  <View style={styles.chipRow}>
                    {prenatalScreeningOptions.map((opt) => {
                      const code = opt.philHealthCode || opt.code;
                      const active = prenatalRoutineCodes.includes(code);
                      return (
                        <Pressable
                          key={opt.code}
                          onPress={() =>
                            setPrenatalRoutineCodes((prev) => toggleScreeningCode(prev, code))
                          }
                          style={[styles.purposeChip, active && styles.chipSuccess]}
                        >
                          <ThemedText
                            variant={active ? 'smallBold' : 'small'}
                            color={active ? theme.colors.successText : theme.colors.textSecondary}
                          >
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Targeted Cancer Screening
                </ThemedText>
                <View style={styles.chipRow}>
                  {cancerScreeningOptions
                    .filter((opt) => {
                      const code = opt.philHealthCode || opt.code;
                      const lower = opt.label.toLowerCase();
                      if ((code === '13' || lower.includes('pap') || lower.includes('cervical')) && !cohort.isFemale) {
                        return cervicalCancerSelected;
                      }
                      if ((code === '14' || lower.includes('prostate')) && cohort.isFemale) {
                        return prostateCancerSelected;
                      }
                      return true;
                    })
                    .map((opt) => {
                      const code = opt.philHealthCode || opt.code;
                      const lower = opt.label.toLowerCase();
                      const isBreast = code === '11' || lower.includes('breast');
                      const isCervical = code === '13' || lower.includes('cervical') || lower.includes('pap');
                      const isColorectal = code === '12' || lower.includes('colorectal') || lower.includes('colon');
                      const isProstate = code === '14' || lower.includes('prostate');

                      const active =
                        (isBreast && breastCancerSelected) ||
                        (isCervical && cervicalCancerSelected) ||
                        (isColorectal && colorectalCancerSelected) ||
                        (isProstate && prostateCancerSelected);

                      return (
                        <Pressable
                          key={opt.code}
                          onPress={() => {
                            if (isBreast) setBreastCancerSelected((v) => !v);
                            else if (isCervical) setCervicalCancerSelected((v) => !v);
                            else if (isColorectal) setColorectalCancerSelected((v) => !v);
                            else if (isProstate) setProstateCancerSelected((v) => !v);
                          }}
                          style={[styles.purposeChip, active && styles.chipSuccess]}
                        >
                          <ThemedText
                            variant={active ? 'smallBold' : 'small'}
                            color={active ? theme.colors.successText : theme.colors.textSecondary}
                          >
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                </View>
              </View>

              {/* Baseline Screening Labs */}
              <View style={styles.sectionCard}>
                <View style={styles.cardTitleRow}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Baseline Screening Labs ({orderedLabs.length})
                  </ThemedText>
                  <Button
                    title="Order Screening Labs"
                    variant="outline"
                    size="sm"
                    icon="lab"
                    onPress={() => setLabOrderModalOpen(true)}
                    testID="order-screening-labs-btn"
                  />
                </View>

                {orderedLabs.length > 0 ? (
                  <View style={styles.labList}>
                    {orderedLabs.map((order) => (
                      <View key={order.id} style={styles.labOrderRow}>
                        <Icon name="microscope" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                        <View style={styles.flexOne}>
                          <ThemedText variant="smallBold" color={theme.colors.text}>
                            {order.items.map((i) => i.testName).join(', ')}
                          </ThemedText>
                          <ThemedText variant="caption" color={theme.colors.textMuted}>
                            Order #{order.orderNumber} · {order.status}
                          </ThemedText>
                        </View>
                        <Badge label={order.status} variant="info" size="sm" />
                      </View>
                    ))}
                  </View>
                ) : (
                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    No baseline screening labs ordered for this visit yet.
                  </ThemedText>
                )}
              </View>
            </View>
          ) : null}

          {/* STATION 4: SUMMARY, DISPOSITION & SIGN-OFF */}
          {activeStep === 4 ? (
            <View style={styles.stationBody} testID="screening-station-4">
              {completedScreening ? (
                <View style={styles.completedBanner} testID="screening-completed-banner">
                  <Icon name="checkCircle" size={theme.sizes.iconLg} color={theme.colors.successText} />
                  <View style={styles.flexOne}>
                    <ThemedText variant="h3" color={theme.colors.successText}>
                      Health Screening Completed
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Disposition: {completedScreening.disposition || disposition}
                      {profilingTransNo ? ` · YAKAP FPE Trans No: ${profilingTransNo}` : ''}
                    </ThemedText>
                  </View>
                </View>
              ) : null}

              {workflowMode === 'YakapAvailment' ? (
                <View style={styles.sectionCard} testID="yakap-readiness-checklist">
                  <View style={styles.cardTitleRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      PhilHealth YAKAP FPE Readiness Checklist
                    </ThemedText>
                    <Badge
                      label={yakapReadiness.isReady ? 'Ready for FPE Stamping' : 'Incomplete Requirements'}
                      variant={yakapReadiness.isReady ? 'success' : 'warning'}
                      size="sm"
                    />
                  </View>

                  <View style={styles.checklistGrid}>
                    {[
                      { label: 'Valid 12-digit PhilHealth PIN', ok: yakapReadiness.hasValidPin },
                      { label: 'Active Current-Year YAKAP Enlistment', ok: yakapReadiness.hasActiveEnlistment },
                      { label: 'ATC or Walk-In Recorded', ok: yakapReadiness.hasAtcOrWalkIn },
                      { label: 'Vitals & Anthropometrics Recorded', ok: yakapReadiness.hasVitals },
                      { label: '9-System Physical Exam Saved', ok: yakapReadiness.hasPhysicalExam },
                      { label: 'PhilPEN NCD Risk Assessed (Adults 20+)', ok: yakapReadiness.hasNcdRisk },
                    ].map((item) => (
                      <View key={item.label} style={styles.checklistItem}>
                        <Icon
                          name={item.ok ? 'checkCircle' : 'alertCircle'}
                          size={theme.sizes.iconSm}
                          color={item.ok ? theme.colors.successText : theme.colors.warningText}
                        />
                        <ThemedText
                          variant="small"
                          color={item.ok ? theme.colors.text : theme.colors.warningText}
                        >
                          {item.label}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {!canCompleteSelectedTrack ? (
                <View style={styles.warningCallout} testID="authority-notice-banner">
                  <Icon name="lock" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                  <ThemedText variant="small" color={theme.colors.warningText} style={styles.flexOne}>
                    {workflowMode === 'YakapAvailment'
                      ? 'Physician sign-off is required for PhilHealth YAKAP FPE unless Nurse/Midwife facilitator is enabled in Clinic Settings.'
                      : 'Physician sign-off is required for APE, Pre-Employment, and School Physical screenings. Save & route this chart to the Physician.'}
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.sectionCard}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Screening Outcome & Disposition
                </ThemedText>
                <View style={styles.dispositionGrid}>
                  {DISPOSITION_OPTIONS.map((opt) => {
                    const active = disposition === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setDisposition(opt.value)}
                        style={[
                          styles.dispositionCard,
                          active && styles.dispositionCardActive,
                          active &&
                            opt.value === 'EscalatedToConsultation' &&
                            styles.dispositionCardDanger,
                        ]}
                      >
                        <ThemedText
                          variant={active ? 'smallBold' : 'small'}
                          color={
                            active && opt.value === 'EscalatedToConsultation'
                              ? theme.colors.emergencyText
                              : active
                                ? theme.colors.primary
                                : theme.colors.text
                          }
                        >
                          {opt.label}
                        </ThemedText>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          {opt.description}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <Input
                  label="Clinical Summary / Impression"
                  value={clinicalImpression}
                  onChangeText={setClinicalImpression}
                  placeholder="Summarize screening findings and overall fitness impression..."
                  multiline
                />

                <Input
                  label="Preventive Counseling & Patient Advice"
                  value={preventiveCounselingNotes}
                  onChangeText={setPreventiveCounselingNotes}
                  placeholder="Diet, exercise, smoking cessation, screening follow-up advice..."
                  multiline
                />

                <ValidatedDateInput
                  label="Recommended Follow-Up Date"
                  value={recommendedFollowUpDate}
                  onChangeText={setRecommendedFollowUpDate}
                  boundaryMode="futureOrToday"
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </View>
          ) : null}
        </View>
      )}

      {/* Sub-modals: ONLY mounted when open so dormant modals create 0 document.body appends */}
      {allergyModalOpen ? (
        <StructuredAllergyIntakeModal
          visible={allergyModalOpen}
          onClose={() => setAllergyModalOpen(false)}
          allergies={allergies.map((a) => ({
            category: a.category,
            allergen: a.allergen,
            allergenDrugCode: a.allergenDrugCode ?? null,
            severity: a.severity,
            reactionManifestation: a.reactionManifestation ?? null,
            isAnaphylactic: a.isAnaphylactic,
            onsetDate: a.onsetDate ?? null,
            notes: a.notes ?? null,
          }))}
          onAddAllergy={handleAddAllergy}
          onRemoveAllergy={(idx) => handleRemoveAllergy(idx)}
          saving={savingAllergy}
        />
      ) : null}

      {adminVaccineOpen ? (
        <AdministerVaccineModal
          visible={adminVaccineOpen}
          onClose={() => setAdminVaccineOpen(false)}
          patient={patient}
          demographics={chart?.demographics ?? null}
          queueItemId={activeQueueItemId}
          onAdministerVaccine={async (payload) => {
            const qId = activeQueueItemId || (await ensureActiveQueueItem());
            const [created, err] = await clinicService.administerVaccine(patient.id, {
              ...payload,
              queueItemId: qId,
            });
            if (err || !created) {
              throw new Error(err?.message || 'Failed to administer vaccine.');
            }
            setImmunizations((prev) => [created, ...prev]);
            setImmunizationsEdited(true);
          }}
        />
      ) : null}

      {histVaccineOpen ? (
        <HistoricalVaccineModal
          visible={histVaccineOpen}
          onClose={() => setHistVaccineOpen(false)}
          patient={patient}
          demographics={chart?.demographics ?? null}
          onRecordHistoricalVaccine={async (payload) => {
            const [created, err] = await clinicService.recordHistoricalImmunization(
              patient.id,
              payload
            );
            if (err || !created) {
              throw new Error(err?.message || 'Failed to record historical vaccine.');
            }
            setImmunizations((prev) => [created, ...prev]);
            setImmunizationsEdited(true);
          }}
        />
      ) : null}

      {labOrderModalOpen ? (
        <OrderCatalogSearchModal
          visible={labOrderModalOpen}
          onClose={() => setLabOrderModalOpen(false)}
          initialCategory="Diagnostic"
          isYakapEligible={workflowMode === 'YakapAvailment'}
          onSelectOrder={handleOrderScreeningLab}
          alreadyOrderedNames={orderedLabs.flatMap((o) => o.items.map((i) => i.testName))}
        />
      ) : null}

      {medCertModalOpen && activeQueueItemId ? (
        <IssueMedicalCertificateModal
          visible={medCertModalOpen}
          onClose={() => setMedCertModalOpen(false)}
          patient={patient}
          queueItemId={activeQueueItemId}
          allowDuplicateActive
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  headerExtraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  footerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  footerActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  programBar: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  trackRow: {
    gap: theme.spacing.xs,
  },
  purposeSection: {
    gap: theme.spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  purposeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
  },
  purposeChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
    ...theme.shadows.brandSubtle,
  },
  chipSuccess: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successBg,
  },
  chipWarning: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningBg,
  },
  chipLocked: {
    opacity: 0.75,
  },
  yakapIntakeStrip: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primarySubtle,
    gap: theme.spacing.sm,
  },
  yakapBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  yakapControlsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-end',
  },
  walkInGroup: {
    gap: theme.spacing.xs,
  },
  warningCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
    backgroundColor: theme.colors.warningBg,
  },
  draftRestoredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
    backgroundColor: theme.colors.infoBg,
  },
  draftRestoredTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 200,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  stepNodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    minWidth: 148,
  },
  stepNodeCardDone: {
    borderColor: theme.colors.successBorder,
    backgroundColor: theme.colors.successBg,
  },
  stepNodeCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.brandSubtle,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
  },
  stepCircleDone: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.success,
  },
  stepCircleActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  stepTextCol: {
    gap: 1,
  },
  stepConnector: {
    height: 2,
    width: 20,
    minWidth: 12,
    flexShrink: 1,
    backgroundColor: theme.colors.borderDark,
    borderRadius: theme.radii.full,
  },
  stepConnectorDone: {
    backgroundColor: theme.colors.success,
  },
  stationBody: {
    gap: theme.spacing.lg,
  },
  redFlagBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
    backgroundColor: theme.colors.emergencyBg,
  },
  redFlagTextCol: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing.xs,
  },
  redFlagTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  sectionCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.md,
  },
  handoffSummaryCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
    backgroundColor: theme.colors.infoBg,
    gap: theme.spacing.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  infoBanner: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
    backgroundColor: theme.colors.infoBg,
  },
  formStack: {
    gap: theme.spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  stackCol: {
    flexDirection: 'column',
  },
  flexOne: {
    flex: 1,
  },
  ncdQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  ncdNestedContainer: {
    paddingLeft: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderLeftWidth: theme.sizes.borderWidth,
    borderLeftColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    gap: theme.spacing.sm,
  },
  ncdSubNestedContainer: {
    paddingLeft: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderLeftWidth: theme.sizes.borderWidth,
    borderLeftColor: theme.colors.warningBorder,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    gap: theme.spacing.sm,
  },
  labList: {
    gap: theme.spacing.sm,
  },
  labOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    backgroundColor: theme.colors.successBg,
  },
  checklistGrid: {
    gap: theme.spacing.sm,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dispositionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  dispositionCard: {
    flex: 1,
    minWidth: 190,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  dispositionCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
    ...theme.shadows.brandSubtle,
  },
  dispositionCardDanger: {
    borderColor: theme.colors.emergency,
    backgroundColor: theme.colors.emergencyBg,
  },
});
