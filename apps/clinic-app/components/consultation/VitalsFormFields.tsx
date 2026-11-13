import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Input from '../ui/Input';
import Icon from '../ui/Icon';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import { theme } from '../../constants/theme';
import {
  ROS_CATEGORY_OPTIONS,
  type ClinicDispenseItemCategory,
  type EncounterReviewOfSystemsItemDto,
  type PediatricZScoreResult,
  type RosCategoryCode,
  type TriageDispensedItemInput,
  type TriageVitals,
} from '../../services/clinicService';

export type MeasurementPosture = 'STANDING' | 'RECUMBENT';

function normalizeSingleRosCategoryToken(raw: string): RosCategoryCode | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const exact = ROS_CATEGORY_OPTIONS.find(
    (opt) =>
      opt.code.toLowerCase() === trimmed.toLowerCase() ||
      opt.label.toLowerCase() === trimmed.toLowerCase() ||
      opt.shortLabel.toLowerCase() === trimmed.toLowerCase()
  );
  if (exact) return exact.code;
  const lower = trimmed.toLowerCase();
  if (lower === '00' || lower === 'normal' || lower === 'none' || lower.includes('essentially')) {
    return 'EssentiallyNormal';
  }
  if (lower.includes('allerg') || lower.includes('immun')) return 'AllergicImmunologic';
  if (lower.includes('derm') || lower.includes('skin') || lower.includes('integument')) return 'Dermatologic';
  if (lower.includes('resp') || lower.includes('pulm') || lower === 'lungs') return 'Respiratory';
  if (lower.includes('neuro') || lower === 'cns') return 'Neurological';
  if (lower.includes('gastro') || lower === 'gi' || lower.includes('abdom')) return 'Gastrointestinal';
  if (lower.includes('heent') || lower.includes('ent') || lower.includes('eye') || lower.includes('oral') || lower.includes('dental')) return 'Heent';
  if (lower.includes('cardio') || lower.includes('heart') || lower === 'cvs') return 'Cardiovascular';
  if (lower.includes('musculo') || lower === 'msk' || lower.includes('ortho')) return 'Musculoskeletal';
  if (lower.includes('genito') || lower === 'gu' || lower.includes('ob') || lower.includes('gyn') || lower.includes('renal')) return 'Genitourinary';
  if (lower.includes('psych') || lower.includes('mental') || lower.includes('behav')) return 'PsychiatricNeurodevelopmental';
  if (lower.includes('endo') || lower.includes('metab')) return 'EndocrineMetabolic';
  if (lower.includes('heme') || lower.includes('hemat') || lower.includes('lymph')) return 'HematologicLymphatic';
  if (lower.includes('general') || lower.includes('constit')) return 'General';
  return null;
}

export function normalizeRosCategoryCode(value?: string | null): RosCategoryCode {
  if (!value) return 'EssentiallyNormal';
  const trimmed = value.trim();
  if (trimmed.includes(',')) {
    let sawNormal = false;
    for (const part of trimmed.split(',')) {
      const parsed = normalizeSingleRosCategoryToken(part);
      if (parsed && parsed !== 'EssentiallyNormal') {
        return parsed;
      }
      if (parsed === 'EssentiallyNormal') {
        sawNormal = true;
      }
    }
    return sawNormal ? 'EssentiallyNormal' : 'EssentiallyNormal';
  }
  return normalizeSingleRosCategoryToken(trimmed) ?? 'EssentiallyNormal';
}

export function normalizeRosCategoryList(
  value?: ReadonlyArray<string | null | undefined> | string | null,
  options?: { allowEmpty?: boolean }
): RosCategoryCode[] {
  const allowEmpty = Boolean(options?.allowEmpty);
  const rawTokens: string[] = Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const deduped: RosCategoryCode[] = [];
  for (const token of rawTokens) {
    const parsed = normalizeSingleRosCategoryToken(token);
    if (parsed && !deduped.includes(parsed)) {
      deduped.push(parsed);
    }
  }

  const hasAbnormalSystem = deduped.some((c) => c !== 'EssentiallyNormal');
  const filtered = hasAbnormalSystem
    ? deduped.filter((c) => c !== 'EssentiallyNormal')
    : deduped;

  if (filtered.length === 0) {
    return allowEmpty ? [] : ['EssentiallyNormal'];
  }
  return filtered;
}

export function toggleRosCategorySelection(
  current: ReadonlyArray<RosCategoryCode | string>,
  toggled: RosCategoryCode
): RosCategoryCode[] {
  const normalizedCurrent = normalizeRosCategoryList(current, { allowEmpty: true });
  const isEssentiallyNormalLocked =
    normalizedCurrent.length === 1 && normalizedCurrent[0] === 'EssentiallyNormal';

  if (toggled === 'EssentiallyNormal') {
    return isEssentiallyNormalLocked ? [] : ['EssentiallyNormal'];
  }

  if (isEssentiallyNormalLocked) {
    return normalizedCurrent;
  }

  const activeSystems = normalizedCurrent.filter((c) => c !== 'EssentiallyNormal');
  if (activeSystems.includes(toggled)) {
    return activeSystems.filter((c) => c !== toggled);
  }
  return [...activeSystems, toggled];
}

export function getRosShortLabel(value?: string | null): string {
  const normalized = normalizeRosCategoryCode(value);
  return ROS_CATEGORY_OPTIONS.find((o) => o.code === normalized)?.shortLabel ?? 'Essentially Normal';
}

export function formatRosCategoriesSummary(
  values?: ReadonlyArray<RosCategoryCode | string> | string | null
): string {
  const normalized = normalizeRosCategoryList(values, { allowEmpty: true });
  if (
    normalized.length === 0 ||
    (normalized.length === 1 && normalized[0] === 'EssentiallyNormal')
  ) {
    return 'Essentially Normal';
  }
  if (normalized.length === 1) {
    return getRosShortLabel(normalized[0]);
  }
  if (normalized.length === 2) {
    return `${getRosShortLabel(normalized[0])}, ${getRosShortLabel(normalized[1])}`;
  }
  return `${getRosShortLabel(normalized[0])}, ${getRosShortLabel(normalized[1])} +${normalized.length - 2}`;
}

function inferRosCategoryFromKeywords(rawText: string): RosCategoryCode | null {
  const text = rawText.toLowerCase();
  if (!text.trim()) return null;
  if (text.includes('essentially normal')) return 'EssentiallyNormal';
  if (
    text.includes('allerg') ||
    text.includes('urticaria') ||
    text.includes('hives') ||
    text.includes('anaphylax') ||
    text.includes('immun')
  ) {
    return 'AllergicImmunologic';
  }
  if (
    text.includes('rash') ||
    text.includes('itch') ||
    text.includes('prurit') ||
    text.includes('skin') ||
    text.includes('lesion') ||
    text.includes('wound') ||
    text.includes('burn') ||
    text.includes('derma') ||
    text.includes('eczema')
  ) {
    return 'Dermatologic';
  }
  if (
    text.includes('cough') ||
    text.includes('cold') ||
    text.includes('dyspnea') ||
    text.includes('hemoptysis') ||
    text.includes('wheez') ||
    text.includes('sputum') ||
    text.includes('asthma') ||
    text.includes('shortness of breath') ||
    text.includes('pleurit') ||
    text.includes('breath')
  ) {
    return 'Respiratory';
  }
  if (
    text.includes('chest pain') ||
    text.includes('chest discomfort') ||
    text.includes('precordial') ||
    text.includes('substernal') ||
    text.includes('angina') ||
    text.includes('orthopnea') ||
    text.includes('palpitation') ||
    text.includes('hypertens') ||
    text.includes('edema')
  ) {
    return 'Cardiovascular';
  }
  if (
    text.includes('headache') ||
    text.includes('sensorium') ||
    text.includes('dizz') ||
    text.includes('vertigo') ||
    text.includes('seizure') ||
    text.includes('numb') ||
    text.includes('tingl') ||
    text.includes('migraine') ||
    text.includes('syncope') ||
    text.includes('tremor')
  ) {
    return 'Neurological';
  }
  if (
    text.includes('stomach') ||
    text.includes('abdom') ||
    text.includes('epigastric') ||
    text.includes('dysphagia') ||
    text.includes('hematemesis') ||
    text.includes('jaundice') ||
    text.includes('stool') ||
    text.includes('melena') ||
    text.includes('nausea') ||
    text.includes('vomit') ||
    text.includes('diarrhea') ||
    text.includes('constipat') ||
    text.includes('hyperacid') ||
    text.includes('heartburn') ||
    text.includes('gerd')
  ) {
    return 'Gastrointestinal';
  }
  if (
    text.includes('tooth') ||
    text.includes('dental') ||
    text.includes('gum') ||
    text.includes('epistaxis') ||
    text.includes('vision') ||
    text.includes('blur') ||
    text.includes('throat') ||
    text.includes('ear') ||
    text.includes('otalgia') ||
    text.includes('tinnitus') ||
    text.includes('eye') ||
    text.includes('nasal') ||
    text.includes('rhin') ||
    text.includes('sinus') ||
    text.includes('tonsil') ||
    text.includes('jaw')
  ) {
    return 'Heent';
  }
  if (
    text.includes('dysuria') ||
    text.includes('hematuria') ||
    text.includes('urgency') ||
    text.includes('urin') ||
    text.includes('dysmenorrhea') ||
    text.includes('menstru') ||
    text.includes('vaginal') ||
    text.includes('pelvic') ||
    text.includes('suprapubic') ||
    text.includes('flank')
  ) {
    return 'Genitourinary';
  }
  if (
    text.includes('joint') ||
    text.includes('muscle') ||
    text.includes('myalgia') ||
    text.includes('leg cramp') ||
    text.includes('back') ||
    text.includes('lumbar') ||
    text.includes('neck') ||
    text.includes('shoulder') ||
    text.includes('knee') ||
    text.includes('hip') ||
    text.includes('ankle') ||
    text.includes('wrist') ||
    text.includes('sprain') ||
    text.includes('arthralgia')
  ) {
    return 'Musculoskeletal';
  }
  if (
    text.includes('anxiet') ||
    text.includes('irritab') ||
    text.includes('insomnia') ||
    text.includes('stress') ||
    text.includes('depress') ||
    text.includes('mood') ||
    text.includes('panic')
  ) {
    return 'PsychiatricNeurodevelopmental';
  }
  if (
    text.includes('polydipsia') ||
    text.includes('polyphagia') ||
    text.includes('thyroid') ||
    text.includes('goiter') ||
    text.includes('heat intolerance') ||
    text.includes('cold intolerance')
  ) {
    return 'EndocrineMetabolic';
  }
  if (
    text.includes('bruis') ||
    text.includes('petechia') ||
    text.includes('lymphaden') ||
    text.includes('pallor') ||
    text.includes('anemia')
  ) {
    return 'HematologicLymphatic';
  }
  if (
    text.includes('fever') ||
    text.includes('chills') ||
    text.includes('anorexia') ||
    text.includes('weight loss') ||
    text.includes('sweat') ||
    text.includes('fatigue') ||
    text.includes('malaise') ||
    text.includes('weakness')
  ) {
    return 'General';
  }
  return null;
}

/**
 * Maps a PhilHealth YAKAP v2.0 `lib_signs_symptoms` code (`01`-`38`, `X`) or clinical symptom
 * description to its canonical Review of Systems (`RosCategoryCode`) body system.
 */
export function inferRosCategoryFromSymptom(
  optionCode?: string | null,
  symptomName?: string | null,
  detailText?: string | null
): RosCategoryCode | null {
  const code = (optionCode || '').trim().toUpperCase();
  if (code === '00') {
    return 'EssentiallyNormal';
  }

  // Site-specific resolution for PhilHealth statutory Pain ('38') and Others ('X')
  if (code === '38' || code === 'X') {
    if (detailText && detailText.trim()) {
      if (code === '38') {
        const lowerSite = detailText.toLowerCase();
        if (lowerSite.includes('chest') || lowerSite.includes('precordial') || lowerSite.includes('substernal')) {
          return 'Cardiovascular';
        }
        if (lowerSite.includes('head') || lowerSite.includes('cranial') || lowerSite.includes('migraine')) {
          return 'Neurological';
        }
      }
      const fromDetail = inferRosCategoryFromKeywords(detailText);
      if (fromDetail && fromDetail !== 'EssentiallyNormal') {
        return fromDetail;
      }
    }
    const fromLabel = symptomName ? inferRosCategoryFromKeywords(symptomName) : null;
    if (fromLabel && fromLabel !== 'EssentiallyNormal') {
      return fromLabel;
    }
    return 'General';
  }

  // Statutory PhilHealth YAKAP v2.0 `lib_signs_symptoms` code lookup (01-37)
  switch (code) {
    case '01': // Altered Mental Sensorium
    case '11': // Dizziness
    case '18': // Headache
    case '33': // Seizures
      return 'Neurological';
    case '02': // Abdominal Cramp/Pain
    case '07': // Constipation
    case '10': // Diarrhea
    case '12': // Dysphagia
    case '19': // Hematemesis
    case '23': // Jaundice
    case '30': // Stool, Bloody/Black Tarry/Mucoid
    case '35': // Vomiting/Nausea
      return 'Gastrointestinal';
    case '03': // Anorexia
    case '05': // Body Weakness
    case '32': // Sweating
    case '36': // Weight Loss
    case '37': // Fever
      return 'General';
    case '04': // Bleeding Gums
    case '06': // Blurring of Vision
    case '15': // Epistaxis
      return 'Heent';
    case '08': // Chest Pain/Discomfort
    case '25': // Lower Extremity Edema
    case '27': // Orthopnea
    case '28': // Palpitations
      return 'Cardiovascular';
    case '09': // Cough
    case '13': // Dyspnea
    case '21': // Hemoptysis
      return 'Respiratory';
    case '14': // Dysuria
    case '16': // Flank or Lower Back
    case '17': // Frequency of Urination
    case '20': // Hematuria
    case '34': // Urgency
      return 'Genitourinary';
    case '22': // Irritability
      return 'PsychiatricNeurodevelopmental';
    case '24': // Leg Cramps or Pain
    case '26': // Myalgia
      return 'Musculoskeletal';
    case '29': // Skin Rashes
    case '31': // Skin Rashes
      return 'Dermatologic';
    default:
      break;
  }

  const combined = [optionCode, symptomName, detailText].filter(Boolean).join(' ');
  if (!combined.trim()) {
    return null;
  }
  return inferRosCategoryFromKeywords(combined) ?? 'General';
}

export function getRequiredRosCategoriesForSymptoms(
  items: ReadonlyArray<EncounterReviewOfSystemsItemDto>
): RosCategoryCode[] {
  const required: RosCategoryCode[] = [];
  for (const item of items) {
    if (item.isPertinentPositive === false || item.optionCode === '00') {
      continue;
    }
    const explicitSystem = item.system ? normalizeSingleRosCategoryToken(item.system) : null;
    const inferred =
      explicitSystem && explicitSystem !== 'EssentiallyNormal'
        ? explicitSystem
        : inferRosCategoryFromSymptom(
            item.optionCode,
            item.symptomName,
            item.painSite || item.othersSpecifyText || item.remarks
          );
    if (inferred && inferred !== 'EssentiallyNormal' && !required.includes(inferred)) {
      required.push(inferred);
    }
  }
  return required;
}

export function syncRosCategoriesWithSymptoms(
  currentCategories: ReadonlyArray<RosCategoryCode | string>,
  prevItems: ReadonlyArray<EncounterReviewOfSystemsItemDto>,
  nextItems: ReadonlyArray<EncounterReviewOfSystemsItemDto>
): { nextCategories: RosCategoryCode[]; autoAdded: RosCategoryCode[] } {
  const normalizedCurrent = normalizeRosCategoryList(currentCategories, { allowEmpty: true });
  const positiveNext = nextItems.filter(
    (item) => item.isPertinentPositive !== false && item.optionCode !== '00'
  );
  if (positiveNext.length === 0) {
    return { nextCategories: normalizedCurrent, autoAdded: [] };
  }

  const prevByCode = new Map<string, EncounterReviewOfSystemsItemDto>();
  for (const item of prevItems) {
    if (item.isPertinentPositive !== false && item.optionCode !== '00') {
      prevByCode.set(item.optionCode, item);
    }
  }

  const wasLockedNormal =
    normalizedCurrent.length === 1 && normalizedCurrent[0] === 'EssentiallyNormal';
  const working = normalizedCurrent.filter((c) => c !== 'EssentiallyNormal');
  const autoAdded: RosCategoryCode[] = [];

  for (const item of positiveNext) {
    const prev = prevByCode.get(item.optionCode);
    const detailChanged =
      prev !== undefined &&
      ((item.painSite || '') !== (prev.painSite || '') ||
        (item.othersSpecifyText || '') !== (prev.othersSpecifyText || ''));
    if (!prev || detailChanged || wasLockedNormal) {
      const inferred = inferRosCategoryFromSymptom(
        item.optionCode,
        item.symptomName,
        item.painSite || item.othersSpecifyText || item.remarks
      );
      if (inferred && inferred !== 'EssentiallyNormal' && !working.includes(inferred)) {
        working.push(inferred);
        autoAdded.push(inferred);
      }
    }
  }

  return { nextCategories: working, autoAdded };
}

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
  chiefComplaint: string;
  homeInstructions: string;
  rosCategory: RosCategoryCode;
  dispensedItems: TriageDispensedItemInput[];
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
  chiefComplaint: '',
  homeInstructions: '',
  rosCategory: 'EssentiallyNormal',
  dispensedItems: [],
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
  patient: { age?: number; dateOfBirth?: string; sex?: string } | null | undefined
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

  const female = (patient.sex || '').toLowerCase().startsWith('f');
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
  } | null;
}

export function evaluateBmi(
  heightStr: string,
  weightStr: string,
  bodyLengthStr?: string,
  isInfant?: boolean,
  isPediatric?: boolean
): BmiEvaluation | null {
  const effectiveHeight = isInfant
    ? parseOptionalFloat(bodyLengthStr || '') || parseOptionalFloat(heightStr)
    : parseOptionalFloat(heightStr);
  const w = parseOptionalFloat(weightStr);
  if (effectiveHeight && w && effectiveHeight > 0) {
    const heightM = effectiveHeight / 100;
    const bmi = Math.round((w / (heightM * heightM)) * 10) / 10;

    // Adult cutoffs (<18.5 Underweight, >25 Overweight, >30 Obese) MUST NOT be applied to pediatric patients.
    if (isPediatric) {
      return { bmi, category: null };
    }

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

export const ADULT_PRE_ASSESSMENT_OBSERVATION_CHIPS = [
  'Alert & Oriented',
  'Mild Distress',
  'Acute Dyspnea',
  'Severe Pain',
  'Wheelchair Bound',
  'Fall Risk',
  'Ambulatory with Assist',
];

export const PEDIATRIC_PRE_ASSESSMENT_OBSERVATION_CHIPS = [
  'Well-Appearing',
  'Active & Playful',
  'Mild Distress',
  'Lethargic',
  'Tolerating Orals',
  'Hydrated / Moist Mucous Membranes',
];

export const PRE_ASSESSMENT_OBSERVATION_CHIPS = ADULT_PRE_ASSESSMENT_OBSERVATION_CHIPS;

export function getPreAssessmentObservationChips(cohort?: DemographicCohort): string[] {
  if (cohort?.isPediatric) {
    return PEDIATRIC_PRE_ASSESSMENT_OBSERVATION_CHIPS;
  }
  return ADULT_PRE_ASSESSMENT_OBSERVATION_CHIPS;
}

export function togglePreAssessmentChip(currentRemarks: string, chip: string): string {
  if (currentRemarks.includes(chip)) {
    return currentRemarks
      .split(' • ')
      .filter((c) => c.trim() !== chip)
      .join(' • ');
  }
  return currentRemarks.trim() ? `${currentRemarks.trim()} • ${chip}` : chip;
}

export const NURSE_HOME_CARE_CHIPS = [
  'Adequate oral hydration & rest',
  'Warm / cold compress as tolerated',
  'Monitor temperature every 4 hours',
  'Return to clinic if symptoms worsen or persist',
  'Seek immediate ER care for STAT danger signs',
];

export interface NurseOtcPreset {
  itemName: string;
  itemCategory: ClinicDispenseItemCategory;
  dosageOrSpec: string;
  formOrUnit: string;
  defaultQty: number;
  directionsOrInstructions: string;
  rosCategory: RosCategoryCode;
}

export const NURSE_ROUTINE_OTC_PRESETS: ReadonlyArray<NurseOtcPreset> = [
  {
    itemName: 'Paracetamol',
    itemCategory: 'Medicine',
    dosageOrSpec: '500mg',
    formOrUnit: 'Tablet',
    defaultQty: 2,
    directionsOrInstructions: 'Take 1 tab PO every 4-6 hrs as needed for fever or headache',
    rosCategory: 'Neurological',
  },
  {
    itemName: 'Mefenamic Acid',
    itemCategory: 'Medicine',
    dosageOrSpec: '250mg',
    formOrUnit: 'Capsule',
    defaultQty: 2,
    directionsOrInstructions: 'Take 1 cap PO after meals as needed for mild-moderate pain',
    rosCategory: 'General',
  },
  {
    itemName: 'Cetirizine',
    itemCategory: 'Medicine',
    dosageOrSpec: '10mg',
    formOrUnit: 'Tablet',
    defaultQty: 1,
    directionsOrInstructions: 'Take 1 tab PO once daily for allergy or rhinitis',
    rosCategory: 'Respiratory',
  },
  {
    itemName: 'Antacid',
    itemCategory: 'Medicine',
    dosageOrSpec: 'Chewable',
    formOrUnit: 'Tablet',
    defaultQty: 2,
    directionsOrInstructions: 'Chew 1-2 tabs after meals for hyperacidity or epigastric discomfort',
    rosCategory: 'Gastrointestinal',
  },
  {
    itemName: 'Oral Rehydration Salts',
    itemCategory: 'Medicine',
    dosageOrSpec: '20.5g',
    formOrUnit: 'Sachet',
    defaultQty: 2,
    directionsOrInstructions: 'Dissolve 1 sachet in 1L clean water; sip after loose stools',
    rosCategory: 'Gastrointestinal',
  },
  {
    itemName: 'Loperamide',
    itemCategory: 'Medicine',
    dosageOrSpec: '2mg',
    formOrUnit: 'Capsule',
    defaultQty: 2,
    directionsOrInstructions: 'Take 1 cap PO after loose bowel movement (non-febrile)',
    rosCategory: 'Gastrointestinal',
  },
  {
    itemName: 'Sterile Gauze Pad',
    itemCategory: 'MedicalSupply',
    dosageOrSpec: '4x4 in',
    formOrUnit: 'Pad',
    defaultQty: 2,
    directionsOrInstructions: 'Keep wound dressing clean and dry',
    rosCategory: 'Dermatologic',
  },
  {
    itemName: 'Adhesive Bandage',
    itemCategory: 'MedicalSupply',
    dosageOrSpec: 'Standard',
    formOrUnit: 'Piece',
    defaultQty: 2,
    directionsOrInstructions: 'Replace daily or if wet/soiled',
    rosCategory: 'Dermatologic',
  },
  {
    itemName: 'Povidone-Iodine Swab',
    itemCategory: 'MedicalSupply',
    dosageOrSpec: '10%',
    formOrUnit: 'Swab',
    defaultQty: 1,
    directionsOrInstructions: 'Topical wound cleansing applied at clinic',
    rosCategory: 'Dermatologic',
  },
];

export function hydrateVitalsFormFromRecord(
  vitalsData: Partial<TriageVitals> | null | undefined,
  cohort?: DemographicCohort | null,
): VitalsFormState {
  const isInfant = Boolean(cohort?.isInfant);
  if (!vitalsData) {
    return {
      ...EMPTY_VITALS_FORM,
      dispensedItems: [],
      posture: isInfant ? 'RECUMBENT' : 'STANDING',
    };
  }
  return {
    bpSys: vitalsData.systolicBp != null ? String(vitalsData.systolicBp) : '',
    bpDia: vitalsData.diastolicBp != null ? String(vitalsData.diastolicBp) : '',
    hr: vitalsData.heartRateBpm != null ? String(vitalsData.heartRateBpm) : '',
    rr: vitalsData.respiratoryRateBreathsPerMin != null ? String(vitalsData.respiratoryRateBreathsPerMin) : '',
    temp: vitalsData.temperatureCelsius != null ? String(vitalsData.temperatureCelsius) : '',
    spo2: vitalsData.oxygenSaturationPercent != null ? String(vitalsData.oxygenSaturationPercent) : '',
    pain: vitalsData.painScore != null ? String(vitalsData.painScore) : '',
    height: vitalsData.heightCm != null ? String(vitalsData.heightCm) : '',
    weight: vitalsData.weightKg != null ? String(vitalsData.weightKg) : '',
    bodyLength:
      vitalsData.bodyLengthCm != null
        ? String(vitalsData.bodyLengthCm)
        : isInfant && vitalsData.heightCm != null
          ? String(vitalsData.heightCm)
          : '',
    headCircumference: vitalsData.headCircumferenceCm != null ? String(vitalsData.headCircumferenceCm) : '',
    midUpperArmCircumference:
      vitalsData.midUpperArmCircumferenceCm != null ? String(vitalsData.midUpperArmCircumferenceCm) : '',
    skinfoldThickness: vitalsData.skinfoldThicknessMm != null ? String(vitalsData.skinfoldThicknessMm) : '',
    limbsCircumference: vitalsData.limbsCircumferenceCm != null ? String(vitalsData.limbsCircumferenceCm) : '',
    waistCircumference: vitalsData.waistCircumferenceCm != null ? String(vitalsData.waistCircumferenceCm) : '',
    hipCircumference: vitalsData.hipCircumferenceCm != null ? String(vitalsData.hipCircumferenceCm) : '',
    visualAcuityLeft: vitalsData.visualAcuityLeft || '',
    visualAcuityRight: vitalsData.visualAcuityRight || '',
    notes: vitalsData.notes || '',
    posture: vitalsData.isMeasuredRecumbent || isInfant ? 'RECUMBENT' : 'STANDING',
    preAssessmentNotes: vitalsData.preAssessmentNotes || '',
    preAssessmentRemarks: vitalsData.preAssessmentRemarks || '',
    triagePriority:
      vitalsData.triageAcuityReason === 'Urgent' || vitalsData.triageAcuityReason === 'Emergency'
        ? vitalsData.triageAcuityReason
        : 'Routine',
    chiefComplaint: vitalsData.chiefComplaint || '',
    homeInstructions: vitalsData.homeInstructions || '',
    rosCategory: normalizeRosCategoryCode(vitalsData.rosCategory),
    dispensedItems: (vitalsData.dispensedItems || []).map((item) => ({
      id: item.id || undefined,
      itemName: item.itemName,
      itemCategory: (item.itemCategory as ClinicDispenseItemCategory) || 'Medicine',
      dosageOrSpec: item.dosageOrSpec || undefined,
      formOrUnit: item.formOrUnit || 'pcs',
      quantityDispensed: item.quantityDispensed,
      directionsOrInstructions: item.directionsOrInstructions || undefined,
      rosCategory: normalizeRosCategoryCode(item.rosCategory || vitalsData.rosCategory),
      isDoctorReviewed: Boolean(item.reviewedAt || (item as { isDoctorReviewed?: boolean }).isDoctorReviewed),
      reviewedByDoctorName: item.reviewedByDoctorName || undefined,
    })),
  };
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

export function CohortHeaderMeta({ cohort }: { cohort: DemographicCohort }) {
  return (
    <View style={styles.cohortHeaderMeta}>
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
      <ThemedText variant="caption" color={theme.colors.textSecondary}>
        {cohort.sublabel}
      </ThemedText>
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
    <View style={styles.sectionFirst}>
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
    </View>
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
  const [showAdvancedAnthropometrics, setShowAdvancedAnthropometrics] = React.useState<boolean>(
    () => !cohort.isPediatric || !!(form.waistCircumference || form.hipCircumference)
  );
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Icon name="activity" size={theme.sizes.iconSm} color={theme.colors.primary} />
        <ThemedText variant="smallBold" color={theme.colors.text}>
          {cohort.isInfant
            ? 'Infant Anthropometrics (0–24 Months)'
            : cohort.isUnderFive
              ? 'Under-5 Anthropometrics & Growth'
              : 'Anthropometrics & Body Composition'}
        </ThemedText>
        {calculatedBmi && !cohort.isInfant ? (
          <Badge
            label={bmiCategory ? `BMI: ${calculatedBmi} (${bmiCategory.label})` : `BMI: ${calculatedBmi}`}
            variant={bmiCategory?.variant ?? 'routine'}
            size="sm"
          />
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
        ) : cohort.isPediatric ? (
          <>
            <View style={styles.gridItem}>
              <Input
                label="Height (cm)"
                placeholder="e.g. 140"
                value={form.height}
                onChangeText={(txt) => updateField('height', txt)}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.gridItem}>
              <Input
                label="Weight (kg)"
                placeholder="e.g. 35.0"
                value={form.weight}
                onChangeText={(txt) => updateField('weight', txt)}
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

      {/* Optional Advanced Anthropometrics Disclosure for Pediatric Patients */}
      {cohort.isPediatric ? (
        <View style={styles.advancedAnthropometricsContainer}>
          <Pressable
            testID="toggle-advanced-anthropometrics"
            accessibilityRole="button"
            accessibilityLabel={
              showAdvancedAnthropometrics
                ? 'Hide advanced anthropometrics'
                : 'Show advanced anthropometrics'
            }
            onPress={() => setShowAdvancedAnthropometrics((prev) => !prev)}
            style={styles.advancedDisclosureButton}
          >
            <Icon
              name={showAdvancedAnthropometrics ? 'chevronUp' : 'chevronDown'}
              size={theme.sizes.iconSm}
              color={theme.colors.primary}
            />
            <ThemedText variant="captionBold" color={theme.colors.primary}>
              {showAdvancedAnthropometrics
                ? 'Hide Advanced Anthropometrics (Waist & Hip)'
                : 'Advanced Anthropometrics (Waist & Hip)'}
            </ThemedText>
          </Pressable>

          {showAdvancedAnthropometrics ? (
            <View style={styles.advancedFormGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Waist Circumference (cm)"
                  placeholder="Optional, e.g. 60"
                  value={form.waistCircumference}
                  onChangeText={(txt) => updateField('waistCircumference', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Hip Circumference (cm)"
                  placeholder="Optional, e.g. 70"
                  value={form.hipCircumference}
                  onChangeText={(txt) => updateField('hipCircumference', txt)}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

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
    </View>
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
    <View style={styles.sectionCard}>
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
    </View>
  );
}

export interface PreAssessmentSectionProps {
  form: VitalsFormState;
  updateField: (key: keyof VitalsFormState, val: string) => void;
  cohort?: DemographicCohort;
}

export function PreAssessmentSection({
  form,
  updateField,
  cohort,
}: PreAssessmentSectionProps) {
  const chips = getPreAssessmentObservationChips(cohort);

  return (
    <View style={styles.sectionCard}>
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
          {chips.map((chip) => {
            const isActive = form.preAssessmentRemarks.includes(chip);
            return (
              <Pressable
                key={chip}
                testID={`observation-chip-${chip.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
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
    </View>
  );
}

export interface RosCategorySelectorSectionProps {
  value?: RosCategoryCode | string;
  onChange?: (code: RosCategoryCode) => void;
  multiple?: boolean;
  values?: ReadonlyArray<RosCategoryCode | string>;
  onChangeMultiple?: (codes: RosCategoryCode[]) => void;
  disabled?: boolean;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export function RosCategorySelectorSection({
  value,
  onChange,
  multiple = false,
  values,
  onChangeMultiple,
  disabled = false,
  title = 'Review of Systems (ROS) Category',
  subtitle = 'Associate this clinical service with its primary organ system or mark Essentially Normal.',
  compact = false,
}: RosCategorySelectorSectionProps) {
  const normalizedSingle = normalizeRosCategoryCode(value);
  const selectedMultiple = multiple
    ? normalizeRosCategoryList(values, { allowEmpty: true })
    : [normalizedSingle];
  const isEssentiallyNormalLocked =
    multiple &&
    selectedMultiple.length === 1 &&
    selectedMultiple[0] === 'EssentiallyNormal';

  const handlePressOption = (code: RosCategoryCode) => {
    if (disabled) return;
    if (multiple) {
      if (isEssentiallyNormalLocked && code !== 'EssentiallyNormal') {
        return;
      }
      const next = toggleRosCategorySelection(selectedMultiple, code);
      onChangeMultiple?.(next);
      onChange?.(next[0] ?? 'EssentiallyNormal');
      return;
    }
    onChange?.(code);
  };

  return (
    <View style={compact ? styles.rosCompactCard : styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Icon name="stethoscope" size={theme.sizes.iconSm} color={theme.colors.primary} />
        <ThemedText variant="smallBold" color={theme.colors.text}>
          {title}
        </ThemedText>
      </View>
      {subtitle ? (
        <ThemedText variant="caption" color={theme.colors.textSecondary}>
          {subtitle}
        </ThemedText>
      ) : null}
      <View style={styles.chipsRow}>
        {ROS_CATEGORY_OPTIONS.map((opt) => {
          const isNormalOption = opt.code === 'EssentiallyNormal';
          const isDisabled = Boolean(
            disabled || (multiple && isEssentiallyNormalLocked && !isNormalOption),
          );
          const isActive = multiple
            ? isNormalOption
              ? isEssentiallyNormalLocked
              : !isEssentiallyNormalLocked && selectedMultiple.includes(opt.code)
            : normalizedSingle === opt.code;
          return (
            <Pressable
              key={opt.code}
              testID={`ros-category-chip-${opt.code}`}
              disabled={isDisabled}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityState={{
                checked: isActive,
                selected: isActive,
                disabled: isDisabled,
              }}
              onPress={() => handlePressOption(opt.code)}
              style={[
                styles.observationChip,
                isActive && (isNormalOption ? styles.observationChipNormalActive : styles.observationChipActive),
                isDisabled && styles.observationChipDisabled,
              ]}
            >
              <View style={styles.chipContent}>
                {isActive ? (
                  <Icon
                    name="check"
                    size={theme.sizes.iconSm - 4}
                    color={isNormalOption ? theme.colors.successText : theme.colors.primaryDark}
                  />
                ) : null}
                <ThemedText
                  variant="caption"
                  color={
                    isDisabled
                      ? theme.colors.textMuted
                      : isActive
                        ? isNormalOption
                          ? theme.colors.successText
                          : theme.colors.primaryDark
                        : theme.colors.textSecondary
                  }
                >
                  {opt.shortLabel}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
      {isEssentiallyNormalLocked && !disabled ? (
        <ThemedText
          variant="caption"
          color={theme.colors.textSecondary}
          testID="ros-essentially-normal-lock-hint"
        >
          All body systems marked normal — individual system choices are disabled. Tap Essentially Normal again to unlock.
        </ThemedText>
      ) : null}
    </View>
  );
}

export function isVisitTypeEligibleForOtcDispensing(visitType?: string | null): boolean {
  if (!visitType) return true;
  switch (visitType.trim()) {
    case 'RoutineCheckup':
    case 'AcuteIllnessConsultation':
    case 'ChronicDiseaseFollowUp':
    case 'PreventiveHealthAssessment':
    case 'UrgentCareVisit':
      return true;
    default:
      return false;
  }
}

export interface NurseCareAndOtcDispensingSectionProps {
  chiefComplaint: string;
  onChangeChiefComplaint: (val: string) => void;
  homeInstructions: string;
  onChangeHomeInstructions: (val: string) => void;
  rosCategory: RosCategoryCode;
  onChangeRosCategory: (val: RosCategoryCode) => void;
  dispensedItems: TriageDispensedItemInput[];
  onChangeDispensedItems: (items: TriageDispensedItemInput[]) => void;
  hideChiefComplaint?: boolean;
  allowDispensing?: boolean;
}

export function NurseCareAndOtcDispensingSection({
  chiefComplaint,
  onChangeChiefComplaint,
  homeInstructions,
  onChangeHomeInstructions,
  rosCategory,
  onChangeRosCategory,
  dispensedItems,
  onChangeDispensedItems,
  hideChiefComplaint = false,
  allowDispensing = true,
}: NurseCareAndOtcDispensingSectionProps) {
  const [customCategory, setCustomCategory] = useState<ClinicDispenseItemCategory>('Medicine');
  const [customName, setCustomName] = useState('');
  const [customDosage, setCustomDosage] = useState('');
  const [customUnit, setCustomUnit] = useState('Tablet');
  const [customQty, setCustomQty] = useState('2');
  const [customDirections, setCustomDirections] = useState('');

  const handleQuickAddPreset = (preset: NurseOtcPreset) => {
    const existingIndex = dispensedItems.findIndex(
      (item) =>
        !item.isDoctorReviewed &&
        item.itemName.toLowerCase() === preset.itemName.toLowerCase() &&
        (item.dosageOrSpec || '').toLowerCase() === preset.dosageOrSpec.toLowerCase()
    );
    if (existingIndex >= 0) {
      const updated = dispensedItems.map((item, idx) =>
        idx === existingIndex
          ? { ...item, quantityDispensed: item.quantityDispensed + preset.defaultQty }
          : item
      );
      onChangeDispensedItems(updated);
    } else {
      onChangeDispensedItems([
        ...dispensedItems,
        {
          itemName: preset.itemName,
          itemCategory: preset.itemCategory,
          dosageOrSpec: preset.dosageOrSpec,
          formOrUnit: preset.formOrUnit,
          quantityDispensed: preset.defaultQty,
          directionsOrInstructions: preset.directionsOrInstructions,
          rosCategory: rosCategory !== 'EssentiallyNormal' ? rosCategory : preset.rosCategory,
        },
      ]);
    }
    if (rosCategory === 'EssentiallyNormal' && preset.rosCategory !== 'EssentiallyNormal') {
      onChangeRosCategory(preset.rosCategory);
    }
  };

  const handleAddCustomItem = () => {
    const nameTrimmed = customName.trim();
    if (!nameTrimmed) return;
    const qtyNum = Math.max(1, parseInt(customQty.trim(), 10) || 1);
    onChangeDispensedItems([
      ...dispensedItems,
      {
        itemName: nameTrimmed,
        itemCategory: customCategory,
        dosageOrSpec: customDosage.trim() || undefined,
        formOrUnit: customUnit.trim() || (customCategory === 'MedicalSupply' ? 'Piece' : 'Tablet'),
        quantityDispensed: qtyNum,
        directionsOrInstructions: customDirections.trim() || undefined,
        rosCategory,
      },
    ]);
    setCustomName('');
    setCustomDosage('');
    setCustomQty('2');
    setCustomDirections('');
  };

  const handleAdjustQuantity = (index: number, delta: number) => {
    const target = dispensedItems[index];
    if (!target || target.isDoctorReviewed) return;
    const nextQty = target.quantityDispensed + delta;
    if (nextQty <= 0) {
      onChangeDispensedItems(dispensedItems.filter((_, idx) => idx !== index));
    } else {
      onChangeDispensedItems(
        dispensedItems.map((item, idx) => (idx === index ? { ...item, quantityDispensed: nextQty } : item))
      );
    }
  };

  const handleRemoveItem = (index: number) => {
    const target = dispensedItems[index];
    if (!target || target.isDoctorReviewed) return;
    onChangeDispensedItems(dispensedItems.filter((_, idx) => idx !== index));
  };

  return (
    <View>
      <RosCategorySelectorSection value={rosCategory} onChange={onChangeRosCategory} />

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Icon name="clipboard" size={theme.sizes.iconSm} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Complaint &amp; Home Care Instructions
          </ThemedText>
        </View>

        {!hideChiefComplaint ? (
          <Input
            label="Chief Complaint (optional)"
            placeholder="e.g. Mild tension headache since morning, toothache, epigastric discomfort..."
            value={chiefComplaint}
            onChangeText={onChangeChiefComplaint}
          />
        ) : null}

        <View style={styles.chipsSection}>
          <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.xs }}>
            Quick Home Care Advice (tap to toggle)
          </ThemedText>
          <View style={styles.chipsRow}>
            {NURSE_HOME_CARE_CHIPS.map((chip) => {
              const isActive = homeInstructions.includes(chip);
              return (
                <Pressable
                  key={chip}
                  onPress={() => onChangeHomeInstructions(togglePreAssessmentChip(homeInstructions, chip))}
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

        <Input
          label="Home Care Instructions (optional)"
          placeholder="Hydration, rest, red-flag return precautions..."
          value={homeInstructions}
          onChangeText={onChangeHomeInstructions}
          multiline
          numberOfLines={2}
        />
      </View>

      {allowDispensing ? (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Icon name="pill" size={theme.sizes.iconSm} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Clinic Stock OTC Medicine &amp; Medical Supply Dispensing
          </ThemedText>
          {dispensedItems.length > 0 ? (
            <Badge label={`${dispensedItems.length} logged`} variant="primary" size="xs" />
          ) : null}
        </View>

        <View style={styles.dispenseInfoBox}>
          <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.infoText} />
          <ThemedText variant="caption" color={theme.colors.infoText} style={{ flex: 1 }}>
            Non-pharmacy clinic care log: no drug inventory setup or prior physician approval required. Items dispensed
            here are recorded in the unified Clinic Dispensing Ledger for census &amp; asynchronous physician review.
          </ThemedText>
        </View>

        <View style={styles.chipsSection}>
          <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.xs }}>
            Quick-Log Routine OTC Medicines &amp; Supplies
          </ThemedText>
          <View style={styles.chipsRow}>
            {NURSE_ROUTINE_OTC_PRESETS.map((preset) => (
              <Pressable
                key={`${preset.itemName}-${preset.dosageOrSpec}`}
                onPress={() => handleQuickAddPreset(preset)}
                style={styles.observationChip}
              >
                <View style={styles.chipContent}>
                  <Icon
                    name={preset.itemCategory === 'MedicalSupply' ? 'medical' : 'pill'}
                    size={theme.sizes.iconSm - 4}
                    color={theme.colors.primary}
                  />
                  <ThemedText variant="caption" color={theme.colors.text}>
                    {preset.itemName} {preset.dosageOrSpec} (+{preset.defaultQty})
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.customDispenseBox}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Log Any Other Clinic OTC Medicine or Supply
          </ThemedText>
          <SegmentedControl<ClinicDispenseItemCategory>
            value={customCategory}
            onChange={(val) => {
              setCustomCategory(val);
              setCustomUnit(val === 'MedicalSupply' ? 'Piece' : 'Tablet');
            }}
            options={[
              { value: 'Medicine', label: 'OTC Medicine' },
              { value: 'MedicalSupply', label: 'Medical Supply' },
            ]}
          />
          <View style={styles.formGrid}>
            <View style={styles.gridItem}>
              <Input
                label="Item Name"
                placeholder={customCategory === 'MedicalSupply' ? 'e.g. Elastic Bandage' : 'e.g. Ibuprofen'}
                value={customName}
                onChangeText={setCustomName}
              />
            </View>
            <View style={styles.gridItem}>
              <Input
                label="Dosage / Spec (optional)"
                placeholder={customCategory === 'MedicalSupply' ? 'e.g. 2-inch' : 'e.g. 200mg'}
                value={customDosage}
                onChangeText={setCustomDosage}
              />
            </View>
          </View>
          <View style={styles.formGrid}>
            <View style={styles.gridItem}>
              <Input
                label="Quantity Dispensed"
                labelTooltip="Pieces or units handed out from clinic stock during this Vitals Check. Recorded in the unified Clinic Dispensing Ledger for census and asynchronous physician review without requiring drug inventory setup."
                placeholder="2"
                keyboardType="numeric"
                value={customQty}
                onChangeText={setCustomQty}
              />
            </View>
            <View style={styles.gridItem}>
              <Input
                label="Form / Unit"
                placeholder="Tablet, Capsule, Piece..."
                value={customUnit}
                onChangeText={setCustomUnit}
              />
            </View>
          </View>
          <Input
            label="Intake / Usage Instructions (optional)"
            placeholder="e.g. Take 1 tab after meals as needed for pain"
            value={customDirections}
            onChangeText={setCustomDirections}
          />
          <View style={styles.addCustomRow}>
            <Button
              title="Add Dispensed Item"
              variant="outline"
              size="sm"
              icon="plus"
              onPress={handleAddCustomItem}
              disabled={!customName.trim()}
            />
          </View>
        </View>

        {dispensedItems.length > 0 ? (
          <View style={styles.stagedList}>
            <ThemedText variant="captionBold" color={theme.colors.text}>
              Dispensed During This Vitals Check ({dispensedItems.length})
            </ThemedText>
            {dispensedItems.map((item, idx) => (
              <View key={`${item.itemName}-${idx}`} style={styles.stagedRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.badgeRow}>
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      {item.itemName}
                      {item.dosageOrSpec ? ` ${item.dosageOrSpec}` : ''}
                    </ThemedText>
                    <Badge
                      label={item.itemCategory === 'MedicalSupply' ? 'Medical Supply' : 'OTC Medicine'}
                      variant={item.itemCategory === 'MedicalSupply' ? 'info' : 'routine'}
                      size="xs"
                    />
                    <Badge
                      label={`ROS: ${getRosShortLabel(item.rosCategory || rosCategory)}`}
                      variant="neutral"
                      size="xs"
                    />
                    {item.isDoctorReviewed ? (
                      <Badge
                        label={item.reviewedByDoctorName ? `Reviewed (${item.reviewedByDoctorName})` : 'Reviewed by MD'}
                        variant="success"
                        size="xs"
                      />
                    ) : null}
                  </View>
                  {item.directionsOrInstructions ? (
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      {item.directionsOrInstructions}
                    </ThemedText>
                  ) : null}
                </View>
                {item.isDoctorReviewed ? (
                  <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                    {item.quantityDispensed} {item.formOrUnit || 'pcs'}
                  </ThemedText>
                ) : (
                  <View style={styles.qtyStepper}>
                    <Button
                      variant="outline"
                      size="xs"
                      icon="minus"
                      iconOnly
                      accessibilityLabel="Decrease quantity"
                      onPress={() => handleAdjustQuantity(idx, -1)}
                    />
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      {item.quantityDispensed} {item.formOrUnit || 'pcs'}
                    </ThemedText>
                    <Button
                      variant="outline"
                      size="xs"
                      icon="plus"
                      iconOnly
                      accessibilityLabel="Increase quantity"
                      onPress={() => handleAdjustQuantity(idx, 1)}
                    />
                    <Button
                      variant="dangerGhost"
                      size="xs"
                      icon="trash"
                      iconOnly
                      accessibilityLabel="Remove dispensed item"
                      onPress={() => handleRemoveItem(idx)}
                    />
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : null}
      </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cohortBanner: {
    paddingBottom: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cohortHeader: {
    gap: theme.spacing.xs,
  },
  cohortPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cohortHeaderMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: 2,
  },
  sectionFirst: {
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  sectionCard: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  rosCompactCard: {
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
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
  observationChipNormalActive: {
    borderColor: theme.colors.successBorder,
    backgroundColor: theme.colors.successBg,
  },
  observationChipDisabled: {
    opacity: 0.45,
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderLight,
  },
  rosAlignmentPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.warningBg,
    borderWidth: 1,
    borderColor: theme.colors.warningBorder,
  },
  rosAlignmentPromptText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dispenseInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.infoBg,
    borderWidth: 1,
    borderColor: theme.colors.infoBorder,
  },
  customDispenseBox: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  addCustomRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  stagedList: {
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  stagedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  advancedAnthropometricsContainer: {
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  advancedDisclosureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: theme.radii.sm,
  },
  advancedFormGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
});
