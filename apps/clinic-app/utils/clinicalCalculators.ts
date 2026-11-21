/**
 * Pure clinical calculation utilities for the ClinicEZ Tools Directory.
 * All functions are deterministic, side-effect free, and validate bounds safely.
 */

export type ClinicalTone = 'success' | 'info' | 'warning' | 'urgent' | 'emergency' | 'neutral';

export type BiologicalSex = 'male' | 'female';

// ---------------------------------------------------------------------------
// Unit Conversions
// ---------------------------------------------------------------------------

export function lbToKg(lb: number): number {
  return lb * 0.45359237;
}

export function ftInToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54;
}

export function umolLToMgDl(umolL: number): number {
  return umolL / 88.4;
}

// ---------------------------------------------------------------------------
// 1. BMI, BSA & Ideal Body Weight
// ---------------------------------------------------------------------------

export interface BmiBsaInput {
  weightKg: number;
  heightCm: number;
  sex?: BiologicalSex;
}

export interface BmiClassification {
  label: string;
  tone: ClinicalTone;
}

export interface BmiBsaResult {
  bmi: number;
  whoGlobal: BmiClassification;
  asiaPacific: BmiClassification;
  bsaMosteller: number;
  bsaDuBois: number;
  idealBodyWeightKg: number | null;
}

function classifyWhoGlobalBmi(bmi: number): BmiClassification {
  if (bmi < 18.5) return { label: 'Underweight', tone: 'info' };
  if (bmi < 25) return { label: 'Normal weight', tone: 'success' };
  if (bmi < 30) return { label: 'Overweight', tone: 'warning' };
  if (bmi < 35) return { label: 'Obese Class I', tone: 'urgent' };
  if (bmi < 40) return { label: 'Obese Class II', tone: 'emergency' };
  return { label: 'Obese Class III', tone: 'emergency' };
}

function classifyAsiaPacificBmi(bmi: number): BmiClassification {
  if (bmi < 18.5) return { label: 'Underweight', tone: 'info' };
  if (bmi < 23) return { label: 'Normal', tone: 'success' };
  if (bmi < 25) return { label: 'Overweight (At Risk)', tone: 'warning' };
  if (bmi < 30) return { label: 'Obese I', tone: 'urgent' };
  return { label: 'Obese II', tone: 'emergency' };
}

export function calculateBmiAndBsa(input: BmiBsaInput): BmiBsaResult | null {
  const { weightKg, heightCm, sex } = input;
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) {
    return null;
  }

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const bsaMosteller = Math.sqrt((heightCm * weightKg) / 3600);
  const bsaDuBois = 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725);

  let idealBodyWeightKg: number | null = null;
  if (sex && heightCm >= 152.4) {
    const inchesOverFiveFeet = heightCm / 2.54 - 60;
    const base = sex === 'male' ? 50 : 45.5;
    idealBodyWeightKg = Math.round((base + 2.3 * inchesOverFiveFeet) * 10) / 10;
  }

  return {
    bmi: Math.round(bmi * 10) / 10,
    whoGlobal: classifyWhoGlobalBmi(bmi),
    asiaPacific: classifyAsiaPacificBmi(bmi),
    bsaMosteller: Math.round(bsaMosteller * 100) / 100,
    bsaDuBois: Math.round(bsaDuBois * 100) / 100,
    idealBodyWeightKg,
  };
}

// ---------------------------------------------------------------------------
// 2. OB EDD & Gestational Age (Naegele's Rule with Cycle Adjustment)
// ---------------------------------------------------------------------------

export interface ObEddInput {
  lmpDateStr: string; // YYYY-MM-DD
  cycleLengthDays?: number;
  referenceDateStr?: string; // YYYY-MM-DD, defaults to today (local calendar date)
}

export interface ObMilestone {
  weeks: number;
  label: string;
  dateStr: string;
  reached: boolean;
}

export interface ObEddResult {
  lmpDateStr: string;
  eddDateStr: string;
  conceptionDateStr: string;
  aogWeeks: number;
  aogDays: number;
  aogTotalDays: number;
  aogFormatted: string;
  trimesterLabel: string;
  trimesterTone: ClinicalTone;
  progressPercent: number;
  daysRemaining: number;
  cycleLengthDays: number;
  milestones: ObMilestone[];
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function parseIsoUtcMidnight(dateStr: string): number | null {
  const m = ISO_DATE_RE.exec(dateStr.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

function formatUtcIsoDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function calculateObEddAndAog(input: ObEddInput): ObEddResult | null {
  const lmpMs = parseIsoUtcMidnight(input.lmpDateStr);
  if (lmpMs === null) return null;

  const refStr = input.referenceDateStr?.trim() || getTodayIsoDate();
  const refMs = parseIsoUtcMidnight(refStr);
  if (refMs === null) return null;

  const cycleLengthDays =
    input.cycleLengthDays !== undefined && Number.isFinite(input.cycleLengthDays)
      ? Math.round(input.cycleLengthDays)
      : 28;
  if (cycleLengthDays < 20 || cycleLengthDays > 45) return null;

  const cycleAdjustment = cycleLengthDays - 28;
  const gestationDays = 280 + cycleAdjustment;
  const eddMs = lmpMs + gestationDays * MS_PER_DAY;
  const conceptionMs = lmpMs + (14 + cycleAdjustment) * MS_PER_DAY;

  const aogTotalDays = Math.floor((refMs - lmpMs) / MS_PER_DAY);
  if (aogTotalDays < 0 || aogTotalDays > 320) {
    return null;
  }

  const aogWeeks = Math.floor(aogTotalDays / 7);
  const aogDays = aogTotalDays % 7;
  const daysRemaining = Math.floor((eddMs - refMs) / MS_PER_DAY);
  const progressPercent = Math.max(0, Math.min(100, Math.round((aogTotalDays / gestationDays) * 100)));

  let trimesterLabel = '1st Trimester';
  let trimesterTone: ClinicalTone = 'info';
  if (aogTotalDays >= 294) {
    trimesterLabel = 'Post-Term (≥42w)';
    trimesterTone = 'emergency';
  } else if (aogTotalDays >= 196) {
    trimesterLabel = '3rd Trimester';
    trimesterTone = aogTotalDays >= 259 ? 'success' : 'warning';
  } else if (aogTotalDays >= 98) {
    trimesterLabel = '2nd Trimester';
    trimesterTone = 'success';
  }

  const milestoneSpecs = [
    { weeks: 12, label: 'End of 1st trimester / NT screen' },
    { weeks: 20, label: 'Congenital Anomaly Scan (CAS)' },
    { weeks: 28, label: 'Start of 3rd trimester / OGTT' },
    { weeks: 37, label: 'Early term threshold' },
    { weeks: 40, label: 'Estimated Due Date (EDD)' },
  ];

  const milestones: ObMilestone[] = milestoneSpecs.map((spec) => {
    const targetDays = spec.weeks * 7 + (spec.weeks === 40 ? cycleAdjustment : 0);
    return {
      weeks: spec.weeks,
      label: spec.label,
      dateStr: formatUtcIsoDate(lmpMs + targetDays * MS_PER_DAY),
      reached: aogTotalDays >= targetDays,
    };
  });

  return {
    lmpDateStr: formatUtcIsoDate(lmpMs),
    eddDateStr: formatUtcIsoDate(eddMs),
    conceptionDateStr: formatUtcIsoDate(conceptionMs),
    aogWeeks,
    aogDays,
    aogTotalDays,
    aogFormatted: `${aogWeeks}w ${aogDays}d`,
    trimesterLabel,
    trimesterTone,
    progressPercent,
    daysRemaining,
    cycleLengthDays,
    milestones,
  };
}

// ---------------------------------------------------------------------------
// 3. Pediatric Weight-Based Dosing Calculator
// ---------------------------------------------------------------------------

export type PediatricDoseMode = 'perDay' | 'perDose';

export interface PediatricDoseInput {
  weightKg: number;
  doseMgPerKg: number;
  mode: PediatricDoseMode;
  dosesPerDay: number;
  concentrationMg?: number;
  concentrationMl?: number;
  maxDailyDoseMg?: number;
}

export interface PediatricDoseResult {
  singleDoseMg: number;
  dailyTotalMg: number;
  dosesPerDay: number;
  intervalHours: number;
  singleDoseMl: number | null;
  dailyTotalMl: number | null;
  exceedsMaxDaily: boolean;
  cappedSingleDoseMg: number | null;
  cappedDailyTotalMg: number | null;
  cappedSingleDoseMl: number | null;
}

export interface PediatricDosePreset {
  id: string;
  label: string;
  doseMgPerKg: number;
  mode: PediatricDoseMode;
  dosesPerDay: number;
  concentrationMg: number;
  concentrationMl: number;
  maxDailyDoseMg: number;
  note: string;
}

export const PEDIATRIC_DOSE_PRESETS: PediatricDosePreset[] = [
  {
    id: 'paracetamol',
    label: 'Paracetamol (15 mg/kg/dose every 6h)',
    doseMgPerKg: 15,
    mode: 'perDose',
    dosesPerDay: 4,
    concentrationMg: 250,
    concentrationMl: 5,
    maxDailyDoseMg: 4000,
    note: 'Reference: 10–15 mg/kg per dose every 4–6 hours; max 75 mg/kg/day (up to 4 g/day). Confirm indication.',
  },
  {
    id: 'ibuprofen',
    label: 'Ibuprofen (10 mg/kg/dose every 8h)',
    doseMgPerKg: 10,
    mode: 'perDose',
    dosesPerDay: 3,
    concentrationMg: 100,
    concentrationMl: 5,
    maxDailyDoseMg: 2400,
    note: 'Reference: Ages 6 months and older; 5–10 mg/kg per dose every 6–8 hours; max 40 mg/kg/day.',
  },
  {
    id: 'amoxicillin',
    label: 'Amoxicillin (45 mg/kg/day, twice daily)',
    doseMgPerKg: 45,
    mode: 'perDay',
    dosesPerDay: 2,
    concentrationMg: 250,
    concentrationMl: 5,
    maxDailyDoseMg: 3000,
    note: 'Reference: Standard 40–50 mg/kg/day (high-dose 80–90 mg/kg/day for ear or chest infections).',
  },
  {
    id: 'cefalexin',
    label: 'Cefalexin (50 mg/kg/day, 3x daily)',
    doseMgPerKg: 50,
    mode: 'perDay',
    dosesPerDay: 3,
    concentrationMg: 250,
    concentrationMl: 5,
    maxDailyDoseMg: 4000,
    note: 'Reference: 25–50 mg/kg/day split every 6–8 hours (up to 100 mg/kg/day for severe infections).',
  },
];

export function calculatePediatricDose(input: PediatricDoseInput): PediatricDoseResult | null {
  const { weightKg, doseMgPerKg, mode, dosesPerDay, concentrationMg, concentrationMl, maxDailyDoseMg } = input;
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(doseMgPerKg) ||
    !Number.isFinite(dosesPerDay) ||
    weightKg <= 0 ||
    doseMgPerKg <= 0 ||
    dosesPerDay <= 0
  ) {
    return null;
  }

  const rawDailyTotalMg =
    mode === 'perDay' ? weightKg * doseMgPerKg : weightKg * doseMgPerKg * dosesPerDay;
  const rawSingleDoseMg = rawDailyTotalMg / dosesPerDay;

  const hasConcentration =
    concentrationMg !== undefined &&
    concentrationMl !== undefined &&
    Number.isFinite(concentrationMg) &&
    Number.isFinite(concentrationMl) &&
    concentrationMg > 0 &&
    concentrationMl > 0;

  const mgPerMl = hasConcentration ? concentrationMg! / concentrationMl! : null;

  const exceedsMaxDaily = Boolean(
    maxDailyDoseMg !== undefined &&
      Number.isFinite(maxDailyDoseMg) &&
      maxDailyDoseMg > 0 &&
      rawDailyTotalMg > maxDailyDoseMg
  );

  const cappedDailyTotalMg = exceedsMaxDaily ? Math.round(maxDailyDoseMg! * 10) / 10 : null;
  const cappedSingleDoseMg =
    exceedsMaxDaily ? Math.round((maxDailyDoseMg! / dosesPerDay) * 10) / 10 : null;
  const cappedSingleDoseMl =
    exceedsMaxDaily && mgPerMl ? Math.round((cappedSingleDoseMg! / mgPerMl) * 10) / 10 : null;

  return {
    singleDoseMg: Math.round(rawSingleDoseMg * 10) / 10,
    dailyTotalMg: Math.round(rawDailyTotalMg * 10) / 10,
    dosesPerDay,
    intervalHours: Math.round((24 / dosesPerDay) * 10) / 10,
    singleDoseMl: mgPerMl ? Math.round((rawSingleDoseMg / mgPerMl) * 10) / 10 : null,
    dailyTotalMl: mgPerMl ? Math.round((rawDailyTotalMg / mgPerMl) * 10) / 10 : null,
    exceedsMaxDaily,
    cappedSingleDoseMg,
    cappedDailyTotalMg,
    cappedSingleDoseMl,
  };
}

// ---------------------------------------------------------------------------
// 4. Renal Function: CKD-EPI 2021 (Race-Free) eGFR & Cockcroft-Gault CrCl
// ---------------------------------------------------------------------------

export type CreatinineUnit = 'mg/dL' | 'umol/L';

export interface RenalFunctionInput {
  creatinineValue: number;
  creatinineUnit: CreatinineUnit;
  ageYears: number;
  sex: BiologicalSex;
  weightKg?: number;
}

export interface RenalFunctionResult {
  creatinineMgDl: number;
  egfrCkdEpi2021: number;
  kdigoStage: 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5';
  kdigoLabel: string;
  kdigoTone: ClinicalTone;
  cockcroftGaultCrCl: number | null;
}

function classifyKdigoStage(egfr: number): {
  stage: RenalFunctionResult['kdigoStage'];
  label: string;
  tone: ClinicalTone;
} {
  if (egfr >= 90) return { stage: 'G1', label: 'Normal or high', tone: 'success' };
  if (egfr >= 60) return { stage: 'G2', label: 'Mildly decreased', tone: 'info' };
  if (egfr >= 45) return { stage: 'G3a', label: 'Mildly to moderately decreased', tone: 'warning' };
  if (egfr >= 30) return { stage: 'G3b', label: 'Moderately to severely decreased', tone: 'urgent' };
  if (egfr >= 15) return { stage: 'G4', label: 'Severely decreased', tone: 'emergency' };
  return { stage: 'G5', label: 'Kidney failure', tone: 'emergency' };
}

export function calculateRenalFunction(input: RenalFunctionInput): RenalFunctionResult | null {
  const { creatinineValue, creatinineUnit, ageYears, sex, weightKg } = input;
  if (
    !Number.isFinite(creatinineValue) ||
    !Number.isFinite(ageYears) ||
    creatinineValue <= 0 ||
    ageYears < 18 ||
    ageYears > 120
  ) {
    return null;
  }

  const scr = creatinineUnit === 'umol/L' ? umolLToMgDl(creatinineValue) : creatinineValue;
  if (scr <= 0) return null;

  const isFemale = sex === 'female';
  const kappa = isFemale ? 0.7 : 0.9;
  const alpha = isFemale ? -0.241 : -0.302;
  const sexMultiplier = isFemale ? 1.012 : 1.0;

  const ratio = scr / kappa;
  const egfr =
    142 *
    Math.pow(Math.min(ratio, 1), alpha) *
    Math.pow(Math.max(ratio, 1), -1.2) *
    Math.pow(0.9938, ageYears) *
    sexMultiplier;

  const roundedEgfr = Math.round(egfr * 10) / 10;
  const kdigo = classifyKdigoStage(roundedEgfr);

  let cockcroftGaultCrCl: number | null = null;
  if (weightKg !== undefined && Number.isFinite(weightKg) && weightKg > 0) {
    const cg = (((140 - ageYears) * weightKg) / (72 * scr)) * (isFemale ? 0.85 : 1.0);
    if (cg > 0) {
      cockcroftGaultCrCl = Math.round(cg * 10) / 10;
    }
  }

  return {
    creatinineMgDl: Math.round(scr * 100) / 100,
    egfrCkdEpi2021: roundedEgfr,
    kdigoStage: kdigo.stage,
    kdigoLabel: kdigo.label,
    kdigoTone: kdigo.tone,
    cockcroftGaultCrCl,
  };
}
