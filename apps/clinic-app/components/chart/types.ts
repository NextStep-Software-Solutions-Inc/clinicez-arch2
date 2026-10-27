import type { SegmentedOption } from '../ui/SegmentedControl';
import type { IconName } from '../ui/Icon';
import type {
  ClinicPatient,
  PatientChart,
  ClinicRecordAttachmentRecord,
  AdministerVaccinePayload,
  RecordHistoricalImmunizationPayload,
  RecordAefiPayload,
  ConsultationRecord,
} from '../../services/clinicService';

export type ChartTab =
  | 'summary'
  | 'encounters'
  | 'diagnostics'
  | 'procedures'
  | 'immunizations'
  | 'profiles'
  | 'vault'
  | 'documents'
  | 'dental';

export const CHART_TABS: SegmentedOption<ChartTab>[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'encounters', label: 'Encounters' },
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'procedures', label: 'Procedures' },
  { value: 'immunizations', label: 'Vaccines' },
  { value: 'profiles', label: 'Health Profiles' },
  { value: 'vault', label: 'Doc Vault' },
  { value: 'documents', label: 'Admin Vault' },
];

export const DENTAL_CHART_TAB: SegmentedOption<ChartTab> = {
  value: 'dental',
  label: 'Dental Chart',
};

export function getAvailableChartTabs(
  enableDentalModule?: boolean,
  hasDentalRecords?: boolean
): SegmentedOption<ChartTab>[] {
  if (enableDentalModule || hasDentalRecords) {
    return [...CHART_TABS, DENTAL_CHART_TAB];
  }
  return CHART_TABS;
}

export type ChartLayoutMode = 'modal' | 'split' | 'drawer';

export const DEFAULT_CHART_LAYOUT: ChartLayoutMode = 'modal';

export interface ChartLayoutOptionMeta {
  id: ChartLayoutMode;
  label: string;
  shortLabel: string;
  badge: string;
  icon: IconName;
  description: string;
}

export const CHART_LAYOUT_OPTIONS: readonly ChartLayoutOptionMeta[] = [
  {
    id: 'modal',
    label: 'Centered Workstation Modal',
    shortLabel: 'Modal',
    badge: 'Standard Default',
    icon: 'layoutModal',
    description: 'Expansive centered dialog with 1-click Maximize toggle. Ideal for general consultations and balanced multitasking.',
  },
  {
    id: 'split',
    label: 'Split-Pane Clinical Workstation',
    shortLabel: 'Split-Pane',
    badge: 'Institutional EMR',
    icon: 'layoutSplit',
    description: 'Dual-column layout with persistent left navigation sidebar and wide clinical reading canvas. Ideal for deep chart review and specialist clinics.',
  },
  {
    id: 'drawer',
    label: 'Slide-Over Focus Drawer',
    shortLabel: 'Drawer',
    badge: 'Fast-Paced Triage',
    icon: 'layoutDrawer',
    description: 'Right-anchored offcanvas sheet occupying 75% screen width. Keeps the patient queue visible in peripheral view. Ideal for triage and front desk.',
  },
] as const;

/**
 * Standard props passed to each layout implementation.
 * Ensures strict decoupling and zero logic bleed across layout components.
 */
export interface ChartLayoutProps {
  patient: ClinicPatient | null;
  patientChart: PatientChart | null;
  loadingChart?: boolean;
  chartError?: string | null;
  patientAttachments?: ClinicRecordAttachmentRecord[];
  activeTab: ChartTab;
  onTabChange: (tab: ChartTab) => void;
  onClose: () => void;
  onRefreshChart?: () => void | Promise<void>;
  onEditDemographics: () => void;

  // In-modal quick layout switcher
  currentLayout: ChartLayoutMode;
  onSwitchLayout: (layout: ChartLayoutMode) => void;

  // Clinical Tab Action Handlers
  onViewPrescriptionSlip?: (consultation: ConsultationRecord) => void;
  onOpenExternalDispense?: (consultation: ConsultationRecord) => void;
  onViewLabSlip?: (orderId: string) => void;
  onAttachExternalResult?: (orderId: string) => void;
  onUploadDocument?: () => void;
  onVerifyAttachment?: (attachmentId: string, isApproved: boolean, rejectionReason?: string) => Promise<void>;
  onDownloadAttachment?: (attachmentId: string) => Promise<void>;
  onAdministerVaccine?: (payload: AdministerVaccinePayload) => Promise<void>;
  onRecordHistoricalVaccine?: (payload: RecordHistoricalImmunizationPayload) => Promise<void>;
  onRecordAefi?: (immId: string, payload: RecordAefiPayload) => Promise<void>;
  availableTabs?: SegmentedOption<ChartTab>[];
  focusToothNumber?: number;
  onOrderDentalProcedure?: (toothNumber: number, toothSurface?: string) => void;
  onVoidDentalCondition?: (toothNumber: number, recordId: string, reason?: string) => void | Promise<void>;
  onOrderProcedure?: () => void;
  onIntakeSpecimen?: () => void;
  queueItemId?: string | null;
}

export interface PatientChartModalProps {
  visible: boolean;
  patient: ClinicPatient | null;
  patientChart: PatientChart | null;
  loadingChart?: boolean;
  chartError?: string | null;
  patientAttachments?: ClinicRecordAttachmentRecord[];
  initialTab?: ChartTab;
  activeTab?: ChartTab;
  onTabChange?: (tab: ChartTab) => void;
  onClose: () => void;
  onRefreshChart?: () => void | Promise<void>;
  onPatientUpdated?: (updated: ClinicPatient) => void;
  onPressEdit?: () => void;
  /** Override layout mode; falls back to clinic setting or 'modal' */
  preferredLayout?: ChartLayoutMode;
  availableTabs?: SegmentedOption<ChartTab>[];
  focusToothNumber?: number;
  onOrderDentalProcedure?: (toothNumber: number, toothSurface?: string) => void;
  onVoidDentalCondition?: (toothNumber: number, recordId: string, reason?: string) => void | Promise<void>;
  onOrderProcedure?: () => void;
  onIntakeSpecimen?: () => void;
  queueItemId?: string | null;

  // Tab Action Handlers
  onViewPrescriptionSlip?: (consultation: ConsultationRecord) => void;
  onOpenExternalDispense?: (consultation: ConsultationRecord) => void;
  onViewLabSlip?: (orderId: string) => void;
  onAttachExternalResult?: (orderId: string) => void;
  onUploadDocument?: () => void;
  onVerifyAttachment?: (attachmentId: string, isApproved: boolean, rejectionReason?: string) => Promise<void>;
  onDownloadAttachment?: (attachmentId: string) => Promise<void>;
  onAdministerVaccine?: (payload: AdministerVaccinePayload) => Promise<void>;
  onRecordHistoricalVaccine?: (payload: RecordHistoricalImmunizationPayload) => Promise<void>;
  onRecordAefi?: (immId: string, payload: RecordAefiPayload) => Promise<void>;
}
