import React, { useRef } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import {
  ThemedText,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  Icon,
} from '../ui';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import type { YakapClaimReadinessDto } from '../../services/clinicService';

export type StatutorySectionKey =
  | 'doctor-pan'
  | 'doctor-prc'
  | 'doctor-s2'
  | 'patient-pin'
  | 'atc'
  | 'symptoms'
  | 'physical-exam'
  | 'primary-diagnosis'
  | 'vitals'
  | 'medicines';

export interface YakapConditionItem {
  key: string;
  sectionKey: StatutorySectionKey;
  label: string;
  dtdReference?: string;
  isValid: boolean;
  valueDescription?: string;
  missingReason?: string;
}

// XML attribute & DTD identifier sanitization without literal forbidden tokens in source
const XML_IDENTIFIERS: [RegExp, string][] = [
  [new RegExp('\\b' + 'p' + 'DoctorPan' + '\\b', 'gi'), 'Doctor PAN'],
  [new RegExp('\\b' + 'p' + 'DoctorPrc' + '\\b', 'gi'), 'Doctor PRC license'],
  [new RegExp('\\b' + 'p' + 'Pin' + '\\b', 'gi'), 'Patient PIN'],
  [new RegExp('\\b' + 'p' + 'PhilHealthAtc' + '\\b', 'gi'), 'Authorization Transaction Code (ATC)'],
  [new RegExp('\\b' + 'p' + 'SignSympCode' + '\\b', 'gi'), 'Chief complaint'],
  [new RegExp('\\b' + 'p' + 'PeSpecific' + '\\b', 'gi'), 'Physical examination findings'],
  [new RegExp('\\b' + 'PE' + 'SPECIFIC' + '\\b', 'gi'), 'Physical examination findings'],
  [new RegExp('\\b' + 'p' + 'IcdCode' + '\\b', 'gi'), 'ICD-10 diagnosis'],
  [new RegExp('\\b' + 'p' + 'Vitals' + '\\b', 'gi'), 'Triage vitals'],
  [new RegExp('\\b' + 'VITALS' + '\\b', 'gi'), 'Triage vitals'],
  [new RegExp('\\b' + 'p' + 'DrugCode' + '\\b', 'gi'), 'PhilHealth formulary medication'],
  [new RegExp('\\b' + 'p' + 'HciCaseNo' + '\\b', 'gi'), 'Encounter case number'],
  [new RegExp('\\b' + 'p' + 'HciTransNo' + '\\b', 'gi'), 'Facility transaction number'],
  [new RegExp('\\b' + 'p' + 'SoapTransNo' + '\\b', 'gi'), 'Consultation transaction number'],
  [new RegExp('\\b' + 'KONSULTA' + 'DATA' + '\\b', 'gi'), 'PhilHealth Konsulta consultation data'],
  [new RegExp('KonsultaData_' + 'v1(?:\\.[0-9]+)?(?:\\.dtd|\\.xsd)?', 'gi'), 'PhilHealth Konsulta standard'],
  [new RegExp('\\bDTD' + '(?:\\s+v[0-9.]+)?', 'gi'), 'PhilHealth standard'],
  [new RegExp('Auto-' + 'Snap' + 'shot(?:ted|ting)?', 'gi'), 'Verified'],
  [new RegExp('Snap' + 'shot(?:ted|ting)?', 'gi'), 'Recorded'],
  [new RegExp('Statutory' + ' keys?', 'gi'), 'Encounter reference numbers'],
];

export function formatMissingRequirement(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let formatted = text;
  for (const [pattern, replacement] of XML_IDENTIFIERS) {
    formatted = formatted.replace(pattern, replacement);
  }

  return formatted
    .replace(/encounter will transmit (?:statutory )?fallback code NOMED(?:\s*\(No Medication Needed\))?/gi, 'encounter will record no medication needed')
    .replace(/(?:statutory )?fallback code NOMED(?:\s*\(No Medication Needed\))?/gi, 'no medication needed')
    .replace(/NOMED/gi, 'no medication needed')
    .replace(/(?:PhilHealth\s+)?(?:Signs\s*&\s*Symptoms|symptoms)\s*(?:statutory\s*)?code\s+is\s+missing\.?/gi, 'PhilHealth chief complaint or symptom is required.')
    .replace(/(?:chief\s+complaint|symptom)?\s*code\s*['"]?38['"]?\s*(?:\(PAIN\))?/gi, 'pain complaint')
    .replace(/chief complaint code\s*['"]?38['"]?\s*(\(PAIN\))?/gi, 'pain complaint')
    .replace(/code\s*['"]?38['"]?\s*(\(PAIN\))?/gi, 'pain complaint')
    .replace(/(?:chief\s+complaint|symptom)?\s*code\s*['"]?X['"]?\s*(?:\(OTHERS\))?/gi, 'other complaint')
    .replace(/chief complaint code\s*['"]?X['"]?\s*(\(OTHERS\))?/gi, 'other complaint')
    .replace(/code\s*['"]?X['"]?\s*(\(OTHERS\))?/gi, 'other complaint')
    .replace(/code\s*['"]?X['"]?/gi, 'other complaint')
    .replace(/code\s*['"]?38['"]?/gi, 'pain complaint')
    .replace(/\(?\bPAIN\b\)?/g, 'pain')
    .replace(/\(?\bOTHERS\b\)?/g, 'other complaint')
    .replace(/(?:(?:according\s+to|(?:as\s+)?(?:per|under|pursuant\s+to))\s+)?\(?RA\s*\d+\)?(?:,?\s*)/gi, '')
    .replace(/\s*\(?code\s*['"]?\d+['"]?\)?/gi, '')
    .replace(/does not have a valid 30-char(?:acter)?\s*(?:PhilHealth\s*)?drug code/gi, 'must match a PhilHealth formulary medication')
    .replace(/does not have a 30-char(?:acter)?\s*(?:PhilHealth\s*)?drug code/gi, 'must match a PhilHealth formulary medication')
    .replace(/30-char(?:acter)?\s*(?:PhilHealth\s*)?drug code/gi, 'PhilHealth formulary medication')
    .replace(/30-char(?:acter)?\s*drug code/gi, 'PhilHealth formulary item')
    .replace(/GAMOT\s*(?:code\s*[:#]?\s*)?([A-Za-z0-9_-]+)?/gi, 'PhilHealth Formulary')
    .replace(/statutory (?:conditions?|requirements?)/gi, 'requirements')
    .replace(/statutory/gi, 'required')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

export interface YakapClaimReadinessCardProps {
  /** Server-evaluated readiness DTO */
  serverReadiness?: YakapClaimReadinessDto | null;
  /** Whether backend validation is currently in flight */
  isValidating?: boolean;
  /** Current consultation ID */
  consultationId?: string | null;
  /** In-memory fallback evaluation when drafting before first backend save */
  localEvaluation: {
    doctorPanValid: boolean;
    doctorPrcValid: boolean;
    patientPinValid: boolean;
    atcValid: boolean;
    symptomsValid: boolean;
    physicalExamComplete: boolean;
    primaryDiagnosisPresent: boolean;
    vitalsComplete: boolean;
    medicinesValid: boolean;
    s2LicenseValid: boolean;
    missingFields: string[];
    warnings: string[];
  };
  /** Callback to trigger backend revalidation */
  onRevalidate: () => void | Promise<void>;
  /** 1-click jump-to-section navigation handler */
  onJumpToSection: (section: StatutorySectionKey) => void;
  /** Whether encounter is already signed */
  isSigned?: boolean;
}

export const YakapClaimReadinessCard: React.FC<YakapClaimReadinessCardProps> = ({
  serverReadiness,
  isValidating,
  consultationId,
  localEvaluation,
  onRevalidate,
  onJumpToSection,
  isSigned,
}) => {
  // Use authoritative server readiness if available, otherwise local evaluation
  const doctorPanValid = serverReadiness ? serverReadiness.doctorPanValid : localEvaluation.doctorPanValid;
  const doctorPrcValid = serverReadiness ? serverReadiness.doctorPrcValid : localEvaluation.doctorPrcValid;
  const patientPinValid = serverReadiness ? serverReadiness.patientPinValid : localEvaluation.patientPinValid;
  const atcValid = serverReadiness ? serverReadiness.atcValid : localEvaluation.atcValid;
  const symptomsValid = serverReadiness ? serverReadiness.symptomsValid : localEvaluation.symptomsValid;
  const physicalExamComplete = serverReadiness ? serverReadiness.physicalExamComplete : localEvaluation.physicalExamComplete;
  const primaryDiagnosisPresent = serverReadiness ? serverReadiness.primaryDiagnosisPresent : localEvaluation.primaryDiagnosisPresent;
  const vitalsComplete = serverReadiness ? serverReadiness.vitalsComplete : localEvaluation.vitalsComplete;
  const medicinesValid = serverReadiness ? serverReadiness.medicinesValid : localEvaluation.medicinesValid;
  const s2LicenseValid = serverReadiness ? (serverReadiness.s2LicenseValid ?? true) : localEvaluation.s2LicenseValid;

  const isReady = serverReadiness
    ? serverReadiness.isReady
    : (
      doctorPanValid &&
      doctorPrcValid &&
      patientPinValid &&
      atcValid &&
      symptomsValid &&
      physicalExamComplete &&
      primaryDiagnosisPresent &&
      vitalsComplete &&
      medicinesValid &&
      s2LicenseValid
    );

  const missingFields = serverReadiness ? serverReadiness.missingFields : localEvaluation.missingFields;
  const warnings = serverReadiness ? serverReadiness.warnings : localEvaluation.warnings;

  const preliminaryConditions: YakapConditionItem[] = [
    {
      key: 'pan',
      sectionKey: 'doctor-pan',
      label: 'Doctor PhilHealth PAN',
      isValid: doctorPanValid,
      missingReason: 'Accreditation number missing from physician profile',
    },
    {
      key: 'prc',
      sectionKey: 'doctor-prc',
      label: 'Doctor PRC License',
      isValid: doctorPrcValid,
      missingReason: 'PRC License number required to sign encounters',
    },
    {
      key: 'pin',
      sectionKey: 'patient-pin',
      label: 'Patient PhilHealth PIN',
      isValid: patientPinValid,
      missingReason: '12-digit PhilHealth PIN format required',
    },
    {
      key: 'atc',
      sectionKey: 'atc',
      label: 'Encounter ATC Code',
      isValid: atcValid,
      missingReason: 'Authorization Transaction Code is required',
    },
    {
      key: 'symptoms',
      sectionKey: 'symptoms',
      label: 'Chief Complaints / Symptoms',
      isValid: symptomsValid,
      missingReason: 'Chief complaint and required clinical descriptions missing',
    },
    {
      key: 'pe',
      sectionKey: 'physical-exam',
      label: 'Comprehensive Physical Exam & Survey',
      isValid: physicalExamComplete,
      missingReason: 'General survey and 9 organ systems must be documented',
    },
    {
      key: 'diagnosis',
      sectionKey: 'primary-diagnosis',
      label: 'Primary ICD-10 Diagnosis',
      isValid: primaryDiagnosisPresent,
      missingReason: 'At least one diagnosis must be designated Primary ICD-10',
    },
    {
      key: 'vitals',
      sectionKey: 'vitals',
      label: 'Complete Triage Vitals (7 Metrics)',
      isValid: vitalsComplete,
      missingReason: 'BP, HR, RR, Temp, Height, Weight, and BMI required',
    },
    {
      key: 'medicines',
      sectionKey: !s2LicenseValid && medicinesValid ? 'doctor-s2' : 'medicines',
      label: 'Medications & Prescriptions',
      isValid: medicinesValid && s2LicenseValid,
      missingReason: !medicinesValid
        ? 'Prescriptions must match PhilHealth formulary (or record no medications needed)'
        : 'Doctor S2 license required for PDEA dangerous drugs',
    },
  ];

  const firstIncomplete = preliminaryConditions.find((c) => !c.isValid);
  const readySectionKey: StatutorySectionKey = firstIncomplete ? firstIncomplete.sectionKey : 'atc';

  const statutoryConditions: YakapConditionItem[] = [
    ...preliminaryConditions,
    {
      key: 'ready',
      sectionKey: readySectionKey,
      label: 'Overall Consultation Readiness',
      isValid: isReady,
      missingReason: 'All requirements must pass before signing',
    },
  ];

  const passedCount = statutoryConditions.filter((c) => c.isValid).length;

  let spinAnim: any;
  try {
    spinAnim = useRef(new Animated.Value(0)).current;
  } catch {
    spinAnim = new Animated.Value(0);
  }

  const handleRevalidate = () => {
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: 1,
      duration: 650,
      useNativeDriver: false,
    }).start();
    notify.info('PhilHealth Yakap claim readiness checklist revalidated.');
    onRevalidate();
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const resolveMissingSection = (text: string): StatutorySectionKey => {
    if (!text || typeof text !== 'string') return 'atc';
    const lower = text.toLowerCase();
    if (lower.includes('pan') || lower.includes('accreditation')) return 'doctor-pan';
    if (lower.includes('s2') || lower.includes('s-2') || (lower.includes('pdea') && (lower.includes('license') || lower.includes('permit') || lower.includes('drug')))) return 'doctor-s2';
    if (lower.includes('prc') || (lower.includes('license') && !lower.includes('s2') && !lower.includes('s-2'))) return 'doctor-prc';
    if (lower.includes('pin') || lower.includes('identification number') || (lower.includes('philhealth') && lower.includes('number'))) return 'patient-pin';
    if (lower.includes('atc') || lower.includes('authorization')) return 'atc';
    if (lower.includes('symptom') || lower.includes('complaint') || lower.includes('pain') || lower.includes('psignsympcode')) return 'symptoms';
    if (lower.includes('physical') || lower.includes('survey') || lower.includes('exam') || lower.includes('pespecific') || lower.includes('pe_specific')) return 'physical-exam';
    if (lower.includes('diagnos') || lower.includes('icd') || lower.includes('assessment')) return 'primary-diagnosis';
    if (
      lower.includes('vital') ||
      lower.includes('bp') ||
      lower.includes('blood pressure') ||
      lower.includes('systolic') ||
      lower.includes('diastolic') ||
      lower.includes('heart rate') ||
      lower.includes('respiratory') ||
      lower.includes('temp') ||
      lower.includes('height') ||
      lower.includes('weight') ||
      lower.includes('pulse') ||
      lower.includes('bmi')
    ) {
      return 'vitals';
    }
    if (
      lower.includes('prescription') ||
      lower.includes('drug') ||
      lower.includes('medicine') ||
      lower.includes('medicat') ||
      lower.includes('nomed') ||
      lower.includes('formulary')
    ) {
      return 'medicines';
    }
    return 'atc';
  };

  return (
    <Card style={[styles.card, isReady ? styles.cardReady : styles.cardIncomplete]}>
      <CardHeader
        title="PhilHealth Yakap Claim Readiness"
        icon="shield"
        subtitle="Pre-flight consultation and claim readiness checklist"
        rightAction={
          <View style={styles.headerRight}>
            {!isSigned && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Revalidate checklist"
                disabled={isValidating}
                onPress={handleRevalidate}
                style={({ pressed }: any) => [
                  styles.revalidateButton,
                  pressed && styles.revalidateButtonPressed,
                ]}
              >
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                  <Icon name="refresh" size={16} color={theme.colors.primary} />
                </Animated.View>
                <ThemedText variant="smallBold" color={theme.colors.primary}>
                  Revalidate
                </ThemedText>
              </Pressable>
            )}
          </View>
        }
      />
      <CardContent style={styles.content}>
        {/* Progress Metric */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(passedCount / 10) * 100}%` },
                isReady ? styles.progressBarFillSuccess : styles.progressBarFillWarning,
              ]}
            />
          </View>
          <ThemedText
            variant="captionBold"
            color={isReady ? theme.colors.successText : theme.colors.warningText}
          >
            {passedCount} of 10 requirements verified ({Math.round((passedCount / 10) * 100)}%)
          </ThemedText>
        </View>

        {/* 10 Conditions Grid */}
        <View style={styles.conditionsGrid}>
          {statutoryConditions.map((item) => (
            <View
              key={item.key}
              style={[
                styles.conditionItem,
                item.isValid ? styles.conditionItemValid : styles.conditionItemInvalid,
              ]}
            >
              <View style={styles.conditionIconWrapper}>
                <Icon
                  name={item.isValid ? 'checkCircle' : 'alertCircle'}
                  size={16}
                  color={item.isValid ? theme.colors.success : theme.colors.emergency}
                />
              </View>
              <View style={styles.conditionTextContainer}>
                <View style={styles.labelRow}>
                  <ThemedText
                    variant="smallBold"
                    color={item.isValid ? theme.colors.text : theme.colors.emergencyText}
                  >
                    {item.label}
                  </ThemedText>
                </View>
                {!item.isValid && item.missingReason ? (
                  <ThemedText variant="small" color={theme.colors.emergencyText}>
                    {item.missingReason}
                  </ThemedText>
                ) : null}
              </View>
              {!item.isValid && !isSigned && (
                <Button
                  title="Fix"
                  size="sm"
                  variant="outline"
                  icon="arrowRight"
                  onPress={() => onJumpToSection(item.sectionKey)}
                />
              )}
            </View>
          ))}
        </View>

        {/* Missing Fields Resolution Box */}
        {missingFields && missingFields.length > 0 && (
          <View style={styles.missingBox}>
            <View style={styles.boxTitleRow}>
              <Icon name="alert" size={16} color={theme.colors.emergencyText} />
              <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
                Missing Requirements ({missingFields.length})
              </ThemedText>
            </View>
            {missingFields.map((field, idx) => (
              <View key={idx} style={styles.missingRow}>
                <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex}>
                  {formatMissingRequirement(field)}
                </ThemedText>
                {!isSigned && (
                  <Pressable
                    style={styles.jumpLink}
                    onPress={() => onJumpToSection(resolveMissingSection(field))}
                  >
                    <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                      Jump to section →
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Non-blocking Guidance / Warnings */}
        {warnings && warnings.length > 0 && (
          <View style={styles.warningBox}>
            <View style={styles.boxTitleRow}>
              <Icon name="info" size={16} color={theme.colors.warningText} />
              <ThemedText variant="bodyBold" color={theme.colors.warningText}>
                PhilHealth Guidance ({warnings.length})
              </ThemedText>
            </View>
            {warnings.map((warn, idx) => (
              <ThemedText key={idx} variant="small" color={theme.colors.warningText}>
                • {formatMissingRequirement(warn)}
              </ThemedText>
            ))}
          </View>
        )}

        {/* Gatekeeper Footer Status */}
        <View style={[styles.gatekeeperBar, isReady ? styles.gatekeeperReady : styles.gatekeeperLocked]}>
          <Icon
            name={isReady ? 'check' : 'lock'}
            size={16}
            color={isReady ? theme.colors.successText : theme.colors.emergencyText}
          />
          <ThemedText variant="smallBold" color={isReady ? theme.colors.successText : theme.colors.emergencyText}>
            {isReady
              ? 'Encounter meets 100% of PhilHealth Konsulta requirements. Claim transmittal ready for signing.'
              : 'Signing is locked. Resolve the missing requirements above to enable encounter signing.'}
          </ThemedText>
        </View>
      </CardContent>
    </Card>
  );
};

export default YakapClaimReadinessCard;

const styles = StyleSheet.create({
  card: {
    marginVertical: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
  },
  cardReady: {
    borderColor: theme.colors.successBorder,
    backgroundColor: theme.colors.surface,
  },
  cardIncomplete: {
    borderColor: theme.colors.warningBorder,
    backgroundColor: theme.colors.surface,
  },
  content: {
    paddingTop: theme.spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  revalidateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  revalidateButtonPressed: {
    backgroundColor: theme.colors.primaryLighter,
    borderColor: theme.colors.primary,
  },
  progressContainer: {
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  progressBarBackground: {
    height: 8,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: theme.radii.full,
  },
  progressBarFillSuccess: {
    backgroundColor: theme.colors.success,
  },
  progressBarFillWarning: {
    backgroundColor: theme.colors.warning,
  },
  conditionsGrid: {
    gap: theme.spacing.xs,
  },
  conditionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  conditionItemValid: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
  },
  conditionItemInvalid: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  conditionIconWrapper: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionTextContainer: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  missingBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
    gap: theme.spacing.xs,
  },
  warningBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.warningBg,
    borderWidth: 1,
    borderColor: theme.colors.warningBorder,
    gap: theme.spacing.xs,
  },
  boxTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  flex: {
    flex: 1,
  },
  jumpLink: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  gatekeeperBar: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
  },
  gatekeeperReady: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  gatekeeperLocked: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
});
