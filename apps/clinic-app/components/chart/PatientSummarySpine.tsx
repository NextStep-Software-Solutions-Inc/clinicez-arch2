import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, Skeleton } from '../ui';
import type { IconName } from '../ui/Icon';
import type { BadgeVariant } from '../ui/Badge';
import { formatLongAge } from '../../utils/age';
import type {
  ClinicPatient,
  PatientChart,
  PatientDemographics,
  TriageVitals,
  PatientProblemRecord,
  PatientAllergyRecord,
} from '../../services/clinicService';

export type UrgencyLevel = 'routine' | 'warning' | 'urgent' | 'emergency';

export interface VitalsThresholdResult {
  level: UrgencyLevel;
  label: string;
  isAbnormal: boolean;
}

export interface PatientSummarySpineProps {
  /** The patient record */
  patient?: ClinicPatient | null;
  /** Atomic patient chart */
  chart?: PatientChart | null;
  /** Direct demographics override */
  demographics?: PatientDemographics | null;
  /** Latest triage vitals override */
  vitals?: TriageVitals | null;
  /** Problems override */
  problems?: PatientProblemRecord[] | null;
  /** Allergies override */
  allergies?: PatientAllergyRecord[] | null;
  /** Active prescriptions override */
  activePrescriptions?: any[] | null;
  /** Active queue ticket number (e.g. "Q-104") */
  queueTicket?: string | null;
  /** Active queue priority (e.g. "Emergency", "Urgent", "Routine") */
  queuePriority?: string | null;
  /** Active chief complaint */
  chiefComplaint?: string | null;
  /** Active PhilHealth ATC override */
  activeAtc?: string | null;
  /** Active PhilHealth Case No override */
  activeCaseNo?: string | null;
  /** Loading state flag */
  loading?: boolean;
  /** Workstation display mode */
  variant?: 'full' | 'compact' | 'workstation';
  /** Compact alias */
  compact?: boolean;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  /** Optional callback when clicking edit demographics */
  onPressEdit?: () => void;
  /** Optional callback to refresh patient data */
  onPressRefresh?: () => void | Promise<unknown>;
  /** Optional callback to record/update triage vitals */
  onPressRecordVitals?: () => void;
}

export function evaluateBloodPressure(systolic?: number, diastolic?: number): VitalsThresholdResult {
  if (!systolic || !diastolic) return { level: 'routine', label: '—', isAbnormal: false };
  if (systolic >= 180 || diastolic >= 120) {
    return { level: 'emergency', label: 'Crisis', isAbnormal: true };
  }
  if (systolic >= 140 || diastolic >= 90) {
    return { level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true };
  }
  if (systolic < 90 || diastolic < 60) {
    return { level: 'urgent', label: 'Hypotension', isAbnormal: true };
  }
  if (systolic >= 130 || diastolic >= 80) {
    return { level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true };
  }
  if (systolic >= 120 && diastolic < 80) {
    return { level: 'warning', label: 'Elevated', isAbnormal: true };
  }
  return { level: 'routine', label: 'Normal', isAbnormal: false };
}

export function evaluateHeartRate(hr?: number): VitalsThresholdResult {
  if (!hr) return { level: 'routine', label: '—', isAbnormal: false };
  if (hr > 130) return { level: 'emergency', label: 'Marked Tachycardia', isAbnormal: true };
  if (hr > 100) return { level: 'urgent', label: 'Tachycardia', isAbnormal: true };
  if (hr < 45) return { level: 'emergency', label: 'Severe Bradycardia', isAbnormal: true };
  if (hr < 60) return { level: 'urgent', label: 'Bradycardia', isAbnormal: true };
  return { level: 'routine', label: 'Normal', isAbnormal: false };
}

export function evaluateRespiratoryRate(rr?: number): VitalsThresholdResult {
  if (!rr) return { level: 'routine', label: '—', isAbnormal: false };
  if (rr > 28) return { level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true };
  if (rr > 20) return { level: 'urgent', label: 'Tachypnea', isAbnormal: true };
  if (rr < 8) return { level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true };
  if (rr < 12) return { level: 'urgent', label: 'Bradypnea', isAbnormal: true };
  return { level: 'routine', label: 'Normal', isAbnormal: false };
}

export function evaluateTemperature(tempC?: number): VitalsThresholdResult {
  if (!tempC) return { level: 'routine', label: '—', isAbnormal: false };
  if (tempC >= 38.5) return { level: 'emergency', label: 'High Fever', isAbnormal: true };
  if (tempC >= 37.6) return { level: 'warning', label: 'Pyrexia', isAbnormal: true };
  if (tempC < 35.5) return { level: 'urgent', label: 'Hypothermia', isAbnormal: true };
  return { level: 'routine', label: 'Normal', isAbnormal: false };
}

export function evaluateOxygenSat(spo2?: number): VitalsThresholdResult {
  if (!spo2) return { level: 'routine', label: '—', isAbnormal: false };
  if (spo2 <= 90) return { level: 'emergency', label: 'Severe Hypoxia', isAbnormal: true };
  if (spo2 <= 94) return { level: 'warning', label: 'Mild Hypoxia', isAbnormal: true };
  return { level: 'routine', label: 'Normal', isAbnormal: false };
}

export function evaluateZScoreCategory(category?: string): BadgeVariant {
  if (!category) return 'neutral';
  const c = category.toLowerCase();
  if (c.includes('severely') || c.includes('sam') || c.includes('obese')) return 'emergency';
  if (c.includes('moderately') || c.includes('mam') || c.includes('overweight') || c.includes('stunted') || c.includes('wasted'))
    return 'urgent';
  if (c.includes('normal')) return 'success';
  return 'info';
}

export function formatPhilHealthPin(pin?: string): string {
  if (!pin) return '';
  const digits = pin.replace(/\D/g, '');
  if (digits.length !== 12) return pin;
  return `${digits.slice(0, 2)}-${digits.slice(2, 11)}-${digits.slice(11)}`;
}

/**
 * Evaluates whether an ICD-10 code represents active pregnancy, supervision of pregnancy,
 * or obstetric care (Z33.1, Z34, Z35, and Chapter 15 O00-O9A).
 */
export function isPregnancyIcd10(code?: string): boolean {
  if (!code) return false;
  const c = code.trim().toUpperCase();
  // Z33, Z33.1 (Pregnant state, incidental)
  if (c === 'Z33' || c.startsWith('Z33.')) return true;
  // Z34, Z34.0, Z34.8, Z34.9 (Supervision of normal pregnancy)
  if (c === 'Z34' || c.startsWith('Z34.')) return true;
  // Z35, Z35.0-Z35.9 (Supervision of high-risk pregnancy)
  if (c === 'Z35' || c.startsWith('Z35.')) return true;
  // O00-O9A (ICD-10 Chapter 15: Pregnancy, childbirth and the puerperium)
  if (/^O[0-9][0-9A-Z]?(?:\..*)?$/i.test(c)) return true;
  return false;
}

export interface EvaluatePregnancyAlertOptions {
  gender?: string;
  alerts?: string;
  reproductiveHistory?: {
    isApplicable?: boolean;
    isMenopausal?: boolean;
    menopauseAge?: number;
    remarks?: string;
  } | null;
  problems?: PatientProblemRecord[] | null;
}

/**
 * Evaluates whether a patient satisfies the clinical criteria for an active pregnancy alert.
 * 
 * Criteria:
 * 1. Biological sex must be female.
 * 2. Explicitly excludes non-pregnant or menopausal females.
 * 3. Requires at least one affirmative clinical indicator:
 *    - Alerts text matches active pregnancy or gestation.
 *    - Reproductive history remarks match active pregnancy.
 *    - Active problem list contains ICD-10 pregnancy codes (Z33.1, Z34, Z35, O00-O9A).
 */
export function evaluatePregnancyStatus(options: EvaluatePregnancyAlertOptions): boolean {
  const { gender, alerts, reproductiveHistory, problems } = options;

  // 1. Biological sex must be female
  const isFemale = typeof gender === 'string' && (
    gender.trim().toLowerCase() === 'female' || gender.trim().toLowerCase() === 'f'
  );
  if (!isFemale) {
    return false;
  }

  const alertsStr = alerts || '';
  const remarksStr = reproductiveHistory?.remarks || '';

  // 2. Explicit exclusions: menopausal or explicitly non-pregnant females
  const isMenopausal = Boolean(
    reproductiveHistory?.isMenopausal ||
    (typeof reproductiveHistory?.menopauseAge === 'number' && reproductiveHistory.menopauseAge > 0) ||
    /\b(menopausal|post-?menopausal|menopause)\b/i.test(alertsStr) ||
    /\b(menopausal|post-?menopausal|menopause)\b/i.test(remarksStr)
  );

  const isExplicitlyNonPregnant = Boolean(
    /\b(not|non-?|no|negative(?:\s+for)?)\s*(?:pregnant|pregnancy(?:\s+test)?|gestat|gravid)\b/i.test(alertsStr) ||
    /\b(not|non-?|no|negative(?:\s+for)?)\s*(?:pregnant|pregnancy(?:\s+test)?|gestat|gravid)\b/i.test(remarksStr) ||
    /\b(?:pregnancy(?:\s+test)?|upt|beta-?hcg)\s*(?:[:=–—-]|\bis\b)?\s*(negative|none|no|false|resolved|ended)\b/i.test(alertsStr) ||
    /\b(?:pregnancy(?:\s+test)?|upt|beta-?hcg)\s*(?:[:=–—-]|\bis\b)?\s*(negative|none|no|false|resolved|ended)\b/i.test(remarksStr)
  );

  if (isMenopausal || isExplicitlyNonPregnant) {
    return false;
  }

  // 3. Affirmative clinical criteria for active pregnancy
  // Criterion A: Alerts text matches active pregnancy or gestation
  const hasPregnancyAlert = Boolean(
    alertsStr &&
    /\b(pregnant|pregnancy|gestat(ion|ing)?|gravid|intrauterine pregnancy|iup)\b/i.test(alertsStr)
  );

  // Criterion B: Reproductive history remarks match active pregnancy
  const hasPregnancyRemarks = Boolean(
    remarksStr &&
    /\b(pregnant|pregnancy|gestat(ion|ing)?|gravid|intrauterine pregnancy|iup|trimester|expected delivery|edd|edc)\b/i.test(remarksStr)
  );

  // Criterion C: Active problem list contains ICD-10 pregnancy codes (Z33.1, Z34, Z35, O00-O9A)
  const hasPregnancyProblem = Boolean(
    problems &&
    problems.some(
      (p) =>
        p.status === 'Active' &&
        (isPregnancyIcd10(p.icd10Code) ||
          (/\b(pregnant|pregnancy|gestat(ion|ing)?|intrauterine pregnancy)\b/i.test(p.problemTitle || '') &&
           !/\b(not|non-?|no|negative)\b/i.test(p.problemTitle || '')))
    )
  );

  return hasPregnancyAlert || hasPregnancyRemarks || hasPregnancyProblem;
}

/**
 * Clinical regex matching high or moderate-high fall risk while strictly
 * rejecting low, no, none, zero, minimal, or resolved fall risk assessments.
 */
export const HIGH_FALL_RISK_REGEX =
  /(?<!\b(?:no|not|non|without)(?:\s+at)?\s+)\b(?:high|moderate[- ]high|moderate[- ]to[- ]high)\s+(?:risk\s+of\s+)?falls?(?:\s+risk|\s+hazard)?\b|(?<!\b(?:low|no|zero|minimal|resolved)\s+)\b(?:morse\s+)?falls?\s*(?:risk|scale)?\s*(?:\([^)]*\)\s*)?(?:\b(?:level|grade)\b\s*)?(?:[:=\-–—]|\bis\b)?\s*(?:\d+\s*\(?\s*)?(?:high|moderate[- ]high|moderate[- ]to[- ]high)\b(?!\s+risk\s+(?:of|for)\s+(?!falls?))|\bfalls?\s+risk\s*\([^)]*(?:high|moderate[- ]high)[^)]*\)|(?<!\b(?:no|not)\s+)\brisk\s+of\s+falls?\s*(?:[:=\-–—]|\bis\b)?\s*(?:high|moderate[- ]high)\b/i;

/**
 * Evaluates whether a clinical alert string indicates high fall risk.
 */
export function isHighFallRisk(alertsStr?: string | null): boolean {
  if (!alertsStr || typeof alertsStr !== 'string') return false;
  return HIGH_FALL_RISK_REGEX.test(alertsStr);
}

/**
 * Evaluates whether an alert string indicates a limb restriction alert (e.g. mastectomy, AV fistula).
 */
export function isLimbAlert(alertsStr?: string | null): boolean {
  if (!alertsStr || typeof alertsStr !== 'string') return false;
  return /\b(?:(?:left|right)\s+arm\s+alert|limb\s+alert|no\s+bp\s*(?:\/|\s+(?:and|or)\s+|,\s*)?iv)\b/i.test(alertsStr);
}

/**
 * Evaluates whether an alert string indicates seizure precautions.
 */
export function isSeizurePrecautions(alertsStr?: string | null): boolean {
  if (!alertsStr || typeof alertsStr !== 'string') return false;
  return /\bseizure\s+precautions?\b/i.test(alertsStr);
}

/**
 * Evaluates whether an alert string indicates combative or aggressive behavior risk.
 */
export function isCombativeRisk(alertsStr?: string | null): boolean {
  if (!alertsStr || typeof alertsStr !== 'string') return false;
  return /\b(?:combative(?:\s+risk)?|aggressive\s+risk)\b/i.test(alertsStr);
}

/**
 * Evaluates whether an alert string indicates wheelchair or mobility assistance requirement.
 */
export function isMobilityAssist(alertsStr?: string | null): boolean {
  if (!alertsStr || typeof alertsStr !== 'string') return false;
  return /\b(?:wheelchair(?:\s*\/\s*mobility\s+assist)?|mobility\s+assist(?:ance)?)\b/i.test(alertsStr);
}

export default function PatientSummarySpine({
  patient,
  chart,
  demographics: demoProp,
  vitals: vitalsProp,
  problems: problemsProp,
  allergies: allergiesProp,
  activePrescriptions: rxProp,
  queueTicket,
  queuePriority,
  chiefComplaint,
  activeAtc,
  activeCaseNo,
  loading = false,
  variant = 'full',
  compact = false,
  defaultCollapsed = false,
  onPressEdit,
  onPressRefresh,
  onPressRecordVitals,
}: PatientSummarySpineProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed || compact || variant === 'compact');
  const [isLocalRefreshing, setIsLocalRefreshing] = useState(false);
  const isRefreshing = Boolean(loading || isLocalRefreshing);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    if (onPressRefresh) {
      try {
        setIsLocalRefreshing(true);
        const res: unknown = onPressRefresh();
        if (res != null && typeof (res as { then?: unknown }).then === 'function') {
          await (res as PromiseLike<unknown>);
        } else {
          setTimeout(() => setIsLocalRefreshing(false), 750);
        }
      } catch {
        // Handled upstream
      } finally {
        setIsLocalRefreshing(false);
      }
    }
  };

  // Consolidated demographics
  const demo = demoProp || chart?.demographics;
  const fullName = demo?.patientName || patient?.fullName || chart?.patientName || 'Patient';
  const patientCode = demo?.patientCode || patient?.patientCode || '—';
  const age = demo?.age ?? patient?.age ?? 0;
  const gender = demo?.gender || patient?.gender || '—';
  const dob = demo?.dob || demo?.dateOfBirth || patient?.dateOfBirth;
  const bloodType = demo?.bloodType || patient?.bloodType;
  const isVerified = (demo?.verificationStatus || patient?.verificationStatus) !== 'PendingVerification';

  // Consolidated PhilHealth credentials
  const pin = demo?.philHealthNumber || patient?.philHealthNumber;
  const memberStatus = demo?.memberStatus || (pin ? 'Member' : undefined);
  const atc = activeAtc || demo?.philHealthAtc || demo?.atc;
  const caseNo = activeCaseNo || demo?.activeCaseNo;

  // Senior / PWD
  const seniorId = demo?.seniorCitizenId || patient?.seniorCitizenId;
  const isSenior = demo?.isSenior || Boolean(seniorId) || age >= 60;
  const pwdId = demo?.pwdId || patient?.pwdId;
  const isPwd = demo?.isPwd || Boolean(pwdId);
  const alertsStr = demo?.alerts || patient?.alerts || '';

  // Latest Vitals
  const latestVitals = vitalsProp || chart?.vitalsHistory?.[0] || null;
  const rawVitals = latestVitals as any;
  const hrValue: number | undefined = latestVitals?.heartRateBpm ?? rawVitals?.heartRate;
  const rrValue: number | undefined = latestVitals?.respiratoryRateBreathsPerMin ?? rawVitals?.respiratoryRate;
  const tempValue: number | undefined = latestVitals?.temperatureCelsius ?? rawVitals?.temperature;
  const spo2Value: number | undefined = latestVitals?.oxygenSaturationPercent ?? rawVitals?.oxygenSaturation;

  const bpEval = evaluateBloodPressure(latestVitals?.systolicBp, latestVitals?.diastolicBp);
  const hrEval = evaluateHeartRate(hrValue);
  const rrEval = evaluateRespiratoryRate(rrValue);
  const tempEval = evaluateTemperature(tempValue);
  const spo2Eval = evaluateOxygenSat(spo2Value);

  // Pediatric check (Under 19 years old)
  const isPediatric = age < 19 || Boolean(latestVitals?.zScoreWeightForAge);

  // Red Alerts (Zone 4: Anaphylaxis, Fall Risk, Pregnancy)
  const redAlerts = useMemo(() => {
    const alerts: { title: string; subtitle?: string; icon: IconName }[] = [];

    // 1. Anaphylactic & severe allergies
    const structuredAllergies = allergiesProp || chart?.allergies || [];
    const severeAllergies = structuredAllergies.filter(
      (a) => a.isAnaphylactic || a.severity === 'LifeThreatening' || a.severity === 'Severe'
    );
    if (severeAllergies.length > 0) {
      severeAllergies.forEach((a) => {
        alerts.push({
          title: `STAT ALLERGY: ${a.allergen.toUpperCase()}`,
          subtitle: a.reactionManifestation ? `Reaction: ${a.reactionManifestation} (Anaphylaxis Risk)` : 'High Anaphylaxis Risk',
          icon: 'emergency',
        });
      });
    } else {
      // Fallback from raw string
      const rawAllergies = patient?.allergies || '';
      if (rawAllergies && /anaphylax|severe|penicillin|latex/i.test(rawAllergies)) {
        alerts.push({
          title: `ALLERGY ALERT: ${rawAllergies}`,
          subtitle: 'Potential severe drug reaction',
          icon: 'emergency',
        });
      }
    }

    // 2. High fall risk (excluding low/no/negative/resolved fall risk)
    const alertsStr = demo?.alerts || patient?.alerts || '';
    if (isHighFallRisk(alertsStr)) {
      alerts.push({
        title: 'HIGH FALL RISK',
        subtitle: 'Fall prevention protocol active',
        icon: 'alert',
      });
    }

    // 3. Pregnancy Alert (precise clinical criteria: female AND (alert OR remarks OR active ICD-10))
    const isPregnant = evaluatePregnancyStatus({
      gender,
      alerts: alertsStr,
      reproductiveHistory: chart?.reproductiveHistory,
      problems: problemsProp || chart?.problems,
    });
    if (isPregnant) {
      alerts.push({
        title: 'PREGNANCY / OB ALERT',
        subtitle: 'Maternal care protocol active • Review teratogenic meds',
        icon: 'alert',
      });
    }

    // 4. Limb Alert (No BP / IV on affected arm)
    if (isLimbAlert(alertsStr)) {
      const isLeft = /left arm/i.test(alertsStr);
      const isRight = /right arm/i.test(alertsStr);
      let armTitle = 'LIMB ALERT (NO BP/IV)';
      if (isLeft && !isRight) armTitle = 'LEFT ARM ALERT (NO BP/IV)';
      else if (isRight && !isLeft) armTitle = 'RIGHT ARM ALERT (NO BP/IV)';
      alerts.push({
        title: armTitle,
        subtitle: 'Do not use affected arm for blood pressure, venipuncture, or IV',
        icon: 'alertCircle',
      });
    }

    // 5. Seizure Precautions
    if (isSeizurePrecautions(alertsStr)) {
      alerts.push({
        title: 'SEIZURE PRECAUTIONS',
        subtitle: 'Seizure protocol active • Padded side rails / airway support ready',
        icon: 'zap',
      });
    }

    // 6. Combative / Aggressive Risk
    if (isCombativeRisk(alertsStr)) {
      alerts.push({
        title: 'SAFETY ALERT: COMBATIVE RISK',
        subtitle: 'Staff caution advised • De-escalation precautions in place',
        icon: 'alert',
      });
    }

    return alerts;
  }, [
    allergiesProp,
    chart?.allergies,
    chart?.reproductiveHistory,
    demo?.alerts,
    patient?.allergies,
    patient?.alerts,
    gender,
    problemsProp,
    chart?.problems,
  ]);

  // Active chronic problems (ICD-10)
  const activeProblems = useMemo(() => {
    const probList = problemsProp || chart?.problems;
    if (probList && probList.length > 0) {
      return probList.filter((p) => p.status === 'Active');
    }
    if (patient?.chronicConditions) {
      return patient.chronicConditions.split(',').map((c, i) => ({
        id: `c-${i}`,
        icd10Code: 'CHRONIC',
        problemTitle: c.trim(),
        isChronicNcd: true,
      }));
    }
    return [];
  }, [problemsProp, chart?.problems, patient?.chronicConditions]);

  // Active medications
  const activeMeds = useMemo(() => {
    if (rxProp && rxProp.length > 0) {
      return rxProp.map((rx) => `${rx.genericName} ${rx.dosage || ''} ${rx.sig ? `(${rx.sig})` : ''}`.trim());
    }
    const list: string[] = [];
    if (chart?.consultations && chart.consultations.length > 0) {
      const latestRx = chart.consultations[0].prescriptions || [];
      latestRx.forEach((rx) => {
        list.push(`${rx.genericName} ${rx.dosage || ''} ${rx.sig ? `(${rx.sig})` : ''}`.trim());
      });
    }
    return list;
  }, [rxProp, chart?.consultations]);

  if (loading && !patient && !chart) {
    return (
      <View style={styles.spineContainer}>
        <Skeleton height={24} width={220} style={{ marginBottom: theme.spacing.xs }} />
        <Skeleton height={16} width={340} style={{ marginBottom: theme.spacing.sm }} />
        <Skeleton height={38} style={{ borderRadius: theme.radii.sm }} />
      </View>
    );
  }

  const effectiveTicket = queueTicket || patient?.activeQueueTicket;
  const effectivePriority = queuePriority;

  return (
    <View style={styles.spineContainer}>
      {/* ========================================================================= */}
      {/* ZONE 1, 2, 3: DEMOGRAPHICS, PHILHEALTH & STATUTORY POPULATION HEADER       */}
      {/* ========================================================================= */}
      <View style={styles.topRow}>
        <View style={styles.demographicsGroup}>
          <View style={styles.nameRow}>
            <ThemedText variant="h3" style={styles.patientName} numberOfLines={1}>
              {fullName}
            </ThemedText>
            {isVerified ? (
              <Badge label="Verified" variant="success" size="sm" icon="checkCircle" />
            ) : (
              <Badge label="Unverified" variant="warning" size="sm" icon="alert" />
            )}
            {bloodType ? (
              <Badge label={bloodType} variant="neutral" size="sm" icon="droplet" />
            ) : null}
            {effectiveTicket ? (
              <Badge label={`Ticket: ${effectiveTicket}`} variant="primary" size="sm" icon="ticket" />
            ) : null}
            {effectivePriority ? (
              <Badge
                label={effectivePriority}
                variant={
                  effectivePriority.toLowerCase() === 'emergency'
                    ? 'emergency'
                    : effectivePriority.toLowerCase() === 'urgent'
                    ? 'urgent'
                    : 'routine'
                }
                size="sm"
              />
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Code: <ThemedText variant="caption" color={theme.colors.text}>{patientCode}</ThemedText>
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.borderDark}>•</ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              {dob ? formatLongAge(dob) : `${age} yrs`}, {gender}
            </ThemedText>
            {dob ? (
              <>
                <ThemedText variant="caption" color={theme.colors.borderDark}>•</ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  DOB: {dob}
                </ThemedText>
              </>
            ) : null}
            {chiefComplaint ? (
              <>
                <ThemedText variant="caption" color={theme.colors.borderDark}>•</ThemedText>
                <ThemedText variant="caption" color={theme.colors.urgentText} numberOfLines={1}>
                  CC: {chiefComplaint}
                </ThemedText>
              </>
            ) : null}
          </View>
        </View>

        {/* Right Action / Expand toggle */}
        <View style={styles.topActionsRow}>
          {onPressEdit ? (
            <Pressable
              onPress={onPressEdit}
              style={styles.editDemographicsBtn}
              accessibilityRole="button"
              accessibilityLabel="Edit Demographics"
            >
              <Icon name="edit" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="captionBold" color={theme.colors.primary}>
                Edit Demographics
              </ThemedText>
            </Pressable>
          ) : null}
          {onPressRefresh ? (
            <Pressable
              onPress={handleRefresh}
              style={styles.actionIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Refresh patient chart"
              disabled={isRefreshing}
            >
              <Icon
                name="refresh"
                size={theme.sizes.iconSm}
                color={isRefreshing ? theme.colors.primary : theme.colors.textSecondary}
                spin={isRefreshing}
              />
            </Pressable>
          ) : null}
          <Pressable onPress={() => setCollapsed(!collapsed)} style={styles.toggleCollapseBtn}>
            <ThemedText variant="caption" color={theme.colors.primaryDark} style={{ fontWeight: '600' }}>
              {collapsed ? 'View Full Spine' : 'Compact'}
            </ThemedText>
            <Icon
              name={collapsed ? 'chevronDown' : 'chevronUp'}
              size={theme.sizes.iconSm}
              color={theme.colors.primaryDark}
            />
          </Pressable>
        </View>
      </View>

      {/* ZONE 2 & 3: STATUTORY BADGES STRIP */}
      <View style={styles.badgesStrip}>
        {/* PhilHealth PIN & Status */}
        {pin ? (
          <Badge
            label={`PIN: ${formatPhilHealthPin(pin)}`}
            variant="routine"
            size="sm"
            icon="yakap"
          />
        ) : (
          <Badge label="Non-PhilHealth" variant="neutral" size="sm" />
        )}
        {memberStatus ? (
          <Badge label={memberStatus} variant="routine" size="sm" />
        ) : null}
        {caseNo ? (
          <Badge label={`Case: ${caseNo}`} variant="purple" size="sm" />
        ) : null}
        {atc ? (
          <Badge label={`ATC: ${atc}`} variant="purple" size="sm" />
        ) : null}

        {/* Senior / PWD */}
        {isSenior ? (
          <Badge
            label={seniorId ? `Senior (${seniorId})` : 'Senior (RA 9994)'}
            variant="info"
            size="sm"
          />
        ) : null}
        {isPwd ? (
          <Badge
            label={pwdId ? `PWD (${pwdId})` : 'PWD (RA 10754)'}
            variant="info"
            size="sm"
            icon="accessibility"
          />
        ) : null}
        {isMobilityAssist(alertsStr) && !isPwd ? (
          <Badge
            label="Wheelchair Assist"
            variant="info"
            size="sm"
            icon="accessibility"
          />
        ) : null}
        {/hearing\s+impaired/i.test(alertsStr) ? (
          <Badge
            label="Hearing Impaired"
            variant="warning"
            size="sm"
            icon="info"
          />
        ) : null}
        {/visually\s+impaired/i.test(alertsStr) ? (
          <Badge
            label="Visually Impaired"
            variant="warning"
            size="sm"
            icon="eye"
          />
        ) : null}
      </View>

      {/* ========================================================================= */}
      {/* ZONE 4: HIGH-URGENCY RED ALERT BANNERS (ANAPHYLAXIS, FALL RISK, PREGNANCY) */}
      {/* ========================================================================= */}
      {redAlerts.length > 0 ? (
        <View style={styles.redAlertsContainer}>
          {redAlerts.map((alert, idx) => (
            <View key={idx} style={styles.redAlertBanner}>
              <Icon name={alert.icon} size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              <View style={styles.alertTextCol}>
                <ThemedText variant="caption" style={styles.redAlertTitle}>
                  {alert.title}
                </ThemedText>
                {alert.subtitle ? (
                  <ThemedText variant="caption" style={styles.redAlertSubtitle}>
                    {alert.subtitle}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* If collapsed, omit the expanded details */}
      {collapsed ? null : (
        <>
          {/* ========================================================================= */}
          {/* ZONE 5: LATEST TRIAGE VITALS & WHO PEDIATRIC Z-SCORES                     */}
          {/* ========================================================================= */}
          <View style={styles.vitalsSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <Icon name="heartPulse" size={theme.sizes.iconSm} color={theme.colors.primary} />
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  Latest Triage Vitals
                </ThemedText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                {latestVitals?.recordedAt ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {new Date(latestVitals.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {latestVitals.recordedByNurseName ? ` by ${latestVitals.recordedByNurseName}` : ''}
                  </ThemedText>
                ) : null}
                {onPressRecordVitals ? (
                  <Pressable
                    onPress={onPressRecordVitals}
                    style={styles.editDemographicsBtn}
                    accessibilityRole="button"
                    accessibilityLabel={latestVitals ? 'Update Vitals' : 'Record Vitals'}
                  >
                    <Icon name="activity" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    <ThemedText variant="captionBold" color={theme.colors.primary}>
                      {latestVitals ? 'Update Vitals' : 'Record Vitals'}
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {latestVitals ? (
              <View style={styles.vitalsGrid}>
                {/* Blood Pressure */}
                <View
                  style={[
                    styles.vitalTile,
                    bpEval.isAbnormal && bpEval.level === 'emergency' && styles.vitalTile_emergency,
                    bpEval.isAbnormal && bpEval.level === 'urgent' && styles.vitalTile_urgent,
                    bpEval.isAbnormal && bpEval.level === 'warning' && styles.vitalTile_warning,
                  ]}
                >
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>BP (mmHg)</ThemedText>
                  <ThemedText
                    variant="bodyBold"
                    style={[
                      styles.vitalValue,
                      bpEval.isAbnormal && bpEval.level === 'emergency' && styles.vitalText_emergency,
                      bpEval.isAbnormal && bpEval.level === 'urgent' && styles.vitalText_urgent,
                      bpEval.isAbnormal && bpEval.level === 'warning' && styles.vitalText_warning,
                    ]}
                  >
                    {latestVitals.systolicBp && latestVitals.diastolicBp
                      ? `${latestVitals.systolicBp}/${latestVitals.diastolicBp}`
                      : '—'}
                  </ThemedText>
                  {bpEval.isAbnormal ? (
                    <ThemedText
                      variant="caption"
                      style={[
                        bpEval.level === 'emergency' && styles.vitalText_emergency,
                        bpEval.level === 'urgent' && styles.vitalText_urgent,
                        bpEval.level === 'warning' && styles.vitalText_warning,
                      ]}
                    >
                      {bpEval.label}
                    </ThemedText>
                  ) : null}
                </View>

                {/* Heart Rate */}
                <View
                  style={[
                    styles.vitalTile,
                    hrEval.isAbnormal && hrEval.level === 'emergency' && styles.vitalTile_emergency,
                    hrEval.isAbnormal && hrEval.level === 'urgent' && styles.vitalTile_urgent,
                    hrEval.isAbnormal && hrEval.level === 'warning' && styles.vitalTile_warning,
                  ]}
                >
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>HR (bpm)</ThemedText>
                  <ThemedText
                    variant="bodyBold"
                    style={[
                      styles.vitalValue,
                      hrEval.isAbnormal && hrEval.level === 'emergency' && styles.vitalText_emergency,
                      hrEval.isAbnormal && hrEval.level === 'urgent' && styles.vitalText_urgent,
                      hrEval.isAbnormal && hrEval.level === 'warning' && styles.vitalText_warning,
                    ]}
                  >
                    {hrValue !== undefined ? hrValue : '—'}
                  </ThemedText>
                  {hrEval.isAbnormal ? (
                    <ThemedText
                      variant="caption"
                      style={[
                        hrEval.level === 'emergency' && styles.vitalText_emergency,
                        hrEval.level === 'urgent' && styles.vitalText_urgent,
                        hrEval.level === 'warning' && styles.vitalText_warning,
                      ]}
                    >
                      {hrEval.label}
                    </ThemedText>
                  ) : null}
                </View>

                {/* Respiratory Rate */}
                <View
                  style={[
                    styles.vitalTile,
                    rrEval.isAbnormal && rrEval.level === 'emergency' && styles.vitalTile_emergency,
                    rrEval.isAbnormal && rrEval.level === 'urgent' && styles.vitalTile_urgent,
                    rrEval.isAbnormal && rrEval.level === 'warning' && styles.vitalTile_warning,
                  ]}
                >
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>RR (cpm)</ThemedText>
                  <ThemedText
                    variant="bodyBold"
                    style={[
                      styles.vitalValue,
                      rrEval.isAbnormal && rrEval.level === 'emergency' && styles.vitalText_emergency,
                      rrEval.isAbnormal && rrEval.level === 'urgent' && styles.vitalText_urgent,
                      rrEval.isAbnormal && rrEval.level === 'warning' && styles.vitalText_warning,
                    ]}
                  >
                    {rrValue !== undefined ? rrValue : '—'}
                  </ThemedText>
                  {rrEval.isAbnormal ? (
                    <ThemedText
                      variant="caption"
                      style={[
                        rrEval.level === 'emergency' && styles.vitalText_emergency,
                        rrEval.level === 'urgent' && styles.vitalText_urgent,
                        rrEval.level === 'warning' && styles.vitalText_warning,
                      ]}
                    >
                      {rrEval.label}
                    </ThemedText>
                  ) : null}
                </View>

                {/* Temperature */}
                <View
                  style={[
                    styles.vitalTile,
                    tempEval.isAbnormal && tempEval.level === 'emergency' && styles.vitalTile_emergency,
                    tempEval.isAbnormal && tempEval.level === 'urgent' && styles.vitalTile_urgent,
                    tempEval.isAbnormal && tempEval.level === 'warning' && styles.vitalTile_warning,
                  ]}
                >
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>Temp (°C)</ThemedText>
                  <ThemedText
                    variant="bodyBold"
                    style={[
                      styles.vitalValue,
                      tempEval.isAbnormal && tempEval.level === 'emergency' && styles.vitalText_emergency,
                      tempEval.isAbnormal && tempEval.level === 'urgent' && styles.vitalText_urgent,
                      tempEval.isAbnormal && tempEval.level === 'warning' && styles.vitalText_warning,
                    ]}
                  >
                    {tempValue !== undefined ? `${tempValue}°C` : '—'}
                  </ThemedText>
                  {tempEval.isAbnormal ? (
                    <ThemedText
                      variant="caption"
                      style={[
                        tempEval.level === 'emergency' && styles.vitalText_emergency,
                        tempEval.level === 'urgent' && styles.vitalText_urgent,
                        tempEval.level === 'warning' && styles.vitalText_warning,
                      ]}
                    >
                      {tempEval.label}
                    </ThemedText>
                  ) : null}
                </View>

                {/* Oxygen Saturation */}
                <View
                  style={[
                    styles.vitalTile,
                    spo2Eval.isAbnormal && spo2Eval.level === 'emergency' && styles.vitalTile_emergency,
                    spo2Eval.isAbnormal && spo2Eval.level === 'urgent' && styles.vitalTile_urgent,
                    spo2Eval.isAbnormal && spo2Eval.level === 'warning' && styles.vitalTile_warning,
                  ]}
                >
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>SpO2 (%)</ThemedText>
                  <ThemedText
                    variant="bodyBold"
                    style={[
                      styles.vitalValue,
                      spo2Eval.isAbnormal && spo2Eval.level === 'emergency' && styles.vitalText_emergency,
                      spo2Eval.isAbnormal && spo2Eval.level === 'urgent' && styles.vitalText_urgent,
                      spo2Eval.isAbnormal && spo2Eval.level === 'warning' && styles.vitalText_warning,
                    ]}
                  >
                    {spo2Value !== undefined ? `${spo2Value}%` : '—'}
                  </ThemedText>
                  {spo2Eval.isAbnormal ? (
                    <ThemedText
                      variant="caption"
                      style={[
                        spo2Eval.level === 'emergency' && styles.vitalText_emergency,
                        spo2Eval.level === 'urgent' && styles.vitalText_urgent,
                        spo2Eval.level === 'warning' && styles.vitalText_warning,
                      ]}
                    >
                      {spo2Eval.label}
                    </ThemedText>
                  ) : null}
                </View>

                {/* Anthropometrics / BMI */}
                <View style={styles.vitalTile}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>BMI (kg/m²)</ThemedText>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {latestVitals.bmi ? `${latestVitals.bmi}` : '—'}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {latestVitals.weightKg ? `${latestVitals.weightKg} kg` : ''}
                    {latestVitals.heightCm ? ` • ${latestVitals.heightCm} cm` : ''}
                  </ThemedText>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
                <ThemedText variant="caption" color={theme.colors.textMuted} style={{ fontStyle: 'italic' }}>
                  No triage vitals recorded for today.
                </ThemedText>
              </View>
            )}

            {/* WHO Pediatric Z-Scores Sub-Strip (Children < 19 yrs) */}
            {isPediatric && latestVitals ? (
              <View style={styles.pediatricBox}>
                <View style={styles.pediatricTitleRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                    <Icon name="baby" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                    <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                      WHO Pediatric Anthropometrics & Z-Scores
                    </ThemedText>
                  </View>
                  {latestVitals.philHealthZScoreCategory ? (
                    <Badge
                      label={latestVitals.philHealthZScoreCategory}
                      variant={evaluateZScoreCategory(latestVitals.philHealthZScoreCategory)}
                      size="sm"
                    />
                  ) : null}
                </View>

                <View style={styles.pediatricPillsRow}>
                  <View style={styles.pediatricPill}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>WAZ (Weight-for-Age):</ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.text}>
                      {latestVitals.zScoreWeightForAge != null ? `${latestVitals.zScoreWeightForAge} SD` : '—'}
                    </ThemedText>
                  </View>
                  <View style={styles.pediatricPill}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>HAZ (Height-for-Age):</ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.text}>
                      {latestVitals.zScoreLengthForAge != null ? `${latestVitals.zScoreLengthForAge} SD` : '—'}
                    </ThemedText>
                  </View>
                  <View style={styles.pediatricPill}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>WHZ (Weight-for-Height):</ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.text}>
                      {latestVitals.zScoreWeightForLength != null ? `${latestVitals.zScoreWeightForLength} SD` : '—'}
                    </ThemedText>
                  </View>
                  {latestVitals.headCircumferenceCm ? (
                    <View style={styles.pediatricPill}>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>Head Circ:</ThemedText>
                      <ThemedText variant="captionBold" color={theme.colors.text}>
                        {latestVitals.headCircumferenceCm} cm
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          {/* ========================================================================= */}
          {/* ZONE 6: ACTIVE CHRONIC PROBLEM PILLS (ICD-10) & ONGOING ACTIVE MEDICATIONS */}
          {/* ========================================================================= */}
          <View style={styles.chronicAndMedsRow}>
            {/* Active Problems */}
            <View style={styles.halfPane}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ marginBottom: 4 }}>
                Active Chronic Problems (ICD-10)
              </ThemedText>
              <View style={styles.pillsWrap}>
                {activeProblems.length > 0 ? (
                  activeProblems.map((prob) => (
                    <View key={prob.id} style={styles.problemPill}>
                      <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                        {prob.icd10Code}
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.text} numberOfLines={1}>
                        {prob.problemTitle}
                      </ThemedText>
                    </View>
                  ))
                ) : (
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={{ fontStyle: 'italic' }}>
                    None recorded
                  </ThemedText>
                )}
              </View>
            </View>

            {/* Active Medications */}
            <View style={styles.halfPane}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ marginBottom: 4 }}>
                Ongoing Active Medications
              </ThemedText>
              <View style={styles.pillsWrap}>
                {activeMeds.length > 0 ? (
                  activeMeds.map((med, idx) => (
                    <View key={idx} style={styles.medicationPill}>
                      <Icon name="pill" size={12} color={theme.colors.routineText} />
                      <ThemedText variant="caption" color={theme.colors.text} numberOfLines={1}>
                        {med}
                      </ThemedText>
                    </View>
                  ))
                ) : (
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={{ fontStyle: 'italic' }}>
                    No ongoing medications recorded
                  </ThemedText>
                )}
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  spineContainer: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  demographicsGroup: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  patientName: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  actionIconBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  editDemographicsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  toggleCollapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
  },
  badgesStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  redAlertsContainer: {
    marginTop: theme.spacing.sm,
    gap: 6,
  },
  redAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  alertTextCol: {
    flex: 1,
  },
  redAlertTitle: {
    color: theme.colors.emergencyText,
    fontWeight: '700',
  },
  redAlertSubtitle: {
    color: theme.colors.emergencyText,
  },
  vitalsSection: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  vitalTile: {
    flex: 1,
    minWidth: 85,
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  vitalTile_warning: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  vitalTile_urgent: {
    backgroundColor: theme.colors.urgentBg,
    borderColor: theme.colors.urgentBorder,
  },
  vitalTile_emergency: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  vitalValue: {
    color: theme.colors.text,
  },
  vitalText_warning: {
    color: theme.colors.warningText,
    fontWeight: '700',
  },
  vitalText_urgent: {
    color: theme.colors.urgentText,
    fontWeight: '700',
  },
  vitalText_emergency: {
    color: theme.colors.emergencyText,
    fontWeight: '700',
  },
  pediatricBox: {
    marginTop: theme.spacing.xs,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    gap: 4,
  },
  pediatricTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pediatricPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  pediatricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radii.xs,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chronicAndMedsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  halfPane: {
    flex: 1,
    minWidth: 240,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  problemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.xs,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  medicationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.routineBorder,
    borderWidth: 1,
    borderRadius: theme.radii.xs,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
});
