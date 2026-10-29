export {
  default as DebouncedDuplicateChecker,
  DebouncedDuplicateCheckerProps,
} from './DebouncedDuplicateChecker';

export {
  default as DuplicatePatientWarningModal,
  DuplicatePatientWarningModalProps,
} from './DuplicatePatientWarningModal';

export {
  default as StructuredAllergyIntakeModal,
  AllergyPillList,
  CreateAllergyRequest,
  CreateAllergyPayload,
  AllergyCategory,
  AllergySeverity,
  StructuredAllergyIntakeModalProps,
  AllergyPillListProps,
} from './StructuredAllergyIntakeModal';

export {
  default as StructuredMedicalHistoryModal,
  MedicalHistoryPillList,
  MedicalHistoryItem,
  MedicalHistoryPillListProps,
  StructuredMedicalHistoryModalProps,
  PHILHEALTH_MDISEASES_CONDITIONS,
  PHILHEALTH_QUICK_CONDITIONS,
  formatMedicalHistoriesSummary,
  parseChronicConditionsStringToStructured,
} from './StructuredMedicalHistoryModal';

export {
  default as ClinicalAlertsSection,
  ClinicalAlertsSectionProps,
  CLINICAL_ALERT_PRESETS,
  AlertPreset,
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
