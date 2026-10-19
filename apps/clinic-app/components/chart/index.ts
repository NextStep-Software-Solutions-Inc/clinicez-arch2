export {
  default as PatientSummarySpine,
  evaluateBloodPressure,
  evaluateHeartRate,
  evaluateRespiratoryRate,
  evaluateTemperature,
  evaluateOxygenSat,
  evaluateZScoreCategory,
  formatPhilHealthPin,
} from './PatientSummarySpine';
export type { PatientSummarySpineProps, VitalsThresholdResult, UrgencyLevel } from './PatientSummarySpine';

export { default as PatientChartModal, CHART_TABS } from './PatientChartModal';
export type { PatientChartModalProps, ChartTab, ChartLayoutMode } from './types';
export {
  CHART_LAYOUT_OPTIONS,
  DEFAULT_CHART_LAYOUT,
  type ChartLayoutProps,
  type ChartLayoutOptionMeta,
} from './types';

export {
  CenteredModalChartLayout,
  SplitPaneChartLayout,
  SlideOverDrawerChartLayout,
} from './layouts';

export { default as ChartLayoutSwitcher } from './ChartLayoutSwitcher';

export { default as ExecutiveSummaryTab } from './ExecutiveSummaryTab';
export type { ExecutiveSummaryTabProps } from './ExecutiveSummaryTab';

export { default as EncountersTimelineTab } from './EncountersTimelineTab';
export type { EncountersTimelineTabProps } from './EncountersTimelineTab';

export { default as DiagnosticLabTab, lookupStatutoryDiagnosticCode, STATUTORY_DIAGNOSTIC_CODES } from './DiagnosticLabTab';
export type { DiagnosticLabTabProps } from './DiagnosticLabTab';

export { default as NursingProceduresTab, lookupStatutoryManagementCode, STATUTORY_MANAGEMENT_CODES } from './NursingProceduresTab';
export type { NursingProceduresTabProps } from './NursingProceduresTab';

export { default as StatutoryImmunizationsTab, PHILHEALTH_STATUTORY_VACCINES } from './StatutoryImmunizationsTab';
export type { StatutoryImmunizationsTabProps } from './StatutoryImmunizationsTab';

export { default as HealthProfilesTab } from './HealthProfilesTab';
export type { HealthProfilesTabProps, ProfileSubTab } from './HealthProfilesTab';

export { default as ExternalDocumentVaultTab, PHILHEALTH_CHEST_XRAY_FINDINGS, PHILHEALTH_CHEST_XRAY_OBSERVATIONS } from './ExternalDocumentVaultTab';
export type { ExternalDocumentVaultTabProps } from './ExternalDocumentVaultTab';

// Preserved for backward-compatibility
export { default as ClinicalHistoryTab } from './ClinicalHistoryTab';
export { default as LifestyleSocialTab } from './LifestyleSocialTab';
export { default as ReproductiveHealthTab } from './ReproductiveHealthTab';
export { default as CardiometabolicRiskTab } from './CardiometabolicRiskTab';

export { default as AdministerVaccineModal } from './AdministerVaccineModal';
export type { AdministerVaccineModalProps } from './AdministerVaccineModal';

export { default as HistoricalVaccineModal } from './HistoricalVaccineModal';
export type { HistoricalVaccineModalProps } from './HistoricalVaccineModal';

export { default as AttachExternalDocumentModal } from './AttachExternalDocumentModal';
export type { AttachExternalDocumentModalProps } from './AttachExternalDocumentModal';

export {
  default as OrganSystemsExamSection,
  OrganSystemRow,
  ORGAN_SYSTEMS,
  DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
} from './OrganSystemsExamSection';
export type {
  OrganSystemsExamSectionProps,
  OrganSystemRowProps,
  OrganSystemsExamValues,
  OrganSystemDef,
} from './OrganSystemsExamSection';
