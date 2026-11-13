import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { theme } from '@constants/theme';
import {
  ThemedText,
  Button,
  Input,
  Icon,
  ErrorState,
  SkeletonList,
  Modal,
  Badge,
  ValidatedDateInput,
  Icd10AutocompleteInput,
  validateDateString,
} from '@ui';
import { Alert, notify } from '@utils/feedback';
import { usePhilHealthCatalog } from '@utils/usePhilHealthCatalog';
import { useClinic } from '../../context/ClinicContext';
import { useAuth, usePermission } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import {
  clinicService,
  formatClinicDate,
  formatClinicDateTime,
  ClinicPatient,
  PatientSurgicalHistory,
  UpsertPatientSurgicalHistoryPayload,
  PatientProblemRecord,
  CreatePatientProblemPayload,
  PatientAllergyRecord,
  CreatePatientAllergyPayload,
  PhilHealthPatientProfile,
  MedicalHistoryEntryItem,
  FamilyHistoryEntryItem,
} from '../../services/clinicService';
import OrganSystemsExamSection, {
  DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
  type OrganSystemsExamValues,
  type OrganSystemDef,
} from './OrganSystemsExamSection';
import StructuredAllergyIntakeModal, {
  type CreateAllergyRequest,
} from '../patient/StructuredAllergyIntakeModal';

export const PHILHEALTH_MDISEASES_CONDITIONS: { code: string; description: string }[] = [
  { code: '001', description: 'Allergy' },
  { code: '002', description: 'Asthma' },
  { code: '003', description: 'Cancer' },
  { code: '004', description: 'Cerebrovascular Disease' },
  { code: '005', description: 'Coronary Artery Disease' },
  { code: '006', description: 'Diabetes Mellitus' },
  { code: '007', description: 'Emphysema' },
  { code: '008', description: 'Epilepsy/Seizure Disorder' },
  { code: '009', description: 'Hepatitis' },
  { code: '010', description: 'Hyperlipidemia' },
  { code: '011', description: 'Hypertension' },
  { code: '012', description: 'Peptic Ulcer' },
  { code: '013', description: 'Pneumonia' },
  { code: '014', description: 'Thyroid Disease' },
  { code: '015', description: 'Pulmonary Tuberculosis' },
  { code: '016', description: 'Extrapulmonary Tuberculosis' },
  { code: '017', description: 'Urinary Tract Infection' },
  { code: '018', description: 'Mental Illness' },
  { code: '998', description: 'Others' },
];

export type AllergyCategoryOption = 'Medication' | 'Food' | 'Environmental' | 'Biologic' | 'Other';
export type AllergySeverityOption = 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening';

export const ALLERGY_CATEGORY_OPTIONS: { value: AllergyCategoryOption; label: string }[] = [
  { value: 'Medication', label: 'Medication' },
  { value: 'Food', label: 'Food' },
  { value: 'Environmental', label: 'Environmental' },
  { value: 'Biologic', label: 'Biologic' },
  { value: 'Other', label: 'Other' },
];

export const ALLERGY_SEVERITY_OPTIONS: { value: AllergySeverityOption; label: string }[] = [
  { value: 'Mild', label: 'Mild' },
  { value: 'Moderate', label: 'Moderate' },
  { value: 'Severe', label: 'Severe' },
  { value: 'LifeThreatening', label: 'Life-Threatening' },
];

export function humanizeAllergySeverity(severity?: string | null): string {
  if (!severity) return '';
  if (severity === 'LifeThreatening') return 'Life-Threatening';
  return severity;
}

export function isNoneHistoryEntry(code?: string | null, description?: string | null): boolean {
  const cleanCode = code?.trim() || '';
  const cleanDesc = description?.trim().toLowerCase() || '';
  return cleanCode === '999' || cleanDesc === 'none';
}

const ICD10_TO_MDISEASE_RULES: { pattern: RegExp; code: string }[] = [
  { pattern: /^(T78\.4|J30|L23|L50\.0)/i, code: '001' }, // Allergy
  { pattern: /^J4[56]/i, code: '002' }, // Asthma
  { pattern: /^C[0-9]{2}/i, code: '003' }, // Cancer (Malignant neoplasms)
  { pattern: /^(I6[0-9]|G45)/i, code: '004' }, // Cerebrovascular Disease
  { pattern: /^I2[0-5]/i, code: '005' }, // Coronary Artery Disease
  { pattern: /^(E1[0-4]|O24)/i, code: '006' }, // Diabetes Mellitus
  { pattern: /^J43/i, code: '007' }, // Emphysema
  { pattern: /^(G4[01]|R56)/i, code: '008' }, // Epilepsy/Seizure Disorder
  { pattern: /^(B1[5-9]|K73|K75\.4)/i, code: '009' }, // Hepatitis
  { pattern: /^E78/i, code: '010' }, // Hyperlipidemia
  { pattern: /^I1[0-5]/i, code: '011' }, // Hypertension
  { pattern: /^K2[5-8]/i, code: '012' }, // Peptic Ulcer
  { pattern: /^J1[2-8]/i, code: '013' }, // Pneumonia
  { pattern: /^E0[0-7]/i, code: '014' }, // Thyroid Disease
  { pattern: /^A1[56]/i, code: '015' }, // Pulmonary Tuberculosis
  { pattern: /^A1[7-9]/i, code: '016' }, // Extrapulmonary Tuberculosis
  { pattern: /^(N39\.0|N30)/i, code: '017' }, // Urinary Tract Infection
  { pattern: /^F([02-9][0-9]|1[0-689])/i, code: '018' }, // Mental Illness (excluding F17 nicotine)
];

const TITLE_SYNONYM_TO_MDISEASE_RULES: { pattern: RegExp; code: string }[] = [
  { pattern: /\bextrapulmonary\s+tuberculosis\b/i, code: '016' },
  { pattern: /\b(pulmonary\s+tuberculosis|ptb)\b/i, code: '015' },
  { pattern: /\b(hypertension|hypertensive)\b/i, code: '011' },
  { pattern: /\bdiabetes\b/i, code: '006' },
  { pattern: /\basthma\b/i, code: '002' },
  { pattern: /\b(cancer|carcinoma|malignant\s+neoplasm|lymphoma|leukemia|sarcoma)\b/i, code: '003' },
  { pattern: /\b(cerebrovascular|stroke|cerebral\s+infarction|transient\s+ischemic\s+attack)\b/i, code: '004' },
  { pattern: /\b(coronary\s+artery|ischemic\s+heart|ischaemic\s+heart|angina\s+pectoris|myocardial\s+infarction)\b/i, code: '005' },
  { pattern: /\bemphysema\b/i, code: '007' },
  { pattern: /\b(epilepsy|seizure)\b/i, code: '008' },
  { pattern: /\bhepatitis\b/i, code: '009' },
  { pattern: /\b(hyperlipidemia|dyslipidemia|hypercholesterolemia|hypertriglyceridemia)\b/i, code: '010' },
  { pattern: /\b(peptic\s+ulcer|gastric\s+ulcer|duodenal\s+ulcer|gastrojejunal\s+ulcer)\b/i, code: '012' },
  { pattern: /\bpneumonia\b/i, code: '013' },
  { pattern: /\b(thyroid|hypothyroidism|hyperthyroidism|thyrotoxicosis|goiter)\b/i, code: '014' },
  { pattern: /\b(urinary\s+tract\s+infection|acute\s+cystitis)\b/i, code: '017' },
  { pattern: /\b(mental\s+illness|depressive|depression|schizophrenia|bipolar|anxiety\s+disorder|psychosis)\b/i, code: '018' },
  { pattern: /\b(allergy|allergic|anaphylaxis)\b/i, code: '001' },
];

/**
 * Matches a Structured Problem to a Personal Medical History item (`001`–`018`).
 * If it does not match any predefined condition, falls back to `'998'` (`Others`)
 * with `otherDescription` set to the problem title.
 */
export function matchProblemToPersonalHistoryCondition(
  problem: {
    icd10Code?: string | null;
    problemTitle: string;
    philHealthMdiseaseCode?: string | null;
  },
  catalogConditions: { code: string; description: string }[] = PHILHEALTH_MDISEASES_CONDITIONS
): { matchedCode: string; otherDescription?: string } {
  const validSpecificCatalog = catalogConditions.filter(
    (c) => c.code !== '998' && !isNoneHistoryEntry(c.code, c.description)
  );
  const validCodes = new Set(validSpecificCatalog.map((c) => c.code));

  const explicitCode = problem.philHealthMdiseaseCode?.trim();
  if (explicitCode && validCodes.has(explicitCode)) {
    return { matchedCode: explicitCode };
  }

  const cleanTitle = problem.problemTitle.trim();
  const lowerTitle = cleanTitle.toLowerCase();

  // Direct catalog description match
  const exactOrContainedCatalog = validSpecificCatalog.find((c) => {
    const d = c.description.trim().toLowerCase();
    return d.length > 0 && (lowerTitle === d || lowerTitle.includes(d));
  });
  if (exactOrContainedCatalog) {
    return { matchedCode: exactOrContainedCatalog.code };
  }

  // ICD-10 prefix match
  const cleanIcd = problem.icd10Code?.trim() || '';
  if (cleanIcd) {
    for (const rule of ICD10_TO_MDISEASE_RULES) {
      if (rule.pattern.test(cleanIcd) && validCodes.has(rule.code)) {
        return { matchedCode: rule.code };
      }
    }
  }

  // Clinical title keyword/synonym match
  for (const rule of TITLE_SYNONYM_TO_MDISEASE_RULES) {
    if (rule.pattern.test(cleanTitle) && validCodes.has(rule.code)) {
      return { matchedCode: rule.code };
    }
  }

  return {
    matchedCode: '998',
    otherDescription: cleanTitle,
  };
}

/**
 * Deduplicates and appends non-catalog condition descriptions for `'998'` (`Others`).
 */
export function mergeOtherConditionDescriptions(existingDesc: string, additions: string[]): string {
  const tokens: string[] = [];
  const seen = new Set<string>();

  const pushToken = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (lower === 'none' || lower === 'others') return;
    if (!seen.has(lower)) {
      seen.add(lower);
      tokens.push(trimmed);
    }
  };

  for (const part of existingDesc.split(',')) {
    pushToken(part);
  }
  for (const add of additions) {
    pushToken(add);
  }

  return tokens.join(', ');
}

/**
 * Resolves condition codes in Personal Medical History that are linked to active
 * Structured Problems or active documented allergies.
 * Returns a Map of condition code -> lock explanation message.
 */
export function getLockedPersonalConditionCodes(params: {
  problems: (Pick<PatientProblemRecord, 'icd10Code' | 'problemTitle' | 'philHealthMdiseaseCode'> & { status?: string })[];
  allergies: (Pick<PatientAllergyRecord, 'allergen'> & { status?: string })[];
  catalogConditions?: { code: string; description: string }[];
}): Map<string, string> {
  const catalog = params.catalogConditions || PHILHEALTH_MDISEASES_CONDITIONS;
  const locked = new Map<string, string>();

  const activeProblems = params.problems.filter(
    (p) => !p.status || p.status.toLowerCase() === 'active'
  );
  for (const prob of activeProblems) {
    if (!prob.problemTitle?.trim()) continue;
    const match = matchProblemToPersonalHistoryCondition(prob, catalog);
    if (!locked.has(match.matchedCode)) {
      locked.set(
        match.matchedCode,
        'Managed in Structured Problem List — resolve or delete problem to remove.'
      );
    }
  }

  const activeAllergies = params.allergies.filter(
    (a) => !a.status || a.status.toLowerCase() === 'active'
  );
  if (activeAllergies.length > 0 && !locked.has('001')) {
    locked.set(
      '001',
      'Managed in Documented Allergies — remove allergy to remove.'
    );
  }

  return locked;
}

/**
 * Reconciles Personal Medical History codes and Others description against
 * active documented Structured Problems and active Documented Allergies.
 */
export function reconcilePersonalHistoryWithClinicalRecords(params: {
  selectedCodes: Iterable<string>;
  otherDesc: string;
  problems: (Pick<PatientProblemRecord, 'icd10Code' | 'problemTitle' | 'philHealthMdiseaseCode'> & { status?: string })[];
  allergies: (Pick<PatientAllergyRecord, 'allergen'> & { status?: string })[];
  catalogConditions?: { code: string; description: string }[];
}): { codes: Set<string>; otherDesc: string; changed: boolean } {
  const catalog = params.catalogConditions || PHILHEALTH_MDISEASES_CONDITIONS;
  const prevCleanCodes = new Set<string>();
  for (const code of params.selectedCodes) {
    if (!isNoneHistoryEntry(code, null)) {
      prevCleanCodes.add(code);
    }
  }
  const prevCleanOther = isNoneHistoryEntry(null, params.otherDesc) ? '' : params.otherDesc.trim();

  const nextCodes = new Set(prevCleanCodes);
  const otherAdditions: string[] = [];

  const activeAllergies = params.allergies.filter(
    (a) => !a.status || a.status.toLowerCase() === 'active'
  );
  if (activeAllergies.length > 0) {
    nextCodes.add('001');
  }

  const activeProblems = params.problems.filter(
    (p) => !p.status || p.status.toLowerCase() === 'active'
  );
  for (const prob of activeProblems) {
    if (!prob.problemTitle?.trim()) continue;
    const match = matchProblemToPersonalHistoryCondition(prob, catalog);
    nextCodes.add(match.matchedCode);
    if (match.matchedCode === '998' && match.otherDescription) {
      otherAdditions.push(match.otherDescription);
    }
  }

  const nextOtherDesc = nextCodes.has('998')
    ? otherAdditions.length > 0
      ? mergeOtherConditionDescriptions(prevCleanOther, otherAdditions)
      : prevCleanOther
    : '';

  let changed = nextCodes.size !== prevCleanCodes.size || nextOtherDesc !== prevCleanOther;
  if (!changed) {
    for (const c of nextCodes) {
      if (!prevCleanCodes.has(c)) {
        changed = true;
        break;
      }
    }
  }

  return {
    codes: nextCodes,
    otherDesc: nextOtherDesc,
    changed,
  };
}

export const defaultPhilHealthProfile: PhilHealthPatientProfile = {
  medicalHistories: [],
  surgicalHistories: [],
  familyHistories: [],
  isSmoker: false,
  isAlcoholDrinker: false,
  illDrugUser: false,
  isSexuallyActive: false,
  childImmunizations: [],
  youngWomanImmunizations: [],
  pregnantWomanImmunizations: [],
  elderlyImmunizations: [],
  otherImmunizations: [],
  menstrualApplicable: false,
  isMenopause: false,
  pregnancyApplicable: false,
  gravida: 0,
  para: 0,
  fullTermCount: 0,
  prematureCount: 0,
  abortionCount: 0,
  livingChildrenCount: 0,
  preEclampsiaHypertension: false,
  familyPlanningCounseling: false,
  skinId: '1',
  heentId: '1',
  chestId: '1',
  heartId: '1',
  abdomenId: '1',
  neuroId: '1',
  rectalId: '1',
  guId: '1',
  genSurveyId: '1',
  ncdAnswers: {},
};

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

function parseChronicConditionsFallback(chronicConditions?: string | null): Set<string> {
  const codes = new Set<string>();
  if (!chronicConditions) return codes;
  const parsed = chronicConditions.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const item of PHILHEALTH_MDISEASES_CONDITIONS) {
    if (parsed.some((p) => p === item.code.toLowerCase() || p === item.description.toLowerCase())) {
      codes.add(item.code);
    }
  }
  return codes;
}

export interface ClinicalHistoryTabProps {
  patient: ClinicPatient;
  initialSurgicalHistories?: PatientSurgicalHistory[];
  initialProfile?: PhilHealthPatientProfile;
  initialProblems?: PatientProblemRecord[];
  initialAllergies?: PatientAllergyRecord[];
  onRefreshChart?: () => void;
  readOnly?: boolean;
}

export default function ClinicalHistoryTab({
  patient,
  initialSurgicalHistories,
  initialProfile,
  initialProblems,
  initialAllergies,
  onRefreshChart,
  readOnly,
}: ClinicalHistoryTabProps) {
  const { dateFormat, timeFormat, timeZoneId } = useClinic();
  const { user, state, permissions } = useAuth();
  const hasPatientsWrite = usePermission(PERMISSIONS.patientsWrite);
  const isUnmountedTestHarness = state === 'booting' && !user && permissions.length === 0;
  const canWritePatients = readOnly !== undefined ? !readOnly : isUnmountedTestHarness ? true : hasPatientsWrite;

  // Surgical History State
  const [surgicalHistories, setSurgicalHistories] = useState<PatientSurgicalHistory[]>(
    initialSurgicalHistories || []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State for Add / Edit Surgical Procedure
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PatientSurgicalHistory | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Surgical Form Fields
  const [procedureName, setProcedureName] = useState('');
  const [surgeryDate, setSurgeryDate] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [findings, setFindings] = useState('');
  const [complications, setComplications] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Problems State
  const [problems, setProblems] = useState<PatientProblemRecord[]>(initialProblems || []);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [problemModalVisible, setProblemModalVisible] = useState(false);
  const [savingProblem, setSavingProblem] = useState(false);
  const [problemIcd10, setProblemIcd10] = useState('');
  const [problemTitle, setProblemTitle] = useState('');
  const [problemStatus, setProblemStatus] = useState<'Active' | 'Resolved'>('Active');
  const [problemSeverity, setProblemSeverity] = useState<'Mild' | 'Moderate' | 'Severe'>('Moderate');
  const [problemIsChronic, setProblemIsChronic] = useState(false);
  const [problemOnsetDate, setProblemOnsetDate] = useState(new Date().toISOString().split('T')[0]);
  const [problemNotes, setProblemNotes] = useState('');
  const [problemFormError, setProblemFormError] = useState<string | null>(null);

  // Allergies State (managed via StructuredAllergyIntakeModal)
  const [allergies, setAllergies] = useState<PatientAllergyRecord[]>(initialAllergies || []);
  const [loadingAllergies, setLoadingAllergies] = useState(false);
  const [allergyModalVisible, setAllergyModalVisible] = useState(false);
  const [savingAllergy, setSavingAllergy] = useState(false);
  const [allergyFormError, setAllergyFormError] = useState<string | null>(null);

  const structuredExistingAllergies = useMemo<CreateAllergyRequest[]>(
    () =>
      allergies.map((a) => ({
        category: a.category || 'Other',
        allergen: a.allergen,
        allergenDrugCode: a.allergenDrugCode || undefined,
        severity: a.severity || 'Moderate',
        reactionManifestation: a.reactionManifestation || undefined,
        isAnaphylactic: Boolean(a.isAnaphylactic),
        onsetDate: a.onsetDate || undefined,
        notes: a.notes || undefined,
      })),
    [allergies]
  );

  // Personal Medical History State
  const [selectedMedicalCodes, setSelectedMedicalCodes] = useState<Set<string>>(() => {
    if (initialProfile?.medicalHistories?.length) {
      return new Set(
        initialProfile.medicalHistories
          .filter((m) => !isNoneHistoryEntry(m.code, m.specificDesc))
          .map((m) => m.code)
      );
    }
    if (initialProfile === undefined && patient.chronicConditions) {
      return parseChronicConditionsFallback(patient.chronicConditions);
    }
    return new Set();
  });
  const [medicalOtherDesc, setMedicalOtherDesc] = useState(() => {
    const raw = initialProfile?.medicalHistories?.find((m) => m.code === '998')?.specificDesc || '';
    return isNoneHistoryEntry(null, raw) ? '' : raw;
  });
  const [personalNotes, setPersonalNotes] = useState(
    () => initialProfile?.medicalHistoryNotes || ''
  );
  const [personalSavingStatus, setPersonalSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [personalSaveError, setPersonalSaveError] = useState<string | null>(null);
  const [personalLastSavedAt, setPersonalLastSavedAt] = useState<string | null>(() => {
    if (initialProfile?.medicalHistories?.length && initialProfile.lastUpdatedAt) {
      return initialProfile.lastUpdatedAt;
    }
    return null;
  });

  // Family Medical History State
  const [selectedFamilyCodes, setSelectedFamilyCodes] = useState<Set<string>>(() => {
    if (initialProfile?.familyHistories?.length) {
      return new Set(
        initialProfile.familyHistories
          .filter((f) => !isNoneHistoryEntry(f.code, f.specificDesc))
          .map((f) => f.code)
      );
    }
    return new Set();
  });
  const [familyOtherDesc, setFamilyOtherDesc] = useState(() => {
    const raw = initialProfile?.familyHistories?.find((f) => f.code === '998')?.specificDesc || '';
    return isNoneHistoryEntry(null, raw) ? '' : raw;
  });
  const [familyNotes, setFamilyNotes] = useState(
    () => initialProfile?.familyHistoryNotes || ''
  );
  const [familySavingStatus, setFamilySavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [familySaveError, setFamilySaveError] = useState<string | null>(null);
  const [familyLastSavedAt, setFamilyLastSavedAt] = useState<string | null>(() => {
    if (initialProfile?.familyHistories?.length && initialProfile.lastUpdatedAt) {
      return initialProfile.lastUpdatedAt;
    }
    return null;
  });

  // Organ Systems Examination State
  const [organSystems, setOrganSystems] = useState<OrganSystemsExamValues>(() => ({
    genSurveyId: '1',
    genSurveyRemarks: '',
    skinId: initialProfile?.skinId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.skinId,
    heentId: initialProfile?.heentId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heentId,
    chestId: initialProfile?.chestId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.chestId,
    heartId: initialProfile?.heartId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heartId,
    abdomenId: initialProfile?.abdomenId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.abdomenId,
    neuroId: initialProfile?.neuroId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.neuroId,
    guId: initialProfile?.guId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.guId,
    rectalId: initialProfile?.rectalId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.rectalId,
    skinRemarks: initialProfile?.skinRemarks || '',
    heentRemarks: initialProfile?.heentRemarks || '',
    chestRemarks: initialProfile?.chestRemarks || '',
    heartRemarks: initialProfile?.heartRemarks || '',
    abdomenRemarks: initialProfile?.abdomenRemarks || '',
    neuroRemarks: initialProfile?.neuroRemarks || '',
    guRemarks: initialProfile?.guRemarks || '',
    rectalRemarks: initialProfile?.rectalRemarks || '',
  }));

  // Physical Exam Autosave & State
  const [physicalExamSavingStatus, setPhysicalExamSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [physicalExamError, setPhysicalExamError] = useState<string | null>(null);
  const [physicalExamLastSavedAt, setPhysicalExamLastSavedAt] = useState<string | null>(null);
  const remarksDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const personalDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const familyDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const organSystemsRef = useRef(organSystems);
  organSystemsRef.current = organSystems;

  const personalSnapshotRef = useRef({
    codes: selectedMedicalCodes,
    otherDesc: medicalOtherDesc,
    notes: personalNotes,
  });
  personalSnapshotRef.current = {
    codes: selectedMedicalCodes,
    otherDesc: medicalOtherDesc,
    notes: personalNotes,
  };

  const familySnapshotRef = useRef({
    codes: selectedFamilyCodes,
    otherDesc: familyOtherDesc,
    notes: familyNotes,
  });
  familySnapshotRef.current = {
    codes: selectedFamilyCodes,
    otherDesc: familyOtherDesc,
    notes: familyNotes,
  };

  // Catalog for past medical conditions (lib_mdiseases) — strictly exclude '999' / 'None'
  const { items: diseaseCatalog } = usePhilHealthCatalog('lib_mdiseases');
  const activeCatalogConditions = useMemo(() => {
    return diseaseCatalog && diseaseCatalog.length > 0
      ? diseaseCatalog
          .filter((item) => !isNoneHistoryEntry(item.code, item.description))
          .map((item) => ({ code: item.code, description: item.description }))
      : PHILHEALTH_MDISEASES_CONDITIONS;
  }, [diseaseCatalog]);
  const availableConditions = activeCatalogConditions;

  // Conditions linked to active Structured Problems or active documented allergies are locked
  const lockedConditionReasons = useMemo(() => {
    return getLockedPersonalConditionCodes({
      problems,
      allergies,
      catalogConditions: activeCatalogConditions,
    });
  }, [problems, allergies, activeCatalogConditions]);

  const formatClinicalCalendarDate = useCallback(
    (raw?: string | null): string => {
      if (!raw) return '—';
      const trimmed = raw.trim();
      if (!trimmed) return '—';
      const ymd = trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
      return formatClinicDate(ymd, { dateFormat, timeZoneId, fallback: '—' });
    },
    [dateFormat, timeZoneId]
  );

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

  const buildPersonalMedicalItems = useCallback(
    (codes: Iterable<string>, otherDesc: string, notes: string): MedicalHistoryEntryItem[] => {
      const cleanNotes = notes.trim() || null;
      const entries: MedicalHistoryEntryItem[] = [];
      for (const code of codes) {
        if (isNoneHistoryEntry(code, null)) continue;
        const match = activeCatalogConditions.find((c) => c.code === code);
        const conditionTitle =
          code === '998' ? otherDesc.trim() || 'Others' : match?.description || code;
        entries.push({
          conditionTitle,
          philHealthMdiseaseCode: code,
          specificDescription: code === '998' ? otherDesc.trim() || 'Others' : null,
          clinicalNotes: cleanNotes,
        });
      }
      return entries;
    },
    [activeCatalogConditions]
  );

  const buildFamilyMedicalItems = useCallback(
    (codes: Iterable<string>, otherDesc: string, notes: string): FamilyHistoryEntryItem[] => {
      const cleanNotes = notes.trim() || null;
      const entries: FamilyHistoryEntryItem[] = [];
      for (const code of codes) {
        if (isNoneHistoryEntry(code, null)) continue;
        const match = activeCatalogConditions.find((c) => c.code === code);
        const conditionTitle =
          code === '998' ? otherDesc.trim() || 'Others' : match?.description || code;
        entries.push({
          conditionTitle,
          philHealthMdiseaseCode: code,
          specificDescription: code === '998' ? otherDesc.trim() || 'Others' : null,
          clinicalNotes: cleanNotes,
        });
      }
      return entries;
    },
    [activeCatalogConditions]
  );

  const savePersonalMedicalHistory = useCallback(
    async (snapshot?: { codes: Set<string>; otherDesc: string; notes: string }) => {
      if (!canWritePatients) return;
      const target = snapshot || personalSnapshotRef.current;
      setPersonalSavingStatus('saving');
      setPersonalSaveError(null);

      const cleanNotes = target.notes.trim() || null;
      const items = buildPersonalMedicalItems(target.codes, target.otherDesc, target.notes);

      try {
        const [saved, err] = await clinicService.savePastMedicalHistories(patient.id, {
          items,
          notes: cleanNotes,
        });

        if (err) {
          setPersonalSavingStatus('error');
          setPersonalSaveError(err.message || 'Failed to auto-save personal medical history.');
        } else {
          setPersonalLastSavedAt(saved?.updatedAt || new Date().toISOString());
          setPersonalSavingStatus('saved');
          onRefreshChart?.();
        }
      } catch (e: any) {
        setPersonalSavingStatus('error');
        setPersonalSaveError(e.message || 'Failed to auto-save personal medical history.');
      }
    },
    [canWritePatients, patient.id, buildPersonalMedicalItems, onRefreshChart]
  );

  const saveFamilyMedicalHistory = useCallback(
    async (snapshot?: { codes: Set<string>; otherDesc: string; notes: string }) => {
      if (!canWritePatients) return;
      const target = snapshot || familySnapshotRef.current;
      setFamilySavingStatus('saving');
      setFamilySaveError(null);

      const cleanNotes = target.notes.trim() || null;
      const items = buildFamilyMedicalItems(target.codes, target.otherDesc, target.notes);

      try {
        const [saved, err] = await clinicService.saveFamilyHistories(patient.id, {
          items,
          notes: cleanNotes,
        });

        if (err) {
          setFamilySavingStatus('error');
          setFamilySaveError(err.message || 'Failed to auto-save family medical history.');
        } else {
          setFamilyLastSavedAt(saved?.updatedAt || new Date().toISOString());
          setFamilySavingStatus('saved');
          onRefreshChart?.();
        }
      } catch (e: any) {
        setFamilySavingStatus('error');
        setFamilySaveError(e.message || 'Failed to auto-save family medical history.');
      }
    },
    [canWritePatients, patient.id, buildFamilyMedicalItems, onRefreshChart]
  );

  const schedulePersonalAutoSave = useCallback(
    (nextSnapshot: { codes: Set<string>; otherDesc: string; notes: string }, delayMs: number) => {
      if (!canWritePatients) return;
      personalSnapshotRef.current = nextSnapshot;
      if (personalDebounceTimerRef.current) {
        clearTimeout(personalDebounceTimerRef.current);
      }
      setPersonalSavingStatus('saving');
      setPersonalSaveError(null);
      personalDebounceTimerRef.current = setTimeout(() => {
        personalDebounceTimerRef.current = null;
        void savePersonalMedicalHistory(nextSnapshot);
      }, delayMs);
    },
    [canWritePatients, savePersonalMedicalHistory]
  );

  const scheduleFamilyAutoSave = useCallback(
    (nextSnapshot: { codes: Set<string>; otherDesc: string; notes: string }, delayMs: number) => {
      if (!canWritePatients) return;
      familySnapshotRef.current = nextSnapshot;
      if (familyDebounceTimerRef.current) {
        clearTimeout(familyDebounceTimerRef.current);
      }
      setFamilySavingStatus('saving');
      setFamilySaveError(null);
      familyDebounceTimerRef.current = setTimeout(() => {
        familyDebounceTimerRef.current = null;
        void saveFamilyMedicalHistory(nextSnapshot);
      }, delayMs);
    },
    [canWritePatients, saveFamilyMedicalHistory]
  );

  const fetchPhysicalExam = useCallback(async () => {
    try {
      const [data] = await clinicService.getPatientPhysicalExam(patient.id);
      if (data) {
        const nextExam: OrganSystemsExamValues = {
          genSurveyId: data.genSurveyId || '1',
          genSurveyRemarks: data.genSurveyRemarks || '',
          skinId: data.skinId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.skinId,
          heentId: data.heentId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heentId,
          chestId: data.chestId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.chestId,
          heartId: data.heartId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heartId,
          abdomenId: data.abdomenId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.abdomenId,
          neuroId: data.neuroId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.neuroId,
          guId: data.guId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.guId,
          rectalId: data.rectalId || DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.rectalId,
          skinRemarks: data.skinRemarks || '',
          heentRemarks: data.heentRemarks || '',
          chestRemarks: data.chestRemarks || '',
          heartRemarks: data.heartRemarks || '',
          abdomenRemarks: data.abdomenRemarks || '',
          neuroRemarks: data.neuroRemarks || '',
          guRemarks: data.guRemarks || '',
          rectalRemarks: data.rectalRemarks || '',
        };
        setOrganSystems(nextExam);
        organSystemsRef.current = nextExam;
        if (data.id && data.id !== EMPTY_GUID) {
          setPhysicalExamLastSavedAt(data.updatedAt || data.createdAt || null);
        } else {
          setPhysicalExamLastSavedAt(null);
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }, [patient.id]);

  const fetchSurgicalHistories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, err] = await clinicService.getSurgicalHistories(patient.id);
      if (data) {
        setSurgicalHistories(data);
      } else if (err) {
        setError(err.message || 'Unable to load surgical procedures.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch surgical procedures.');
    } finally {
      setLoading(false);
    }
  }, [patient.id]);

  const loadClinicalHistoryAndReconcile = useCallback(async () => {
    setLoadingProblems(true);
    setLoadingAllergies(true);
    try {
      const [medResTuple, famResTuple, probsTuple, allergiesTuple] = await Promise.all([
        clinicService.getPastMedicalHistories(patient.id).catch(() => [null, null] as const),
        clinicService.getFamilyHistories(patient.id).catch(() => [null, null] as const),
        clinicService.getPatientProblems(patient.id).catch(() => [null, null] as const),
        clinicService.getPatientAllergies(patient.id).catch(() => [null, null] as const),
      ]);

      const medData = medResTuple?.[0];
      const famData = famResTuple?.[0];
      const loadedProblems = Array.isArray(probsTuple?.[0]) ? probsTuple[0] : [];
      const loadedAllergies = Array.isArray(allergiesTuple?.[0]) ? allergiesTuple[0] : [];

      setProblems(loadedProblems);
      setAllergies(loadedAllergies);

      // Resolve baseline Personal Medical History
      let baseCodes = new Set<string>();
      let baseOtherDesc = '';
      let basePersonalNotes = initialProfile?.medicalHistoryNotes || '';
      let latestPersonalTimestamp: string | null = medData?.updatedAt ?? null;

      if (medData && Array.isArray(medData.items)) {
        for (const item of medData.items) {
          const resolvedCode =
            item.philHealthMdiseaseCode?.trim() ||
            activeCatalogConditions.find(
              (c) => c.description.toLowerCase() === item.conditionTitle?.trim().toLowerCase()
            )?.code ||
            '998';
          if (isNoneHistoryEntry(resolvedCode, item.conditionTitle)) continue;
          baseCodes.add(resolvedCode);
          if (resolvedCode === '998') {
            const descCandidate = item.specificDescription || item.conditionTitle || '';
            if (!isNoneHistoryEntry(null, descCandidate)) {
              baseOtherDesc = mergeOtherConditionDescriptions(baseOtherDesc, [descCandidate]);
            }
          }
          if (item.clinicalNotes && !medData.personalMedicalHistoryNotes) {
            basePersonalNotes = item.clinicalNotes;
          }
          if (item.createdAt && (!latestPersonalTimestamp || item.createdAt > latestPersonalTimestamp)) {
            latestPersonalTimestamp = item.createdAt;
          }
        }
        if (medData.personalMedicalHistoryNotes) {
          basePersonalNotes = medData.personalMedicalHistoryNotes;
        }
      } else if (initialProfile?.medicalHistories?.length) {
        baseCodes = new Set(
          initialProfile.medicalHistories
            .filter((m) => !isNoneHistoryEntry(m.code, m.specificDesc))
            .map((m) => m.code)
        );
        const otherEntry = initialProfile.medicalHistories.find((m) => m.code === '998');
        if (otherEntry?.specificDesc && !isNoneHistoryEntry(null, otherEntry.specificDesc)) {
          baseOtherDesc = otherEntry.specificDesc;
        }
        if (initialProfile.lastUpdatedAt && !latestPersonalTimestamp) {
          latestPersonalTimestamp = initialProfile.lastUpdatedAt;
        }
      } else if (initialProfile === undefined && patient.chronicConditions) {
        baseCodes = parseChronicConditionsFallback(patient.chronicConditions);
      }

      // Reconcile Structured Problems & Documented Allergies into Personal Medical History
      const reconciled = reconcilePersonalHistoryWithClinicalRecords({
        selectedCodes: baseCodes,
        otherDesc: baseOtherDesc,
        problems: loadedProblems,
        allergies: loadedAllergies,
        catalogConditions: activeCatalogConditions,
      });

      setSelectedMedicalCodes(reconciled.codes);
      setMedicalOtherDesc(reconciled.otherDesc);
      setPersonalNotes(basePersonalNotes);
      setPersonalLastSavedAt(latestPersonalTimestamp);
      personalSnapshotRef.current = {
        codes: reconciled.codes,
        otherDesc: reconciled.otherDesc,
        notes: basePersonalNotes,
      };

      if (reconciled.changed && canWritePatients) {
        void savePersonalMedicalHistory({
          codes: reconciled.codes,
          otherDesc: reconciled.otherDesc,
          notes: basePersonalNotes,
        });
      }

      // Resolve Family Medical History
      let famCodes = new Set<string>();
      let famOther = '';
      let famNotesVal = initialProfile?.familyHistoryNotes || '';
      let latestFamilyTimestamp: string | null = famData?.updatedAt ?? null;

      if (famData && Array.isArray(famData.items)) {
        for (const item of famData.items) {
          const resolvedCode =
            item.philHealthMdiseaseCode?.trim() ||
            activeCatalogConditions.find(
              (c) => c.description.toLowerCase() === item.conditionTitle?.trim().toLowerCase()
            )?.code ||
            '998';
          if (isNoneHistoryEntry(resolvedCode, item.conditionTitle)) continue;
          famCodes.add(resolvedCode);
          if (resolvedCode === '998') {
            const descCandidate = item.specificDescription || item.conditionTitle || '';
            if (!isNoneHistoryEntry(null, descCandidate)) {
              famOther = mergeOtherConditionDescriptions(famOther, [descCandidate]);
            }
          }
          if (item.clinicalNotes && !famData.familyMedicalHistoryNotes) {
            famNotesVal = item.clinicalNotes;
          }
          if (item.createdAt && (!latestFamilyTimestamp || item.createdAt > latestFamilyTimestamp)) {
            latestFamilyTimestamp = item.createdAt;
          }
        }
        if (famData.familyMedicalHistoryNotes) {
          famNotesVal = famData.familyMedicalHistoryNotes;
        }
      } else if (initialProfile?.familyHistories?.length) {
        famCodes = new Set(
          initialProfile.familyHistories
            .filter((f) => !isNoneHistoryEntry(f.code, f.specificDesc))
            .map((f) => f.code)
        );
        const otherFam = initialProfile.familyHistories.find((f) => f.code === '998');
        if (otherFam?.specificDesc && !isNoneHistoryEntry(null, otherFam.specificDesc)) {
          famOther = otherFam.specificDesc;
        }
        if (initialProfile.lastUpdatedAt && !latestFamilyTimestamp) {
          latestFamilyTimestamp = initialProfile.lastUpdatedAt;
        }
      }

      setSelectedFamilyCodes(famCodes);
      setFamilyOtherDesc(famOther);
      setFamilyNotes(famNotesVal);
      setFamilyLastSavedAt(latestFamilyTimestamp);
      familySnapshotRef.current = {
        codes: famCodes,
        otherDesc: famOther,
        notes: famNotesVal,
      };
    } finally {
      setLoadingProblems(false);
      setLoadingAllergies(false);
    }
  }, [
    patient.id,
    patient.chronicConditions,
    initialProfile,
    activeCatalogConditions,
    canWritePatients,
    savePersonalMedicalHistory,
  ]);

  const isInitializedRef = useRef(false);
  const prevPatientIdRef = useRef(patient.id);

  useEffect(() => {
    const patientChanged = prevPatientIdRef.current !== patient.id;

    if (!isInitializedRef.current || patientChanged) {
      isInitializedRef.current = true;
      prevPatientIdRef.current = patient.id;

      if (patientChanged) {
        if (remarksDebounceTimerRef.current) {
          clearTimeout(remarksDebounceTimerRef.current);
          remarksDebounceTimerRef.current = null;
        }
        if (personalDebounceTimerRef.current) {
          clearTimeout(personalDebounceTimerRef.current);
          personalDebounceTimerRef.current = null;
        }
        if (familyDebounceTimerRef.current) {
          clearTimeout(familyDebounceTimerRef.current);
          familyDebounceTimerRef.current = null;
        }
        setOrganSystems({
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
        });
        setPhysicalExamSavingStatus('idle');
        setPhysicalExamLastSavedAt(null);
        setPersonalSavingStatus('idle');
        setPersonalSaveError(null);
        setFamilySavingStatus('idle');
        setFamilySaveError(null);
      }

      void fetchPhysicalExam();
      void loadClinicalHistoryAndReconcile();
      if (!initialSurgicalHistories || initialSurgicalHistories.length === 0) {
        void fetchSurgicalHistories();
      } else {
        setSurgicalHistories(initialSurgicalHistories);
      }
    }
  }, [
    patient.id,
    fetchPhysicalExam,
    loadClinicalHistoryAndReconcile,
    fetchSurgicalHistories,
    initialSurgicalHistories,
  ]);

  const savePhysicalExam = useCallback(
    async (valuesToSave: OrganSystemsExamValues) => {
      if (!canWritePatients) return;
      setPhysicalExamSavingStatus('saving');
      setPhysicalExamError(null);
      try {
        const [savedExam, err] = await clinicService.updatePatientPhysicalExam(patient.id, {
          genSurveyId: valuesToSave.genSurveyId,
          genSurveyRemarks: valuesToSave.genSurveyRemarks,
          skinId: valuesToSave.skinId,
          skinRemarks: valuesToSave.skinRemarks,
          heentId: valuesToSave.heentId,
          heentRemarks: valuesToSave.heentRemarks,
          chestId: valuesToSave.chestId,
          chestRemarks: valuesToSave.chestRemarks,
          heartId: valuesToSave.heartId,
          heartRemarks: valuesToSave.heartRemarks,
          abdomenId: valuesToSave.abdomenId,
          abdomenRemarks: valuesToSave.abdomenRemarks,
          neuroId: valuesToSave.neuroId,
          neuroRemarks: valuesToSave.neuroRemarks,
          guId: valuesToSave.guId,
          guRemarks: valuesToSave.guRemarks,
          rectalId: valuesToSave.rectalId,
          rectalRemarks: valuesToSave.rectalRemarks,
        });

        if (err) {
          setPhysicalExamSavingStatus('error');
          setPhysicalExamError(err.message || 'Failed to save physical exam findings.');
        } else {
          setPhysicalExamLastSavedAt(
            savedExam?.updatedAt || savedExam?.createdAt || new Date().toISOString()
          );
          setPhysicalExamSavingStatus('saved');
          onRefreshChart?.();
        }
      } catch (e: any) {
        setPhysicalExamSavingStatus('error');
        setPhysicalExamError(e.message || 'Failed to save physical exam findings.');
      }
    },
    [patient.id, onRefreshChart, canWritePatients]
  );

  const handleOrganSystemOptionChange = (key: OrganSystemDef['key'], code: string) => {
    const updated = { ...organSystemsRef.current, [key]: code };
    setOrganSystems(updated);
    organSystemsRef.current = updated;
    if (remarksDebounceTimerRef.current) {
      clearTimeout(remarksDebounceTimerRef.current);
      remarksDebounceTimerRef.current = null;
    }
    void savePhysicalExam(updated);
  };

  const handleSetAllNormal = () => {
    const updated: OrganSystemsExamValues = {
      ...organSystemsRef.current,
      ...DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
      skinRemarks: '',
      heentRemarks: '',
      chestRemarks: '',
      heartRemarks: '',
      abdomenRemarks: '',
      neuroRemarks: '',
      guRemarks: '',
      rectalRemarks: '',
    };
    setOrganSystems(updated);
    organSystemsRef.current = updated;
    if (remarksDebounceTimerRef.current) {
      clearTimeout(remarksDebounceTimerRef.current);
      remarksDebounceTimerRef.current = null;
    }
    void savePhysicalExam(updated);
  };

  const handleOrganSystemRemarksChange = (remarksKey: keyof OrganSystemsExamValues, text: string) => {
    const updated = { ...organSystemsRef.current, [remarksKey]: text };
    setOrganSystems(updated);
    organSystemsRef.current = updated;

    if (remarksDebounceTimerRef.current) {
      clearTimeout(remarksDebounceTimerRef.current);
    }
    setPhysicalExamSavingStatus('saving');
    remarksDebounceTimerRef.current = setTimeout(() => {
      void savePhysicalExam(updated);
      remarksDebounceTimerRef.current = null;
    }, 600);
  };

  // Flush pending auto-saves on unmount
  useEffect(() => {
    return () => {
      if (remarksDebounceTimerRef.current) {
        clearTimeout(remarksDebounceTimerRef.current);
        remarksDebounceTimerRef.current = null;
        clinicService
          .updatePatientPhysicalExam(patient.id, {
            genSurveyId: organSystemsRef.current.genSurveyId,
            genSurveyRemarks: organSystemsRef.current.genSurveyRemarks,
            skinId: organSystemsRef.current.skinId,
            skinRemarks: organSystemsRef.current.skinRemarks,
            heentId: organSystemsRef.current.heentId,
            heentRemarks: organSystemsRef.current.heentRemarks,
            chestId: organSystemsRef.current.chestId,
            chestRemarks: organSystemsRef.current.chestRemarks,
            heartId: organSystemsRef.current.heartId,
            heartRemarks: organSystemsRef.current.heartRemarks,
            abdomenId: organSystemsRef.current.abdomenId,
            abdomenRemarks: organSystemsRef.current.abdomenRemarks,
            neuroId: organSystemsRef.current.neuroId,
            neuroRemarks: organSystemsRef.current.neuroRemarks,
            guId: organSystemsRef.current.guId,
            guRemarks: organSystemsRef.current.guRemarks,
            rectalId: organSystemsRef.current.rectalId,
            rectalRemarks: organSystemsRef.current.rectalRemarks,
          })
          .catch(() => {});
      }
      if (personalDebounceTimerRef.current) {
        clearTimeout(personalDebounceTimerRef.current);
        personalDebounceTimerRef.current = null;
        const snap = personalSnapshotRef.current;
        const cleanNotes = snap.notes.trim() || null;
        clinicService
          .savePastMedicalHistories(patient.id, {
            items: buildPersonalMedicalItems(snap.codes, snap.otherDesc, snap.notes),
            notes: cleanNotes,
          })
          .catch(() => {});
      }
      if (familyDebounceTimerRef.current) {
        clearTimeout(familyDebounceTimerRef.current);
        familyDebounceTimerRef.current = null;
        const snap = familySnapshotRef.current;
        const cleanNotes = snap.notes.trim() || null;
        clinicService
          .saveFamilyHistories(patient.id, {
            items: buildFamilyMedicalItems(snap.codes, snap.otherDesc, snap.notes),
            notes: cleanNotes,
          })
          .catch(() => {});
      }
    };
  }, [patient.id, buildPersonalMedicalItems, buildFamilyMedicalItems]);

  const toggleMedicalCondition = (code: string) => {
    if (!canWritePatients) return;
    const prev = personalSnapshotRef.current;

    // Prevent untoggling conditions linked to active Structured Problems or active documented allergies
    if (prev.codes.has(code)) {
      const lockReason = lockedConditionReasons.get(code);
      if (lockReason) {
        notify.info(lockReason);
        return;
      }
    }

    const nextCodes = new Set(prev.codes);
    let nextOtherDesc = prev.otherDesc;

    if (nextCodes.has(code)) {
      nextCodes.delete(code);
      if (code === '998') {
        nextOtherDesc = '';
      }
    } else {
      nextCodes.add(code);
    }

    setSelectedMedicalCodes(nextCodes);
    setMedicalOtherDesc(nextOtherDesc);
    schedulePersonalAutoSave(
      { codes: nextCodes, otherDesc: nextOtherDesc, notes: prev.notes },
      250
    );
  };

  const handleMedicalOtherDescChange = (text: string) => {
    if (!canWritePatients) return;
    setMedicalOtherDesc(text);
    schedulePersonalAutoSave(
      {
        codes: personalSnapshotRef.current.codes,
        otherDesc: text,
        notes: personalSnapshotRef.current.notes,
      },
      600
    );
  };

  const handlePersonalNotesChange = (text: string) => {
    if (!canWritePatients) return;
    setPersonalNotes(text);
    schedulePersonalAutoSave(
      {
        codes: personalSnapshotRef.current.codes,
        otherDesc: personalSnapshotRef.current.otherDesc,
        notes: text,
      },
      600
    );
  };

  const toggleFamilyCondition = (code: string) => {
    if (!canWritePatients) return;
    const prev = familySnapshotRef.current;
    const nextCodes = new Set(prev.codes);
    let nextOtherDesc = prev.otherDesc;

    if (nextCodes.has(code)) {
      nextCodes.delete(code);
      if (code === '998') {
        nextOtherDesc = '';
      }
    } else {
      nextCodes.add(code);
    }

    setSelectedFamilyCodes(nextCodes);
    setFamilyOtherDesc(nextOtherDesc);
    scheduleFamilyAutoSave(
      { codes: nextCodes, otherDesc: nextOtherDesc, notes: prev.notes },
      250
    );
  };

  const handleFamilyOtherDescChange = (text: string) => {
    if (!canWritePatients) return;
    setFamilyOtherDesc(text);
    scheduleFamilyAutoSave(
      {
        codes: familySnapshotRef.current.codes,
        otherDesc: text,
        notes: familySnapshotRef.current.notes,
      },
      600
    );
  };

  const handleFamilyNotesChange = (text: string) => {
    if (!canWritePatients) return;
    setFamilyNotes(text);
    scheduleFamilyAutoSave(
      {
        codes: familySnapshotRef.current.codes,
        otherDesc: familySnapshotRef.current.otherDesc,
        notes: text,
      },
      600
    );
  };

  // Surgical Modals
  const openAddModal = () => {
    if (!canWritePatients) return;
    setEditingItem(null);
    setProcedureName('');
    setSurgeryDate(new Date().toISOString().split('T')[0]);
    setHospitalName('');
    setFindings('');
    setComplications('');
    setRemarks('');
    setFormError(null);
    setModalVisible(true);
  };

  const openEditModal = (item: PatientSurgicalHistory) => {
    if (!canWritePatients) return;
    setEditingItem(item);
    setProcedureName(item.procedureName);
    setSurgeryDate(item.surgeryDate ? item.surgeryDate.split('T')[0] : '');
    setHospitalName(item.hospitalName || '');
    setFindings(item.findings || '');
    setComplications(item.complications || '');
    setRemarks(item.remarks || '');
    setFormError(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!canWritePatients) {
      Alert.alert('Insufficient Permissions', "Required permission 'patients:write' is not granted for this clinic role.");
      return;
    }
    if (!procedureName.trim()) {
      setFormError('Procedure name is required.');
      return;
    }
    if (!surgeryDate.trim()) {
      setFormError('Surgery date is required (YYYY-MM-DD).');
      return;
    }
    const surgeryDateValidation = validateDateString(surgeryDate, { boundaryMode: 'pastOrToday' });
    if (!surgeryDateValidation.isValid) {
      setFormError(surgeryDateValidation.errorMessage || 'Invalid surgery date (must be past or today).');
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload: UpsertPatientSurgicalHistoryPayload = {
      procedureName: procedureName.trim(),
      surgeryDate: surgeryDate.trim(),
      hospitalName: hospitalName.trim() || undefined,
      findings: findings.trim() || undefined,
      complications: complications.trim() || undefined,
      remarks: remarks.trim() || undefined,
    };

    try {
      if (editingItem) {
        const [updated, err] = await clinicService.updateSurgicalHistory(
          patient.id,
          editingItem.id,
          payload
        );
        if (err) {
          setFormError(err.message || 'Failed to update surgical procedure.');
          setSaving(false);
          return;
        }
        if (updated) {
          setSurgicalHistories((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        }
      } else {
        const [created, err] = await clinicService.addSurgicalHistory(patient.id, payload);
        if (err) {
          setFormError(err.message || 'Failed to record surgical procedure.');
          setSaving(false);
          return;
        }
        if (created) {
          setSurgicalHistories((prev) => [created, ...prev]);
        }
      }
      setModalVisible(false);
      onRefreshChart?.();
    } catch (e: any) {
      setFormError(e.message || 'An unexpected error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: PatientSurgicalHistory) => {
    if (!canWritePatients) return;
    Alert.alert(
      'Delete Surgical Procedure',
      `Are you sure you want to remove "${item.procedureName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              const [, err] = await clinicService.deleteSurgicalHistory(patient.id, item.id);
              if (err) {
                Alert.alert('Error', err.message || 'Failed to delete procedure.');
              } else {
                setSurgicalHistories((prev) => prev.filter((p) => p.id !== item.id));
                onRefreshChart?.();
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Unexpected error deleting procedure.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  // Problem Handling (auto-syncs to Personal Medical History)
  const handleSaveProblem = async () => {
    if (!canWritePatients) {
      Alert.alert('Insufficient Permissions', "Required permission 'patients:write' is not granted for this clinic role.");
      return;
    }
    if (!problemIcd10.trim()) {
      setProblemFormError('Diagnosis selection is required.');
      return;
    }
    if (!problemTitle.trim()) {
      setProblemFormError('Problem diagnosis description is required.');
      return;
    }
    if (problemOnsetDate && problemOnsetDate.trim()) {
      const onsetValidation = validateDateString(problemOnsetDate, { boundaryMode: 'pastOrToday' });
      if (!onsetValidation.isValid) {
        setProblemFormError(onsetValidation.errorMessage || 'Invalid onset date (must be past or today).');
        return;
      }
    }

    setSavingProblem(true);
    setProblemFormError(null);

    const match = matchProblemToPersonalHistoryCondition(
      { icd10Code: problemIcd10.trim().toUpperCase(), problemTitle: problemTitle.trim() },
      activeCatalogConditions
    );

    const payload: CreatePatientProblemPayload = {
      icd10Code: problemIcd10.trim().toUpperCase(),
      problemTitle: problemTitle.trim(),
      philHealthMdiseaseCode: match.matchedCode,
      status: problemStatus,
      severity: problemSeverity,
      isChronicNcd: problemIsChronic,
      onsetDate: problemOnsetDate ? problemOnsetDate.trim() : undefined,
      clinicalNotes: problemNotes.trim() || undefined,
    };

    try {
      const [created, err] = await clinicService.createPatientProblem(patient.id, payload);
      if (err) {
        setProblemFormError(err.message || 'Failed to record problem.');
      } else if (created) {
        setProblems((prev) => [created, ...prev]);
        setProblemModalVisible(false);

        // Auto-add matching condition (or toggle Others + append specific description) in Personal Medical History
        const currentSnap = personalSnapshotRef.current;
        const reconciled = reconcilePersonalHistoryWithClinicalRecords({
          selectedCodes: currentSnap.codes,
          otherDesc: currentSnap.otherDesc,
          problems: [created],
          allergies: [],
          catalogConditions: activeCatalogConditions,
        });

        if (reconciled.changed) {
          setSelectedMedicalCodes(reconciled.codes);
          setMedicalOtherDesc(reconciled.otherDesc);
          const nextSnap = {
            codes: reconciled.codes,
            otherDesc: reconciled.otherDesc,
            notes: currentSnap.notes,
          };
          personalSnapshotRef.current = nextSnap;
          if (personalDebounceTimerRef.current) {
            clearTimeout(personalDebounceTimerRef.current);
            personalDebounceTimerRef.current = null;
          }
          void savePersonalMedicalHistory(nextSnap);
        } else {
          onRefreshChart?.();
        }
      }
    } catch (e: any) {
      setProblemFormError(e.message || 'Error recording problem.');
    } finally {
      setSavingProblem(false);
    }
  };

  const handleToggleProblemStatus = async (item: PatientProblemRecord) => {
    if (!canWritePatients) return;
    const nextStatus = item.status === 'Active' ? 'Resolved' : 'Active';
    const resolvedDate = nextStatus === 'Resolved' ? new Date().toISOString().split('T')[0] : undefined;

    try {
      const [updated, err] = await clinicService.updatePatientProblemStatus(
        patient.id,
        item.id,
        nextStatus,
        resolvedDate
      );
      if (err) {
        Alert.alert('Error', err.message || 'Failed to update problem status.');
      } else if (updated) {
        setProblems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        onRefreshChart?.();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unexpected error.');
    }
  };

  // Allergy Handling (via StructuredAllergyIntakeModal; auto-toggles "Allergy" in Personal Medical History)
  const handleAddStructuredAllergy = async (newAllergy: CreateAllergyRequest): Promise<boolean> => {
    if (!canWritePatients) {
      Alert.alert('Insufficient Permissions', "Required permission 'patients:write' is not granted for this clinic role.");
      return false;
    }

    setSavingAllergy(true);
    setAllergyFormError(null);

    const payload: CreatePatientAllergyPayload = {
      category: newAllergy.category,
      allergen: newAllergy.allergen.trim(),
      allergenDrugCode: newAllergy.allergenDrugCode?.trim() || undefined,
      severity: newAllergy.severity,
      reactionManifestation: newAllergy.reactionManifestation?.trim() || undefined,
      isAnaphylactic: Boolean(newAllergy.isAnaphylactic || newAllergy.severity === 'LifeThreatening'),
      onsetDate: newAllergy.onsetDate?.trim() || undefined,
      notes: newAllergy.notes?.trim() || undefined,
    };

    try {
      const [created, err] = await clinicService.createPatientAllergy(patient.id, payload);
      if (err) {
        setAllergyFormError(err.message || 'Failed to record allergy.');
        return false;
      }
      if (created) {
        setAllergies((prev) => [created, ...prev]);

        // Any documented allergy toggles "Allergy" ('001') in Personal Medical History
        const currentSnap = personalSnapshotRef.current;
        if (!currentSnap.codes.has('001')) {
          const nextCodes = new Set(currentSnap.codes);
          nextCodes.add('001');
          setSelectedMedicalCodes(nextCodes);
          const nextSnap = {
            codes: nextCodes,
            otherDesc: currentSnap.otherDesc,
            notes: currentSnap.notes,
          };
          personalSnapshotRef.current = nextSnap;
          if (personalDebounceTimerRef.current) {
            clearTimeout(personalDebounceTimerRef.current);
            personalDebounceTimerRef.current = null;
          }
          void savePersonalMedicalHistory(nextSnap);
        } else {
          onRefreshChart?.();
        }
      }
      return true;
    } catch (e: any) {
      setAllergyFormError(e.message || 'Error recording allergy.');
      return false;
    } finally {
      setSavingAllergy(false);
    }
  };

  const handleDeleteAllergy = (item: PatientAllergyRecord) => {
    if (!canWritePatients) return;
    Alert.alert(
      'Remove Allergy',
      `Are you sure you want to remove documented allergy "${item.allergen}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const [, err] = await clinicService.deletePatientAllergy(patient.id, item.id);
              if (err) {
                Alert.alert('Error', err.message || 'Failed to remove allergy.');
              } else {
                setAllergies((prev) => prev.filter((a) => a.id !== item.id));
                onRefreshChart?.();
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Unexpected error.');
            }
          },
        },
      ]
    );
  };

  const personalLastSavedBadgeLabel = formatLastSavedBadge(personalLastSavedAt);
  const familyLastSavedBadgeLabel = formatLastSavedBadge(familyLastSavedAt);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!canWritePatients ? (
        <View style={styles.readOnlyBanner} accessibilityRole="alert">
          <Icon name="lock" size={theme.sizes.iconSm} color={theme.colors.warningText} />
          <ThemedText variant="small" color={theme.colors.warningText} style={{ flex: 1 }}>
            Read-only mode: &apos;patients:write&apos; permission is required to save surgical &amp; clinical profile changes.
          </ThemedText>
        </View>
      ) : null}

      {/* SECTION 1: Structured Problem List */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="activity" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Structured Problem List</ThemedText>
          </View>
          <Button
            title="Add Problem"
            variant="primary"
            size="sm"
            icon="plus"
            disabled={!canWritePatients}
            onPress={() => {
              setProblemIcd10('');
              setProblemTitle('');
              setProblemStatus('Active');
              setProblemSeverity('Moderate');
              setProblemIsChronic(false);
              setProblemOnsetDate(new Date().toISOString().split('T')[0]);
              setProblemNotes('');
              setProblemFormError(null);
              setProblemModalVisible(true);
            }}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Active and resolved clinical diagnoses and chronic conditions.
        </ThemedText>

        {loadingProblems ? (
          <SkeletonList rows={2} />
        ) : problems.length === 0 ? (
          <View style={styles.emptyNoticeStrip}>
            <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            <ThemedText variant="small" color={theme.colors.textMuted}>
              No structured problems documented yet.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.proceduresList}>
            {problems.map((prob) => (
              <View key={prob.id} style={styles.procedureCard}>
                <View style={styles.procedureHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.badgeRow}>
                      <Badge
                        label={prob.status}
                        variant={prob.status === 'Active' ? 'primary' : 'neutral'}
                      />
                      {prob.isChronicNcd ? (
                        <Badge label="Chronic NCD" variant="warning" />
                      ) : null}
                    </View>
                    <ThemedText variant="bodyBold" color={theme.colors.text} style={{ marginTop: theme.spacing.xs }}>
                      {prob.problemTitle}
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Onset: {formatClinicalCalendarDate(prob.onsetDate)}
                      {prob.resolvedDate ? ` • Resolved: ${formatClinicalCalendarDate(prob.resolvedDate)}` : ''}
                    </ThemedText>
                  </View>
                  <Button
                    title={prob.status === 'Active' ? 'Mark Resolved' : 'Reactivate'}
                    variant="outline"
                    size="sm"
                    disabled={!canWritePatients}
                    onPress={() => handleToggleProblemStatus(prob)}
                  />
                </View>
                {prob.clinicalNotes ? (
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {prob.clinicalNotes}
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* SECTION 2: Structured Allergies Registry */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
            <ThemedText variant="h3">Documented Allergies &amp; Sensitivities</ThemedText>
          </View>
          <Button
            title="Add Allergy"
            variant="outline"
            size="sm"
            icon="plus"
            disabled={!canWritePatients}
            onPress={() => {
              setAllergyFormError(null);
              setAllergyModalVisible(true);
            }}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Drug, food, and environmental allergies feeding real-time clinical allergy alerts.
        </ThemedText>

        {loadingAllergies ? (
          <SkeletonList rows={2} />
        ) : allergies.length === 0 ? (
          <View style={styles.emptyNoticeStrip}>
            <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.successText} />
            <ThemedText variant="small" color={theme.colors.successText}>
              No known allergies documented (NKDA).
            </ThemedText>
          </View>
        ) : (
          <View style={styles.proceduresList}>
            {allergies.map((allergy) => (
              <View key={allergy.id} style={styles.procedureCard}>
                <View style={styles.procedureHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.badgeRow}>
                      {allergy.category ? (
                        <Badge
                          label={allergy.category}
                          variant={
                            allergy.category === 'Medication'
                              ? 'primary'
                              : allergy.category === 'Food'
                                ? 'warning'
                                : allergy.category === 'Environmental'
                                  ? 'info'
                                  : allergy.category === 'Biologic'
                                    ? 'purple'
                                    : 'neutral'
                          }
                        />
                      ) : null}
                      {allergy.severity ? (
                        <Badge
                          label={humanizeAllergySeverity(allergy.severity)}
                          variant={
                            allergy.isAnaphylactic || allergy.severity === 'LifeThreatening'
                              ? 'emergency'
                              : allergy.severity === 'Severe'
                                ? 'urgent'
                                : allergy.severity === 'Moderate'
                                  ? 'warning'
                                  : 'info'
                          }
                        />
                      ) : null}
                      {allergy.isAnaphylactic ? (
                        <Badge label="Anaphylaxis Risk" variant="emergency" />
                      ) : null}
                    </View>
                    <ThemedText variant="bodyBold" color={theme.colors.text} style={{ marginTop: theme.spacing.xs }}>
                      {allergy.allergen}
                    </ThemedText>
                    {allergy.reactionManifestation ? (
                      <ThemedText variant="small" color={theme.colors.textSecondary}>
                        Reaction: {allergy.reactionManifestation}
                      </ThemedText>
                    ) : null}
                    {allergy.onsetDate ? (
                      <ThemedText variant="small" color={theme.colors.textSecondary}>
                        Onset: {formatClinicDate(allergy.onsetDate, { dateFormat, timeZoneId })}
                      </ThemedText>
                    ) : null}
                    {allergy.notes ? (
                      <ThemedText variant="small" color={theme.colors.textMuted}>
                        {allergy.notes}
                      </ThemedText>
                    ) : null}
                  </View>
                  {canWritePatients ? (
                    <Button
                      variant="dangerGhost"
                      size="xs"
                      icon="trash"
                      iconOnly
                      accessibilityLabel="Delete allergy"
                      onPress={() => handleDeleteAllergy(allergy)}
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* SECTION 3: Interactive Personal Medical History (Auto-Saved) */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="check" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Personal Medical History</ThemedText>
            {personalSavingStatus === 'saving' ? (
              <Badge label="Saving..." variant="warning" size="sm" icon="clock" />
            ) : personalSavingStatus === 'error' ? (
              <Badge label="Autosave error" variant="emergency" size="sm" icon="alertCircle" />
            ) : personalLastSavedBadgeLabel ? (
              <Badge label={personalLastSavedBadgeLabel} variant="routine" size="sm" icon="check" />
            ) : null}
          </View>
          <Badge
            label={`${selectedMedicalCodes.size} Selected`}
            variant={selectedMedicalCodes.size > 0 ? 'primary' : 'outline'}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Documented personal past and chronic medical conditions.
        </ThemedText>

        {personalSaveError ? (
          <View style={styles.formErrorBanner}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={{ flex: 1 }}>
              {personalSaveError}
            </ThemedText>
            <Button
              title="Retry"
              variant="outline"
              size="sm"
              onPress={() => void savePersonalMedicalHistory()}
            />
          </View>
        ) : null}

        <View style={styles.chipsWrap}>
          {availableConditions.map((cond) => {
            const isSelected = selectedMedicalCodes.has(cond.code);
            const lockReason = lockedConditionReasons.get(cond.code);
            const isLocked = Boolean(lockReason && isSelected);

            return (
              <Pressable
                key={`personal-${cond.code}`}
                disabled={!canWritePatients}
                onPress={() => toggleMedicalCondition(cond.code)}
                accessibilityRole="button"
                accessibilityLabel={
                  isLocked
                    ? `Toggle personal ${cond.description} (locked)`
                    : `Toggle personal ${cond.description}`
                }
                accessibilityHint={isLocked ? lockReason : undefined}
                accessibilityState={{ selected: isSelected, disabled: !canWritePatients }}
                {...(Platform.OS === 'web' && isLocked && lockReason
                  ? ({ title: lockReason } as Record<string, unknown>)
                  : {})}
                style={[
                  styles.toggleChip,
                  isSelected && styles.toggleChip_active,
                  isLocked && styles.toggleChip_locked,
                ]}
              >
                <Icon
                  name={isSelected ? 'check' : 'plus'}
                  size={theme.fontSizes.sm}
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                />
                <ThemedText
                  variant="smallBold"
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                >
                  {cond.description}
                </ThemedText>
                {isLocked ? (
                  <Icon
                    name="lock"
                    size={theme.fontSizes.xs}
                    color={theme.colors.primaryDark}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {selectedMedicalCodes.has('998') ? (
          <View style={styles.otherInputRow}>
            <Input
              label="Specific Description for Other Medical Condition *"
              value={medicalOtherDesc}
              editable={canWritePatients}
              onChangeText={handleMedicalOtherDescChange}
              placeholder="e.g. Systemic Lupus Erythematosus, Chronic Kidney Disease"
            />
          </View>
        ) : null}

        <View style={styles.notesRow}>
          <Input
            label="Personal Medical History Notes"
            value={personalNotes}
            editable={canWritePatients}
            onChangeText={handlePersonalNotesChange}
            placeholder="Clinical notes, disease severity, onset context..."
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      {/* SECTION 4: Interactive Family Medical History (Auto-Saved) */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="heartPulse" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Family Medical History</ThemedText>
            {familySavingStatus === 'saving' ? (
              <Badge label="Saving..." variant="warning" size="sm" icon="clock" />
            ) : familySavingStatus === 'error' ? (
              <Badge label="Autosave error" variant="emergency" size="sm" icon="alertCircle" />
            ) : familyLastSavedBadgeLabel ? (
              <Badge label={familyLastSavedBadgeLabel} variant="routine" size="sm" icon="check" />
            ) : null}
          </View>
          <Badge
            label={`${selectedFamilyCodes.size} Selected`}
            variant={selectedFamilyCodes.size > 0 ? 'primary' : 'outline'}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Documented hereditary and familial health risk factors.
        </ThemedText>

        {familySaveError ? (
          <View style={styles.formErrorBanner}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={{ flex: 1 }}>
              {familySaveError}
            </ThemedText>
            <Button
              title="Retry"
              variant="outline"
              size="sm"
              onPress={() => void saveFamilyMedicalHistory()}
            />
          </View>
        ) : null}

        <View style={styles.chipsWrap}>
          {availableConditions.map((cond) => {
            const isSelected = selectedFamilyCodes.has(cond.code);
            return (
              <Pressable
                key={`family-${cond.code}`}
                disabled={!canWritePatients}
                onPress={() => toggleFamilyCondition(cond.code)}
                accessibilityRole="button"
                accessibilityLabel={`Toggle family ${cond.description}`}
                accessibilityState={{ selected: isSelected, disabled: !canWritePatients }}
                style={[
                  styles.toggleChip,
                  isSelected && styles.toggleChip_active,
                ]}
              >
                <Icon
                  name={isSelected ? 'check' : 'plus'}
                  size={theme.fontSizes.sm}
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                />
                <ThemedText
                  variant="smallBold"
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                >
                  {cond.description}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {selectedFamilyCodes.has('998') ? (
          <View style={styles.otherInputRow}>
            <Input
              label="Specific Description for Other Family Condition *"
              value={familyOtherDesc}
              editable={canWritePatients}
              onChangeText={handleFamilyOtherDescChange}
              placeholder="e.g. Familial Hypercholesterolemia, Polycystic Kidney Disease"
            />
          </View>
        ) : null}

        <View style={styles.notesRow}>
          <Input
            label="Family Medical History Notes"
            value={familyNotes}
            editable={canWritePatients}
            onChangeText={handleFamilyNotesChange}
            placeholder="Pedigree notes, affected 1st-degree relatives, age of onset..."
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      {/* SECTION 5: Interactive Organ Systems Examination */}
      <View style={styles.sectionCard}>
        <OrganSystemsExamSection
          values={organSystems}
          onChange={handleOrganSystemOptionChange}
          onRemarksChange={handleOrganSystemRemarksChange}
          onSetAllNormal={handleSetAllNormal}
          disabled={!canWritePatients}
          savingStatus={physicalExamSavingStatus}
          lastSavedAt={physicalExamLastSavedAt}
        />
        {physicalExamError ? (
          <View style={styles.formErrorBanner}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={{ flex: 1 }}>
              {physicalExamError}
            </ThemedText>
            <Button
              title="Retry"
              variant="outline"
              size="sm"
              onPress={() => void savePhysicalExam(organSystemsRef.current)}
            />
          </View>
        ) : null}
      </View>

      {/* SECTION 6: Surgical Procedures History */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="file" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Surgical Procedures History</ThemedText>
          </View>
          <Button
            title="Add Procedure"
            variant="primary"
            size="sm"
            icon="plus"
            disabled={!canWritePatients}
            onPress={openAddModal}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Documented past surgeries, intraoperative findings, and postoperative complications.
        </ThemedText>

        {loading ? (
          <SkeletonList rows={3} />
        ) : error ? (
          <ErrorState
            title="Unable to load surgical history"
            message={error}
            onRetry={fetchSurgicalHistories}
          />
        ) : surgicalHistories.length === 0 ? (
          <View style={styles.statutoryEmptyBanner}>
            <View style={styles.statutoryBannerHeader}>
              <Icon name="info" size={theme.sizes.iconMd} color={theme.colors.infoText} />
              <ThemedText variant="bodyBold" color={theme.colors.infoText}>
                No Past Surgical Procedures Documented
              </ThemedText>
            </View>
            <ThemedText variant="small" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.xs }}>
              No past surgical operations have been recorded for this patient.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.proceduresList}>
            {surgicalHistories.map((item) => (
              <View key={item.id} style={styles.procedureCard}>
                <View style={styles.procedureHeader}>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {item.procedureName}
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Date: {formatClinicalCalendarDate(item.surgeryDate)}
                      {item.hospitalName ? ` • Facility: ${item.hospitalName}` : ''}
                    </ThemedText>
                  </View>
                  {canWritePatients ? (
                    <View style={styles.cardActions}>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon="edit"
                        iconOnly
                        accessibilityLabel="Edit procedure"
                        onPress={() => openEditModal(item)}
                      />
                      <Button
                        variant="dangerGhost"
                        size="xs"
                        icon="trash"
                        iconOnly
                        accessibilityLabel="Delete procedure"
                        loading={deletingId === item.id}
                        disabled={deletingId === item.id}
                        onPress={() => handleDelete(item)}
                      />
                    </View>
                  ) : null}
                </View>

                {item.findings ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.textMuted}>Findings: </ThemedText>
                    <ThemedText variant="small" color={theme.colors.text}>{item.findings}</ThemedText>
                  </View>
                ) : null}

                {item.complications ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.emergencyText}>Complications: </ThemedText>
                    <ThemedText variant="small" color={theme.colors.emergencyText}>{item.complications}</ThemedText>
                  </View>
                ) : null}

                {item.remarks ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.textMuted}>Remarks: </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>{item.remarks}</ThemedText>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Modal for Add / Edit Surgical Procedure */}
      <Modal
        visible={modalVisible}
        onClose={() => !saving && setModalVisible(false)}
        title={editingItem ? 'Edit Surgical Procedure' : 'Record Surgical Procedure'}
      >
        <ScrollView contentContainerStyle={styles.modalFormContent}>
          {formError ? (
            <View style={styles.formErrorBanner}>
              <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              <ThemedText variant="small" color={theme.colors.emergencyText}>
                {formError}
              </ThemedText>
            </View>
          ) : null}

          <Input
            label="Procedure Name *"
            value={procedureName}
            onChangeText={setProcedureName}
            placeholder="e.g. Appendectomy, Cesarean Section"
          />

          <ValidatedDateInput
            label="Surgery Date (YYYY-MM-DD)"
            required
            value={surgeryDate}
            onChangeText={setSurgeryDate}
            boundaryMode="pastOrToday"
            placeholder="YYYY-MM-DD"
          />

          <Input
            label="Hospital / Medical Facility"
            value={hospitalName}
            onChangeText={setHospitalName}
            placeholder="e.g. Philippine General Hospital"
          />

          <Input
            label="Intraoperative Findings"
            value={findings}
            onChangeText={setFindings}
            placeholder="Observations, pathology findings"
            multiline
            numberOfLines={2}
          />

          <Input
            label="Complications (if any)"
            value={complications}
            onChangeText={setComplications}
            placeholder="Post-op infection, bleeding, etc."
          />

          <Input
            label="Clinical Remarks"
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Additional notes"
            multiline
            numberOfLines={2}
          />

          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              disabled={saving}
              onPress={() => setModalVisible(false)}
            />
            <Button
              title={saving ? 'Saving…' : editingItem ? 'Save Changes' : 'Record Procedure'}
              variant="primary"
              size="md"
              loading={saving}
              disabled={saving}
              onPress={handleSave}
            />
          </View>
        </ScrollView>
      </Modal>

      {/* Modal for Add Structured Problem */}
      <Modal
        visible={problemModalVisible}
        onClose={() => !savingProblem && setProblemModalVisible(false)}
        title="Record Clinical Problem"
      >
        <ScrollView contentContainerStyle={styles.modalFormContent}>
          {problemFormError ? (
            <View style={styles.formErrorBanner}>
              <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              <ThemedText variant="small" color={theme.colors.emergencyText}>
                {problemFormError}
              </ThemedText>
            </View>
          ) : null}

          <Icd10AutocompleteInput
            selectedCode={problemIcd10}
            selectedTitle={problemTitle}
            onSelect={(code, desc) => {
              setProblemIcd10(code);
              setProblemTitle(desc);
              setProblemFormError(null);
            }}
            onClear={() => {
              setProblemIcd10('');
              setProblemTitle('');
            }}
            onTitleChange={(title) => {
              setProblemTitle(title);
            }}
            required
          />

          <ValidatedDateInput
            label="Onset Date (YYYY-MM-DD)"
            value={problemOnsetDate}
            onChangeText={setProblemOnsetDate}
            boundaryMode="pastOrToday"
            placeholder="YYYY-MM-DD"
          />

          <View style={styles.modalFieldGroup}>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              Condition Classification
            </ThemedText>
            <View style={styles.chipsWrap}>
              <Pressable
                onPress={() => setProblemIsChronic((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel="Toggle Chronic NCD"
                accessibilityState={{ selected: problemIsChronic }}
                style={[
                  styles.toggleChip,
                  problemIsChronic && styles.toggleChip_active,
                ]}
              >
                <Icon
                  name={problemIsChronic ? 'check' : 'plus'}
                  size={theme.fontSizes.sm}
                  color={problemIsChronic ? theme.colors.primaryDark : theme.colors.textSecondary}
                />
                <ThemedText
                  variant="smallBold"
                  color={problemIsChronic ? theme.colors.primaryDark : theme.colors.textSecondary}
                >
                  Chronic Condition / NCD
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <Input
            label="Clinical Notes / Findings"
            value={problemNotes}
            onChangeText={setProblemNotes}
            placeholder="Pertinent findings, current management"
            multiline
            numberOfLines={2}
          />

          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              disabled={savingProblem}
              onPress={() => setProblemModalVisible(false)}
            />
            <Button
              title={savingProblem ? 'Saving…' : 'Record Problem'}
              variant="primary"
              size="md"
              loading={savingProblem}
              disabled={savingProblem}
              onPress={handleSaveProblem}
            />
          </View>
        </ScrollView>
      </Modal>

      {/* Structured Allergy Intake Dialog */}
      <StructuredAllergyIntakeModal
        visible={allergyModalVisible}
        onClose={() => {
          if (!savingAllergy) {
            setAllergyFormError(null);
            setAllergyModalVisible(false);
          }
        }}
        existingAllergies={structuredExistingAllergies}
        onAddAllergy={handleAddStructuredAllergy}
        onRemoveAllergy={(index) => {
          const target = allergies[index];
          if (target) handleDeleteAllergy(target);
        }}
        saving={savingAllergy}
        externalError={allergyFormError}
        onClearExternalError={() => setAllergyFormError(null)}
      />
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
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  sectionDescription: {
    marginBottom: theme.spacing.xs,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  toggleChip_active: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  toggleChip_locked: {
    borderColor: theme.colors.primaryDark,
  },
  otherInputRow: {
    marginTop: theme.spacing.xs,
  },
  notesRow: {
    marginTop: theme.spacing.xs,
  },
  emptyNoticeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
  },
  statutoryEmptyBanner: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  statutoryBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  proceduresList: {
    gap: theme.spacing.sm,
  },
  procedureCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderLight,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  procedureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  modalFormContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  modalFieldGroup: {
    gap: theme.spacing.xs,
  },
  formErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
});
