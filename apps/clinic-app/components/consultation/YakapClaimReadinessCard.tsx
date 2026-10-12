import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
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
  dtdReference: string;
  isValid: boolean;
  valueDescription?: string;
  missingReason?: string;
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

  const statutoryConditions: YakapConditionItem[] = [
    {
      key: 'pan',
      sectionKey: 'doctor-pan',
      label: 'Doctor PhilHealth PAN',
      dtdReference: 'pDoctorPan',
      isValid: doctorPanValid,
      missingReason: 'Accreditation number missing from physician profile',
    },
    {
      key: 'prc',
      sectionKey: 'doctor-prc',
      label: 'Doctor PRC License',
      dtdReference: 'pDoctorPrc',
      isValid: doctorPrcValid,
      missingReason: 'PRC License number required to sign encounters',
    },
    {
      key: 'pin',
      sectionKey: 'patient-pin',
      label: 'Patient PhilHealth PIN',
      dtdReference: 'pPin',
      isValid: patientPinValid,
      missingReason: '12-digit PhilHealth PIN format required (RA 11223)',
    },
    {
      key: 'atc',
      sectionKey: 'atc',
      label: 'Encounter ATC Code',
      dtdReference: 'pPhilHealthAtc',
      isValid: atcValid,
      missingReason: 'Authorization Transaction Code is required',
    },
    {
      key: 'symptoms',
      sectionKey: 'symptoms',
      label: 'Statutory Symptoms (lib_signs_symptoms)',
      dtdReference: 'pSignSympCode',
      isValid: symptomsValid,
      missingReason: 'Chief complaint code and required descriptions missing',
    },
    {
      key: 'pe',
      sectionKey: 'physical-exam',
      label: '9-System Physical Exam & Survey',
      dtdReference: 'PESPECIFIC',
      isValid: physicalExamComplete,
      missingReason: 'General survey and 9 organ systems must be documented',
    },
    {
      key: 'diagnosis',
      sectionKey: 'primary-diagnosis',
      label: 'Primary ICD-10 Diagnosis',
      dtdReference: 'pIcdCode',
      isValid: primaryDiagnosisPresent,
      missingReason: 'At least one diagnosis must be designated Primary ICD-10',
    },
    {
      key: 'vitals',
      sectionKey: 'vitals',
      label: 'Complete Triage Vitals (7 Metrics)',
      dtdReference: 'VITALS',
      isValid: vitalsComplete,
      missingReason: 'BP, HR, RR, Temp, Height, Weight, and BMI required',
    },
    {
      key: 'medicines',
      sectionKey: 'medicines',
      label: 'Medicines & Drug Codes (or NOMED)',
      dtdReference: 'pDrugCode',
      isValid: medicinesValid && s2LicenseValid,
      missingReason: !medicinesValid
        ? 'Prescriptions must have 30-char drug code (or NOMED fallback)'
        : 'Doctor S2 license required for PDEA dangerous drugs',
    },
    {
      key: 'ready',
      sectionKey: 'atc',
      label: 'Overall DTD v1.14 Compliance',
      dtdReference: 'KONSULTADATA',
      isValid: isReady,
      missingReason: 'All 9 statutory prerequisites must pass before signing',
    },
  ];

  const passedCount = statutoryConditions.filter((c) => c.isValid).length;

  const resolveMissingSection = (text: string): StatutorySectionKey => {
    const lower = text.toLowerCase();
    if (lower.includes('pan')) return 'doctor-pan';
    if (lower.includes('prc')) return 'doctor-prc';
    if (lower.includes('s2')) return 'doctor-s2';
    if (lower.includes('pin')) return 'patient-pin';
    if (lower.includes('atc')) return 'atc';
    if (lower.includes('symptom') || lower.includes('complaint') || lower.includes('pain')) return 'symptoms';
    if (lower.includes('physical') || lower.includes('survey') || lower.includes('exam')) return 'physical-exam';
    if (lower.includes('diagnos') || lower.includes('icd')) return 'primary-diagnosis';
    if (lower.includes('vital') || lower.includes('bp') || lower.includes('heart rate') || lower.includes('respiratory')) return 'vitals';
    if (lower.includes('prescription') || lower.includes('drug') || lower.includes('medicine')) return 'medicines';
    return 'atc';
  };

  return (
    <Card style={[styles.card, isReady ? styles.cardReady : styles.cardIncomplete]}>
      <CardHeader
        title="PhilHealth Yakap Claim Readiness"
        icon="shield"
        subtitle="Pre-flight compliance validator against KonsultaData_v1.14.dtd"
        rightAction={
          <View style={styles.headerRight}>
            <Badge
              label={isReady ? '10/10 Claim Ready' : `${passedCount}/10 Statutory Checklist`}
              variant={isReady ? 'success' : 'emergency'}
              size="md"
            />
            {!isSigned && (
              <Button
                title="Revalidate"
                icon="refresh"
                size="sm"
                variant="ghost"
                loading={isValidating}
                onPress={onRevalidate}
              />
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
            {passedCount} of 10 statutory conditions verified ({Math.round((passedCount / 10) * 100)}%)
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
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    [{item.dtdReference}]
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
                Missing Statutory Requirements ({missingFields.length})
              </ThemedText>
            </View>
            {missingFields.map((field, idx) => (
              <View key={idx} style={styles.missingRow}>
                <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex}>
                  {field}
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
                PhilHealth Statutory Guidance ({warnings.length})
              </ThemedText>
            </View>
            {warnings.map((warn, idx) => (
              <ThemedText key={idx} variant="small" color={theme.colors.warningText}>
                • {warn}
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
              : 'Signing is locked. Resolve the missing statutory conditions above to enable encounter signing.'}
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
