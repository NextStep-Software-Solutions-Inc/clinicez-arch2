export {
  default as DebouncedDuplicateChecker,
  type DebouncedDuplicateCheckerProps,
} from './DebouncedDuplicateChecker';

export {
  default as DuplicatePatientWarningModal,
  type DuplicatePatientWarningModalProps,
} from './DuplicatePatientWarningModal';

export {
  default as StructuredAllergyIntakeModal,
  AllergyPillList,
  type CreateAllergyRequest,
  type CreateAllergyPayload,
  type AllergyCategory,
  type AllergySeverity,
  type StructuredAllergyIntakeModalProps,
  type AllergyPillListProps,
} from './StructuredAllergyIntakeModal';

export {
  default as StructuredMedicalHistoryModal,
  MedicalHistoryPillList,
  type MedicalHistoryItem,
  type MedicalHistoryPillListProps,
  type StructuredMedicalHistoryModalProps,
  PHILHEALTH_MDISEASES_CONDITIONS,
  PHILHEALTH_QUICK_CONDITIONS,
  formatMedicalHistoriesSummary,
  parseChronicConditionsStringToStructured,
} from './StructuredMedicalHistoryModal';

export {
  default as ClinicalAlertsSection,
  type ClinicalAlertsSectionProps,
  CLINICAL_ALERT_PRESETS,
  type AlertPreset,
  isPresetActive,
  toggleAlertPreset,
} from './ClinicalAlertsSection';

export {
  computePatientLocation,
  type PatientLocationFields,
} from './patientLocation';

export {
  getYakapEnlistments,
  getActiveYakapEnlistment,
  isYakapEnlistmentActive,
  needsYakapRenewal,
  createAnnualRenewal,
  recordAnnualRenewal,
  formatYakapStatusBadge,
  formatYakapSourceLabel,
  toIsoDateString,
  type YakapEnlistmentEntry,
  type YakapEnlistmentStatus,
  type YakapEnlistmentSource,
  type AnnualRenewalOptions,
} from './yakapEnlistment';

export {
  default as YakapEnlistmentSection,
  type YakapEnlistmentSectionProps,
} from './YakapEnlistmentSection';

export {
  default as GuardianSection,
  createEmptyGuardianDraft,
  isMinorFromDob,
  hasAnyGuardianInput,
  normalizeGuardianPayload,
  validateGuardianDraft,
  type GuardianSectionProps,
} from './GuardianSection';

export {
  default as ConsultationTypeModal,
  type ConsultationTypeModalProps,
} from './ConsultationTypeModal';

export {
  canUseGuardianAsSponsor,
  mapGuardianRelationshipToDependent,
  buildPrincipalSponsorFromGuardian,
  type GuardianSponsorPrefill,
} from './memberType';

export {
  default as IssueMedicalCertificateModal,
  type IssueMedicalCertificateModalProps,
  type FitnessStatus,
} from './IssueMedicalCertificateModal';

export {
  default as IssueReferralLetterModal,
  type IssueReferralLetterModalProps,
  type ReferralUrgency,
} from './IssueReferralLetterModal';
