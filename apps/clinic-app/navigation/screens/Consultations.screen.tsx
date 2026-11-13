import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  TextInput,
} from 'react-native';
import { Alert, notify } from '@utils/feedback';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ThemedText,
  Badge,
  BadgeVariant,
  Button,
  Input,
  Card,
  CardHeader,
  CardContent,
  Icon,
  EmptyState,
  ErrorState,
  SkeletonList,
  Modal,
  SegmentedControl,
  type SegmentedOption,
} from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { LabOrderStageChip } from '../../components/interop/InteropBadges';
import PrescriptionSlipModal from '../../components/PrescriptionSlipModal';
import RecordExternalDispenseModal from '../../components/RecordExternalDispenseModal';
import {
  PatientSummarySpine,
  reconcileChartWithPatient,
  ExecutiveSummaryTab,
  EncountersTimelineTab,
  DiagnosticLabTab,
  NursingProceduresTab,
  StatutoryImmunizationsTab,
  HealthProfilesTab,
  ExternalDocumentVaultTab,
  AdministrativeDocumentsTab,
  AttachExternalDocumentModal,
  DentalChartTab,
  CHART_TAB_LABELS,
  pushChartTabHistory,
  popChartTabHistory,
} from '../../components/chart';
import type {
  DentalToothRecord,
  VisitWorkflowMode,
  EncounterReviewOfSystemsItemDto,
  EncounterObGyneExamDto,
  EncounterPediatricMilestoneDto,
  EncounterAdolescentAssessmentDto,
  EncounterHeadsssDomainAssessmentDto,
  PatientBpMonitoringLogDto,
  RosCategoryCode,
  CreateConsultationRequest,
  ConsultationRecord,
  DraftDiagnosticOrderDto,
  DraftProcedureOrderDto,
  DraftDentalToothDto,
  ConsultationDraftWorkspaceDto,
} from '../../services/clinicService';
import EditPatientModal from '../../components/patient/EditPatientModal';
import { formatLongAge } from '../../utils/age';
import { getSessionItem, setSessionItem, getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import { usePersistedTab } from '../../hooks/usePersistedTab';
import {
  InlinePhysicalExamCard,
  DEFAULT_PHYSICAL_EXAM_NORMAL,
  PhysicalExamFindings,
  YakapClaimReadinessCard,
  StatutorySectionKey,
  RecordVitalsModal,
  EditVitalsModal,
  OrderCatalogSearchModal,
  OrderCatalogItemPayload,
  InlineDentalChartCard,
  DentalToothState,
  WorkflowModeSelector,
  type DraftSaveStatus,
  NursePreAssessmentCard,
  ReviewOfSystemsChecklist,
  SpecificEncounterFormsCard,
  PlanManagementCard,
  DEFAULT_YAKAP_PLAN_MANAGEMENT,
  YakapPlanManagementState,
  hydratePlanManagementFromEncounter,
  buildPlanManagementPayload,
  to1NFFindings,
  from1NFFindings,
  RosCategorySelectorSection,
  normalizeRosCategoryCode,
  normalizeRosCategoryList,
  getRosShortLabel,
  parseBooleanRouteParam,
  formatDraftSavedTimestamp,
  extractStagedDentalTeethForDraft,
  buildConsultationDraftPayload,
  rehydrateEncounterPlanManagementWithWorkspace,
  validateRxClinicDispensedQuantity,
  saveLocalConsultationDraft,
  readLocalConsultationDraft,
  clearLocalConsultationDraft,
  shouldOverlayLocalConsultationDraft,
  mergeConsultationRecordWithLocalDraft,
  type BuildConsultationDraftPayloadInput,
  HOME_INSTRUCTION_PRESETS,
  toggleHomeInstructionPreset,
  type HomeInstructionPreset,
} from '../../components/consultation';
import {
  normalizeTeethToMultiRecord,
  resolveToothEffectiveState,
  voidConditionOnTooth,
} from '../../components/dental';
import { usePhilHealthCatalog, usePhilHealthCatalogSearch } from '@utils/usePhilHealthCatalog';
import { formatDispenseFormLabel, parseMedicineSelection } from '@utils/medicineParser';
import { syncSubjectiveWithToggledSymptoms } from '@utils/subjectiveNarrative';
import type { PhilHealthCatalogItem } from '@services/philHealthCatalogService';
import { useClinic } from '../../context/ClinicContext';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import { openDocument, openDocumentBlob } from '../../services/documentOpener';
import {
  clinicService,
  computeScopedStations,
  getManilaTodayStr,
  formatClinicDate,
  formatClinicTime,
  isPatientVisibleToStaff,
  resolveCallToRoom,
  PatientQueueItem,
  QueueStatus,
  QueueView,
  YakapClaimReadinessDto,
  ClinicalProcedureRecord,
  TriageVitals,
  Icd10Code,
  MedicalCertificateRecord,
  ReferralLetterRecord,
  PrescriptionSlipData,
  ClinicLabOrderRecord,
  ClinicPatient,
  PatientChart,
  CdsAlert,
  CdsAlertSeverity,
  ClinicServiceItem,
  CreateInvoiceRequest,
  DiscountType,
} from '../../services/clinicService';
import {
  type PrintLetterhead,
} from '../../utils/printHelper';

interface LocalPrescription {
  id: string;
  genericName: string;
  dosage: string;
  form: string;
  sig: string;
  quantity: number;
  durationDays?: number;
  isDangerousDrug: boolean;
  philHealthDrugCode?: string;
  clinicDispensedQuantity?: number;
  rosCategory?: RosCategoryCode | string;
}

interface LocalDiagnosis {
  icd10Code: string;
  description: string;
  isPrimary: boolean;
}

export interface LocalLabOrder {
  serviceItemId?: string;
  code?: string;
  name: string;
  category: string;
  standardPrice: number;
  philHealthCode?: string;
  fulfillmentMode: 'in_house' | 'outside';
  instructions?: string;
}

export interface LocalProcedureOrder {
  serviceItemId?: string;
  code?: string;
  name: string;
  category: string;
  standardPrice: number;
  instructions?: string;
  roomId?: string;
  roomName?: string;
  targetRoomId?: string;
  targetRoomName?: string;
  status?: 'draft' | 'sent_to_room' | string;
  sentToRoomId?: string;
  sentToRoomName?: string;
  sentAt?: string;
  isHandedOff?: boolean;
  handedOffAt?: string;
  toothNumber?: number;
  toothSurface?: string;
  procedureId?: string;
}

export interface EditingOrderItemState {
  type: 'lab' | 'procedure';
  name: string;
  category: string;
  standardPrice: number;
  instructions: string;
}

const IN_HOUSE_RAPID_TEST_REGEX = /fingerstick|ecg|dipstick|rapid|rbs|urinalysis/i;

export interface StatutorySymptom {
  code: string;
  name: string;
  description: string;
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

/** The PhilHealth library names its "pain" and "others" entries by description; their codes come from the catalog. */
const isCatalogTerm = (item: StatutorySymptom, term: string) => item.name.toLowerCase() === term;
const FITNESS_OPTIONS = [
  { value: 'FitToWork', label: 'Fit to work' },
  { value: 'UnfitToWork', label: 'Unfit to work' },
  { value: 'FitToSchool', label: 'Fit to school' },
  { value: 'LightDuty', label: 'Light duty' },
];

const REFERRAL_URGENCIES = ['Routine', 'Urgent', 'Emergency'];

/** "ResultsReceived" -> "Results Received" */
const humanize = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2');

const formatDate = (iso?: string) => {
  if (!iso) return '';
  return formatClinicDate(iso, { fallback: '' });
};

const priorityVariant = (priority: string): BadgeVariant =>
  priority === 'Emergency' ? 'emergency' : priority === 'Urgent' ? 'urgent' : 'routine';

const severityTone = (severity: CdsAlertSeverity) => {
  switch (severity) {
    case 'Critical':
      return { variant: 'emergency' as BadgeVariant, bg: theme.colors.emergencySubtle, border: theme.colors.emergencyBorder };
    case 'Major':
      return { variant: 'urgent' as BadgeVariant, bg: theme.colors.urgentBg, border: theme.colors.urgentBorder };
    case 'Moderate':
      return { variant: 'warning' as BadgeVariant, bg: theme.colors.warningBg, border: theme.colors.warningBorder };
    default:
      return { variant: 'info' as BadgeVariant, bg: theme.colors.infoBg, border: theme.colors.infoBorder };
  }
};

/** Critical findings arrive either as plain text or as a JSON array of analyte results. */
function formatCriticalFindings(order: ClinicLabOrderRecord): string | undefined {
  if (order.criticalFindings) return order.criticalFindings;
  if (!order.criticalFindingsJson) return undefined;
  try {
    const parsed = JSON.parse(order.criticalFindingsJson);
    if (Array.isArray(parsed)) {
      const lines = parsed
        .map((f: Record<string, unknown>) => {
          const value = [f.observedValue ?? f.value, f.unit].filter(Boolean).join(' ');
          const head = [f.analyteName, value].filter(Boolean).join(': ');
          return f.alertDescription ? `${head}. ${f.alertDescription}` : head;
        })
        .filter(Boolean);
      if (lines.length > 0) return lines.join('\n');
    }
  } catch {
    // Not JSON - show the raw text below.
  }
  return order.criticalFindingsJson;
}

interface ToggleChipProps {
  label: string;
  meta?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'success';
  showIcon?: boolean;
}

/** Selectable pill used for statutory symptoms, orders, formulary picks and option sets. */
function ToggleChip({ label, meta, selected, onPress, disabled, tone = 'primary', showIcon = true }: ToggleChipProps) {
  const colors =
    tone === 'success'
      ? {
          selectedBg: theme.colors.successBg,
          selectedBorder: theme.colors.success,
          selectedText: theme.colors.successText,
          idleBorder: theme.colors.successBorder,
        }
      : {
          selectedBg: theme.colors.primaryLight,
          selectedBorder: theme.colors.primary,
          selectedText: theme.colors.primaryDark,
          idleBorder: theme.colors.borderDark,
        };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: selected ? colors.selectedBorder : colors.idleBorder },
        selected && { backgroundColor: colors.selectedBg },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {showIcon ? (
        <Icon
          name={selected ? 'check' : 'plus'}
          size={theme.sizes.iconSm}
          color={selected ? colors.selectedText : theme.colors.textMuted}
        />
      ) : null}
      <ThemedText variant="small" color={selected ? colors.selectedText : theme.colors.textSecondary}>
        {label}
      </ThemedText>
      {meta ? (
        <ThemedText variant="caption" color={selected ? colors.selectedText : theme.colors.textMuted}>
          {meta}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

interface CheckRowProps {
  checked: boolean;
  onPress: () => void;
  label: string;
  disabled?: boolean;
}

function CheckRow({ checked, onPress, label, disabled }: CheckRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.checkRow, disabled && styles.disabled]}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxChecked]}>
        {checked ? <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.onPrimary} /> : null}
      </View>
      <ThemedText variant="body" style={styles.flex}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export {
  formatDraftSavedTimestamp,
  extractStagedDentalTeethForDraft,
  buildConsultationDraftPayload,
  rehydrateEncounterPlanManagementWithWorkspace,
  type BuildConsultationDraftPayloadInput,
  HOME_INSTRUCTION_PRESETS,
  type HomeInstructionPreset,
  toggleHomeInstructionPreset,
};

export default function ConsultationsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { facilityName, accreditationNumber, taxIdentificationNumber, letterhead, rooms = [], settings } = useClinic();
  const allowChipLevelCalling = Boolean(settings?.enableChipLevelQueueCalling);
  const { current, staff, reload: reloadStaff } = useStaff();
  const { user: authUser, can } = useAuth();
  const canRecordVitals = authUser ? can(PERMISSIONS.triageWrite) : true;

  const activeRooms = useMemo(() => (rooms || []).filter((r) => r.isActive), [rooms]);
  const treatmentRooms = useMemo(
    () => activeRooms.filter((r) => r.type === 'Treatment'),
    [activeRooms],
  );
  const [selectedTreatmentRoomId, setSelectedTreatmentRoomId] = useState<string>('');

  useEffect(() => {
    if (!selectedTreatmentRoomId && treatmentRooms.length > 0) {
      setSelectedTreatmentRoomId(treatmentRooms[0].id);
    }
  }, [selectedTreatmentRoomId, treatmentRooms]);

  // Queue
  const [patients, setPatients] = useState<PatientQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientQueueItem | null>(null);

  // Call to room modal state
  const [callModalItem, setCallModalItem] = useState<PatientQueueItem | null>(null);
  const [selectedCallRoom, setSelectedCallRoom] = useState<string>('Room 1');
  const [selectedCallRoomId, setSelectedCallRoomId] = useState<string | undefined>(undefined);
  const [isCallingNext, setIsCallingNext] = useState(false);

  // Selected patient context (loaded from the API when a queue item is chosen)
  const [vitals, setVitals] = useState<TriageVitals | null>(null);
  const [vitalsError, setVitalsError] = useState<string | null>(null);
  const [patientRecord, setPatientRecord] = useState<ClinicPatient | null>(null);
  const [patientChart, setPatientChart] = useState<PatientChart | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [labOrders, setLabOrders] = useState<ClinicLabOrderRecord[]>([]);
  const [labError, setLabError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const activePatientId = useRef<string | null>(null);
  const appliedRouteKey = useRef<string | null>(null);

  // Responsive Desktop Workstation Detection (Feature 21)
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDesktopWorkstation = windowWidth >= (theme.breakpoints.desktop ?? 1024);
  const desktopPaneHeight = Math.max(480, windowHeight - 160);

  // Split-Screen & Longitudinal Chart Review States (Feature 21)
  type ChartReviewTab =
    | 'summary'
    | 'encounters'
    | 'diagnostics'
    | 'procedures'
    | 'immunizations'
    | 'profiles'
    | 'vault'
    | 'documents'
    | 'dental';
  const CHART_TAB_DESCRIPTIONS: Record<ChartReviewTab, string> = {
    summary: 'Executive clinical summary, problems, and vital trends',
    encounters: 'Timeline of historical clinical visits and SOAP documentation',
    diagnostics: 'Diagnostic laboratory orders, results, and specimen requisitions',
    procedures: 'Nursing procedures, treatments, and clinical interventions',
    immunizations: 'Statutory immunizations, schedules, and adverse events (AEFI)',
    profiles: 'Past medical history, surgical, social, and NCD risk profiles',
    vault: 'External document vault, outside imaging films, and clearances',
    documents: 'Issued medical certificates and referral letters',
    dental: 'Odontogram findings, tooth condition, surfaces, and dental procedures',
  };
  const [activeChartTab, setActiveChartTab] = usePersistedTab<ChartReviewTab>({
    storageKey: 'clinicez_consultations_active_chart_tab',
    allowedValues: ['summary', 'encounters', 'diagnostics', 'procedures', 'immunizations', 'profiles', 'vault', 'documents', 'dental'],
    defaultValue: 'summary',
    routeParam: (route?.params as any)?.chartTab,
    queryParam: 'chartTab',
    queryParamAliases: ['tab', 'section'],
    syncUrl: Boolean(selectedPatient),
    clearUrlOnInactive: true,
    navigation,
    pathnameMatcher: (p) => (p || '').includes('consultations'),
  });

  const [chartTabHistory, setChartTabHistory] = useState<ChartReviewTab[]>([]);

  const handleSelectChartTab = (tab: ChartReviewTab) => {
    if (tab === activeChartTab) return;
    setChartTabHistory((prev) => pushChartTabHistory(prev, activeChartTab, tab));
    setActiveChartTab(tab);
  };
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState<boolean>(() => {
    return getSessionItem('clinicez_consultations_workspace_expanded') === 'true';
  });
  const [isChartExpanded, setIsChartExpanded] = useState<boolean>(() => {
    if (getSessionItem('clinicez_consultations_workspace_expanded') === 'true') {
      return false;
    }
    return getSessionItem('clinicez_consultations_chart_expanded') === 'true';
  });
  const handleToggleWorkspaceExpand = useCallback(() => {
    setIsWorkspaceExpanded((prev) => {
      const next = !prev;
      setSessionItem('clinicez_consultations_workspace_expanded', next ? 'true' : 'false');
      if (next) {
        setIsChartExpanded(false);
        setSessionItem('clinicez_consultations_chart_expanded', 'false');
      }
      return next;
    });
  }, []);
  const handleToggleChartExpand = useCallback(() => {
    setIsChartExpanded((prev) => {
      const next = !prev;
      setSessionItem('clinicez_consultations_chart_expanded', next ? 'true' : 'false');
      if (next) {
        setIsWorkspaceExpanded(false);
        setSessionItem('clinicez_consultations_workspace_expanded', 'false');
      }
      return next;
    });
  }, []);
  const [mobileWorkstationView, setMobileWorkstationView] = useState<'soap' | 'chart'>('soap');
  const [uploadDocModalVisible, setUploadDocModalVisible] = useState(false);
  const [postEncounterModalVisible, setPostEncounterModalVisible] = useState(false);
  const [reviewChargeSlipModalVisible, setReviewChargeSlipModalVisible] = useState(false);
  const [chargeSlipItems, setChargeSlipItems] = useState<CreateInvoiceRequest['lineItems']>([]);
  // Aliases for compatibility
  const reviewSoaModalVisible = reviewChargeSlipModalVisible;
  const setReviewSoaModalVisible = setReviewChargeSlipModalVisible;
  const soaReviewItems = chargeSlipItems;

  // Multi-Provider Queue Room / Station & Status Filter States (Persistent per staff)
  const staffKey = current?.id ? `clinicez:consultations:${current.id}` : 'clinicez:consultations:default';

  const [queueViewFilter, setQueueViewFilter] = usePersistedTab<QueueView>({
    storageKey: `${staffKey}:queueView`,
    allowedValues: ['WaitingForDoctor', 'MyRoom', 'PendingProcedure', 'Completed', 'All'],
    defaultValue: 'WaitingForDoctor',
    routeParam: (route?.params as any)?.queueView,
    queryParam: 'queueView',
    queryParamAliases: ['view', 'status'],
    pathnameMatcher: (p) => (p || '').includes('consultations'),
    navigation,
  });
  const [selectedStationFilter, setSelectedStationFilter] = usePersistedTab<string>({
    storageKey: `${staffKey}:station`,
    defaultValue: 'ALL',
    routeParam: (route?.params as any)?.station,
    queryParam: 'station',
    omitDefaultFromUrl: true,
    pathnameMatcher: (p) => (p || '').includes('consultations'),
    navigation,
  });
  const didApplyStaffRoomDefaults = useRef(false);

  const { visibleRooms, allPillLabel } = useMemo(
    () => computeScopedStations(activeRooms, current, queueViewFilter),
    [activeRooms, current, queueViewFilter],
  );

  useEffect(() => {
    if (didApplyStaffRoomDefaults.current || !current || activeRooms.length === 0) return;
    didApplyStaffRoomDefaults.current = true;
    const staffStorageKey = `clinicez:consultations:${current.id}`;
    const savedView = getDeviceItem(`${staffStorageKey}:queueView`);
    const savedStation = getDeviceItem(`${staffStorageKey}:station`);

    if (savedView === 'WaitingForDoctor' || savedView === 'MyRoom' || savedView === 'PendingProcedure' || savedView === 'Completed' || savedView === 'All') {
      setQueueViewFilter(savedView);
    } else {
      const assignedIds = current.assignedRoomIds ?? (current.assignedRoomId ? [current.assignedRoomId] : []);
      if (current.role === 'Nurse' && assignedIds.length > 0) {
        const assignedRoom = activeRooms.find((r) => r.id === assignedIds[0]);
        if (assignedRoom?.type === 'Treatment') {
          setQueueViewFilter('PendingProcedure');
        }
      }
    }

    if (savedStation) {
      setSelectedStationFilter(savedStation);
    } else {
      const assignedIds = current.assignedRoomIds ?? (current.assignedRoomId ? [current.assignedRoomId] : []);
      if (current.role === 'Nurse' && assignedIds.length > 0) {
        const assignedRoom = activeRooms.find((r) => r.id === assignedIds[0]);
        if (assignedRoom) {
          setSelectedStationFilter(assignedRoom.name);
        }
      }
    }
  }, [current, activeRooms]);

  const handleQueueViewFilterChange = (v: string) => {
    const newView = v as QueueView;
    setQueueViewFilter(newView);
    if (current?.id) {
      setDeviceItem(`clinicez:consultations:${current.id}:queueView`, newView);
    }
    const nextScope = computeScopedStations(activeRooms, current, newView);
    if (
      selectedStationFilter !== 'ALL' &&
      !nextScope.visibleRooms.some((r) => r.name === selectedStationFilter)
    ) {
      setSelectedStationFilter('ALL');
      if (current?.id) {
        setDeviceItem(`clinicez:consultations:${current.id}:station`, 'ALL');
      }
    }
  };

  const handleStationFilterChange = (stationName: string) => {
    setSelectedStationFilter(stationName);
    if (current?.id) {
      setDeviceItem(`clinicez:consultations:${current.id}:station`, stationName);
    }
  };

  const displayedPatients = useMemo(() => {
    if (queueViewFilter === 'Completed') {
      return patients.filter((p) => p.status === 'Completed');
    }
    if (queueViewFilter === 'All') {
      return patients.filter((p) => p.status !== 'Cancelled' && p.status !== 'NoShow');
    }
    return patients.filter((p) => p.status !== 'Completed' && p.status !== 'Cancelled' && p.status !== 'NoShow');
  }, [patients, queueViewFilter]);

  const nextEligiblePatient = useMemo(() => {
    const eligibleStatuses: QueueStatus[] = ['Triaged', 'ReEvaluation', 'Waiting'];
    return displayedPatients.find(
      (p) =>
        eligibleStatuses.includes(p.status) &&
        !p.isDirectVisit &&
        !p.queueNumber?.startsWith('DV-') &&
        !p.id.startsWith('ephemeral-')
    );
  }, [displayedPatients]);

  // PhilHealth Yakap Claim Readiness States (Feature 17)
  const [serverReadiness, setServerReadiness] = useState<YakapClaimReadinessDto | null>(null);
  const [isValidatingReadiness, setIsValidatingReadiness] = useState(false);

  // Jump to section refs
  const scrollViewRef = useRef<ScrollView>(null);
  const chartScrollViewRef = useRef<ScrollView>(null);
  const soapScrollViewRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  const soapPaneOffsetY = useRef<number>(0);

  const latestDisplayedVitals = vitals ?? patientChart?.vitalsHistory?.[0] ?? null;

  const latestVitalsRecordedMeta = useMemo(() => {
    if (!latestDisplayedVitals) return null;

    const matchedHistoryEntry = patientChart?.vitalsHistory?.find(
      (v) =>
        (latestDisplayedVitals.id && v.id === latestDisplayedVitals.id) ||
        (latestDisplayedVitals.queueItemId && v.queueItemId === latestDisplayedVitals.queueItemId),
    );
    const matchedStaff = latestDisplayedVitals.nurseId
      ? staff.find((s) => s.id === latestDisplayedVitals.nurseId)
      : undefined;
    const recorderName =
      latestDisplayedVitals.recordedByNurseName?.trim() ||
      matchedHistoryEntry?.recordedByNurseName?.trim() ||
      (matchedStaff ? formatStaffName(matchedStaff) : null);

    let whenLabel: string | null = null;
    if (latestDisplayedVitals.recordedAt) {
      const recordedYmd = formatClinicDate(latestDisplayedVitals.recordedAt, {
        dateFormat: 'yyyy-MM-dd',
        fallback: '',
      });
      const timeStr = formatClinicTime(latestDisplayedVitals.recordedAt, { fallback: '' });
      if (recordedYmd && recordedYmd !== getManilaTodayStr()) {
        const dateStr = formatClinicDate(latestDisplayedVitals.recordedAt, { fallback: '' });
        whenLabel = dateStr && timeStr ? `${dateStr} • ${timeStr}` : dateStr || timeStr || null;
      } else if (timeStr) {
        whenLabel = timeStr;
      }
    }

    if (whenLabel && recorderName) {
      return `${whenLabel} by ${recorderName}`;
    }
    if (whenLabel) {
      return `Recorded ${whenLabel}`;
    }
    if (recorderName) {
      return `Recorded by ${recorderName}`;
    }
    return null;
  }, [latestDisplayedVitals, patientChart?.vitalsHistory, staff]);

  const handleOpenVitalsModal = () => {
    if (latestDisplayedVitals) {
      setEditVitalsModalVisible(true);
    } else {
      setRecordVitalsModalVisible(true);
    }
  };

  const handleJumpToSection = (section: StatutorySectionKey) => {
    if (section === 'vitals' && canRecordVitals) {
      handleOpenVitalsModal();
    }
    if (mobileWorkstationView !== 'soap') {
      setMobileWorkstationView('soap');
    }
    const isSpineSection = section === 'patient-pin' || section === 'vitals';
    if (isDesktopWorkstation && isChartExpanded && !isSpineSection) {
      setIsChartExpanded(false);
      setSessionItem('clinicez_consultations_chart_expanded', 'false');
    }
    const rawY = sectionOffsets.current[section];
    if (rawY != null) {
      if (isDesktopWorkstation) {
        if (isSpineSection) {
          scrollViewRef.current?.scrollTo({ y: Math.max(0, rawY - 24), animated: true });
        } else {
          if (soapPaneOffsetY.current > 0) {
            scrollViewRef.current?.scrollTo({ y: Math.max(0, soapPaneOffsetY.current - 16), animated: true });
          }
          soapScrollViewRef.current?.scrollTo({ y: Math.max(0, rawY - 24), animated: true });
        }
      } else {
        const containerOffset = isSpineSection ? 0 : soapPaneOffsetY.current;
        scrollViewRef.current?.scrollTo({ y: Math.max(0, rawY + containerOffset - 24), animated: true });
      }
    }
  };

  // SOAP Inputs
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [importedProcedureIds, setImportedProcedureIds] = useState<string[]>([]);
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [homeInstructions, setHomeInstructions] = useState('');

  // ICD-10 Search & Selection
  const [icdQuery, setIcdQuery] = useState('');
  const [icdResults, setIcdResults] = useState<Icd10Code[]>([]);
  const [icdNotice, setIcdNotice] = useState<string | null>(null);
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<LocalDiagnosis[]>([]);
  const [showIcdDropdown, setShowIcdDropdown] = useState(false);

  // Prescriptions
  const [prescriptions, setPrescriptions] = useState<LocalPrescription[]>([]);
  const hasDangerousDrug = useMemo(() => prescriptions.some((p) => p.isDangerousDrug), [prescriptions]);

  // Diagnostic Lab Orders & In-Clinic Procedures
  const [orderedLabs, setOrderedLabs] = useState<LocalLabOrder[]>([]);
  const [orderedProcedures, setOrderedProcedures] = useState<LocalProcedureOrder[]>([]);
  const [dentalChart, setDentalChart] = useState<Record<number, any>>({});
  const [orderInitialToothNumber, setOrderInitialToothNumber] = useState<number | undefined>(undefined);
  const [orderInitialToothSurface, setOrderInitialToothSurface] = useState<string | undefined>(undefined);
  const isDentalEnabled = useMemo(
    () => Boolean(
      settings?.enableDentalModule ||
      settings?.specialtyMode === 'Dental' ||
      settings?.specialtyMode === 'Multi-Specialty' ||
      settings?.specialtyMode === 'MultiSpecialty' ||
      (settings as any)?.specialties?.includes?.('Dental') ||
      (settings as any)?.hasDentalServices ||
      (patientChart?.dentalTeeth && patientChart.dentalTeeth.length > 0) ||
      (patientChart?.dentalChart?.teeth && patientChart.dentalChart.teeth.length > 0)
    ),
    [
      settings?.enableDentalModule,
      settings?.specialtyMode,
      (settings as any)?.specialties,
      (settings as any)?.hasDentalServices,
      patientChart?.dentalTeeth,
      patientChart?.dentalChart,
    ]
  );

  const availableChartTabIds = useMemo<ChartReviewTab[]>(
    () => [
      'summary',
      'encounters',
      'diagnostics',
      'procedures',
      'immunizations',
      'profiles',
      'vault',
      'documents',
      ...(isDentalEnabled ? (['dental'] as ChartReviewTab[]) : []),
    ],
    [isDentalEnabled],
  );

  const { previousTab: previousChartTab } = useMemo(
    () => popChartTabHistory(chartTabHistory, availableChartTabIds),
    [chartTabHistory, availableChartTabIds],
  );

  const handleChartTabBack = useCallback(() => {
    const { previousTab: target, nextHistory } = popChartTabHistory(chartTabHistory, availableChartTabIds);
    if (!target) return;
    setChartTabHistory(nextHistory);
    setActiveChartTab(target);
    setSessionItem('clinicez_consultations_active_chart_tab', target);
  }, [chartTabHistory, availableChartTabIds]);

  const handleDentalChartChange = useCallback((nextChart: Record<number, any>) => {
    // Only stage changes in the right-side active encounter dentalChart state while unsigned.
    // The left-side Patient Chart (patientChart.dentalTeeth) remains read-only historical status
    // and is updated only after the doctor signs the encounter.
    setDentalChart(nextChart as any);
  }, []);
  const [editingOrderItem, setEditingOrderItem] = useState<EditingOrderItemState | null>(null);
  const [editingInstructionText, setEditingInstructionText] = useState<string>('');
  const [isHandoffSending, setIsHandoffSending] = useState<boolean>(false);
  const [orderSearchModalVisible, setOrderSearchModalVisible] = useState(false);
  const [orderSearchInitialCategory, setOrderSearchInitialCategory] = useState<'Diagnostic' | 'Procedure' | 'Dental' | 'All'>('All');
  const [editPatientModalVisible, setEditPatientModalVisible] = useState(false);
  const [recordVitalsModalVisible, setRecordVitalsModalVisible] = useState(false);
  const [editVitalsModalVisible, setEditVitalsModalVisible] = useState(false);

  // New Prescription Form State
  const [showAddRx, setShowAddRx] = useState(false);
  const [newRxGeneric, setNewRxGeneric] = useState('');
  const [newRxDosage, setNewRxDosage] = useState('');
  const [newRxForm, setNewRxForm] = useState('Tablet');
  const [newRxSig, setNewRxSig] = useState('');
  const [newRxQuantity, setNewRxQuantity] = useState('30');
  const [newRxClinicDispensedQty, setNewRxClinicDispensedQty] = useState('');
  const [newRxDangerous, setNewRxDangerous] = useState(false);
  const [newRxDrugCode, setNewRxDrugCode] = useState<string>('');
  const [selectedCatalogMedId, setSelectedCatalogMedId] = useState<string>('');

  // Dual-Workflow Mode & PhilHealth Yakap Tagging State
  const [visitWorkflowMode, setVisitWorkflowMode] = useState<VisitWorkflowMode>('Regular');
  const [isYakapEligible, setIsYakapEligible] = useState<boolean>(false);
  const [philHealthAtc, setPhilHealthAtc] = useState<string>('WALKEDIN');
  const [rosCategory, setRosCategory] = useState<RosCategoryCode>('EssentiallyNormal');
  const [rosCategories, setRosCategories] = useState<RosCategoryCode[]>([]);
  const [isAbandoningDraft, setIsAbandoningDraft] = useState(false);
  const [selectedSymptomCodes, setSelectedSymptomCodes] = useState<string[]>([]);
  const [rosItems, setRosItems] = useState<EncounterReviewOfSystemsItemDto[]>([]);
  const [symptomOtherDesc, setSymptomOtherDesc] = useState<string>('');
  const [symptomPainSite, setSymptomPainSite] = useState<string>('');

  const applyRosCategories = useCallback((nextCategories: ReadonlyArray<RosCategoryCode | string>) => {
    const normalized = normalizeRosCategoryList(nextCategories, { allowEmpty: true });
    setRosCategories(normalized);
    const primary =
      normalized.find((c) => c !== 'EssentiallyNormal') ??
      normalized[0] ??
      'EssentiallyNormal';
    setRosCategory(primary);
  }, []);

  // PhilHealth YAKAP Specific Encounter Form Cohort States
  const [obGyneExam, setObGyneExam] = useState<EncounterObGyneExamDto | null>(null);
  const [pediatricMilestones, setPediatricMilestones] = useState<EncounterPediatricMilestoneDto[]>([]);
  const [adolescentAssessment, setAdolescentAssessment] = useState<EncounterAdolescentAssessmentDto | null>(null);
  const [headsssAssessments, setHeadsssAssessments] = useState<EncounterHeadsssDomainAssessmentDto[]>([]);
  const [bpMonitoringLogs, setBpMonitoringLogs] = useState<PatientBpMonitoringLogDto[]>([]);
  const [planManagement, setPlanManagement] = useState<YakapPlanManagementState>({
    ...DEFAULT_YAKAP_PLAN_MANAGEMENT,
  });

  const handleWorkflowModeChange = (mode: VisitWorkflowMode) => {
    if (isSigned) return;
    setVisitWorkflowMode(mode);
    const yakap = mode === 'YakapAvailment';
    setIsYakapEligible(yakap);
    if (yakap && !philHealthAtc.trim()) {
      setPhilHealthAtc('WALKEDIN');
    }
    setSelectedPatient((prev) => (prev ? { ...prev, visitWorkflowMode: mode } : prev));
    setPatients((prev) =>
      (prev || []).map((item) =>
        selectedPatient && item.id === selectedPatient.id
          ? { ...item, visitWorkflowMode: mode }
          : item,
      ),
    );
  };

  const handleRosChange = (items: EncounterReviewOfSystemsItemDto[]) => {
    if (isSigned) return;
    const prevItems = rosItems;
    setRosItems(items);
    const newCodes = items.map((i) => i.optionCode);
    setSelectedSymptomCodes(newCodes);

    // Sync pain site input when present or cleared in items
    const painItem = items.find(
      (i) =>
        i.optionCode === '38' ||
        i.optionCode.toLowerCase().includes('pain') ||
        (i.symptomName?.toLowerCase() ?? '').includes('pain'),
    );
    if (painItem !== undefined) {
      const nextPainSite = painItem.painSite ?? '';
      if (nextPainSite !== symptomPainSite) {
        setSymptomPainSite(nextPainSite);
      }
    }
    // Sync other complaint input when present or cleared in items
    const otherItem = items.find(
      (i) =>
        i.optionCode.toUpperCase() === 'X' ||
        i.optionCode.toLowerCase().includes('other') ||
        (i.symptomName?.toLowerCase() ?? '').includes('other'),
    );
    if (otherItem !== undefined) {
      const nextOtherDesc = otherItem.othersSpecifyText ?? '';
      if (nextOtherDesc !== symptomOtherDesc) {
        setSymptomOtherDesc(nextOtherDesc);
      }
    }

    // Add newly selected symptoms and remove untoggled symptoms in subjective narrative
    if (prevItems.length !== items.length) {
      setSubjective((prev) => syncSubjectiveWithToggledSymptoms(prev, prevItems, items));
    }
  };

  // PhilHealth signs and symptoms come from the catalog (cached on the device), never from literals.
  const symptomLibrary = usePhilHealthCatalog('lib_signs_symptoms', isYakapEligible);
  const symptoms: StatutorySymptom[] = useMemo(
    () =>
      symptomLibrary.items.map((item) => ({
        code: item.code,
        name: titleCase(item.description),
        description: item.description,
      })),
    [symptomLibrary.items],
  );
  const painSymptomCode = symptoms.find((s) => isCatalogTerm(s, 'pain'))?.code ?? '38';
  const otherSymptomCode = symptoms.find((s) => isCatalogTerm(s, 'others'))?.code ?? 'X';
  const painSymptomSelected = Boolean(painSymptomCode && selectedSymptomCodes.includes(painSymptomCode));
  const otherSymptomSelected = Boolean(otherSymptomCode && selectedSymptomCodes.includes(otherSymptomCode));

  // Sign & Sync Status
  const [isSigning, setIsSigning] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [isFollowUpEncounter, setIsFollowUpEncounter] = useState(false);
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  // PhilHealth medicine lookup for a new medication order (thousands of rows, searched on the server).
  const [rxCatalogQuery, setRxCatalogQuery] = useState('');
  const rxMetaEnabled = isYakapEligible && showAddRx;
  const rxCatalogSearch = usePhilHealthCatalogSearch('lib_medicine', rxMetaEnabled ? rxCatalogQuery : '', { take: 15 });
  const rxStrengthCatalog = usePhilHealthCatalog('lib_medicine_strength', rxMetaEnabled);
  const rxFormCatalog = usePhilHealthCatalog('lib_medicine_form', rxMetaEnabled);
  const rxUnitCatalog = usePhilHealthCatalog('lib_medicine_unit', rxMetaEnabled);
  const rxGenericCatalog = usePhilHealthCatalog('lib_medicine_generic', rxMetaEnabled);

  const rxStrengthLookup = useMemo(
    () => new Map(rxStrengthCatalog.items.map((entry) => [entry.code, entry.description])),
    [rxStrengthCatalog.items],
  );
  const rxFormLookup = useMemo(
    () => new Map(rxFormCatalog.items.map((entry) => [entry.code, entry.description])),
    [rxFormCatalog.items],
  );
  const rxUnitLookup = useMemo(
    () => new Map(rxUnitCatalog.items.map((entry) => [entry.code, entry.description])),
    [rxUnitCatalog.items],
  );
  const rxGenericLookup = useMemo(
    () => new Map(rxGenericCatalog.items.map((entry) => [entry.code, entry.description])),
    [rxGenericCatalog.items],
  );

  const handleSelectPhilHealthMedicine = (item: PhilHealthCatalogItem) => {
    const parsed = parseMedicineSelection({
      description: item.description,
      attributes: item.attributes,
      strengthLookup: rxStrengthLookup,
      formLookup: rxFormLookup,
      unitLookup: rxUnitLookup,
      genericLookup: rxGenericLookup,
    });
    setNewRxGeneric(parsed.genericName);
    if (parsed.dosage) {
      setNewRxDosage(parsed.dosage);
    }
    setNewRxForm(parsed.form);
    setNewRxDrugCode(item.code);
    setSelectedCatalogMedId('');
    setRxCatalogQuery('');
  };
  // Tenant Mapped Services & Formulary Catalog (fee schedule)
  const [clinicCatalog, setClinicCatalog] = useState<ClinicServiceItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    const [items, err] = await clinicService.getServices();
    if (err || !items) {
      setCatalogError(err?.message || 'Unable to load the fee schedule.');
    } else {
      setClinicCatalog(items);
      setCatalogError(null);
    }
    setCatalogLoading(false);
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const activeCatalog = clinicCatalog.filter((s) => s.isActive);
  const catalogByCategory = (...categories: string[]) =>
    activeCatalog.filter((s) => categories.includes(s.category.toLowerCase()));
  const medicineCatalog = catalogByCategory('medicine');
  const diagnosticCatalog = catalogByCategory('diagnostic');
  const procedureCatalog = catalogByCategory('procedure', 'nursingservice', 'dental');
  const consultationFee = catalogByCategory('consultation')[0];

  const handleSelectCatalogMedicine = (item: ClinicServiceItem) => {
    const parsed = parseMedicineSelection({ description: item.name });
    setNewRxGeneric(parsed.genericName);
    if (parsed.dosage) {
      setNewRxDosage(parsed.dosage);
    }
    setNewRxForm(parsed.form);
    setSelectedCatalogMedId(item.id);
    setNewRxDrugCode(item.philHealthCode ?? '');
    if (item.description && !newRxSig) {
      setNewRxSig(item.description);
    }
  };

  // Acting doctor: the staff member this workstation is "working as", else the queue item's doctor.
  const assignedStaff = useMemo(
    () => staff.find((s) => s.id === selectedPatient?.doctorId) ?? null,
    [staff, selectedPatient?.doctorId],
  );
  const signerStaff = current ?? assignedStaff;
  const signer = signerStaff
    ? { id: signerStaff.id, name: formatStaffName(signerStaff) }
    : selectedPatient?.doctorId && selectedPatient.doctorName
      ? { id: selectedPatient.doctorId, name: selectedPatient.doctorName }
      : null;
  const signerName = signer?.name ?? '';

  // Doctor Regulatory Credentials (prefilled from the staff record, editable)
  const [doctorPrc, setDoctorPrc] = useState('');
  const [doctorPtr, setDoctorPtr] = useState('');
  const [doctorS2, setDoctorS2] = useState('');
  const [doctorPan, setDoctorPan] = useState('');
  const [physicalExamFindings, setPhysicalExamFindings] = useState<PhysicalExamFindings>({ ...DEFAULT_PHYSICAL_EXAM_NORMAL });
  const signerStaffId = signerStaff?.id;
  const signerPrc = signerStaff?.prcLicenseNumber ?? '';
  const signerPtr = signerStaff?.ptrNumber ?? '';
  const signerS2 = signerStaff?.s2LicenseNumber ?? '';
  const signerPan = signerStaff?.philHealthPan ?? '';
  const prevSignerStaffIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const switchedActiveStaff =
      prevSignerStaffIdRef.current !== undefined &&
      prevSignerStaffIdRef.current !== signerStaffId;
    prevSignerStaffIdRef.current = signerStaffId;
    if (switchedActiveStaff) {
      setDoctorPrc(signerPrc);
      setDoctorPtr(signerPtr);
      setDoctorS2(signerS2);
      setDoctorPan(signerPan);
    } else {
      setDoctorPrc((prev) => prev || signerPrc);
      setDoctorPtr((prev) => prev || signerPtr);
      setDoctorS2((prev) => prev || signerS2);
      setDoctorPan((prev) => prev || signerPan);
    }
  }, [signerStaffId, signerPrc, signerPtr, signerS2, signerPan]);

  const requireSigner = () => {
    if (!signer) {
      Alert.alert(
        'Choose who is working',
        "Select your name under 'Working as' in the sidebar or header before continuing.",
      );
      return null;
    }
    return signer;
  };

  // Clinical Document Issuance States
  const [medCertModalVisible, setMedCertModalVisible] = useState(false);
  const [issuingMedCert, setIssuingMedCert] = useState(false);
  const [medCertFitness, setMedCertFitness] = useState('FitToWork');
  const [medCertRestDays, setMedCertRestDays] = useState('');
  const [medCertPurpose, setMedCertPurpose] = useState('');
  const [medCertRemarks, setMedCertRemarks] = useState('');
  const [issuedMedCert, setIssuedMedCert] = useState<MedicalCertificateRecord | null>(null);

  const [referralModalVisible, setReferralModalVisible] = useState(false);
  const [issuingReferral, setIssuingReferral] = useState(false);
  const [refFacility, setRefFacility] = useState('');
  const [refDepartment, setRefDepartment] = useState('');
  const [refUrgency, setRefUrgency] = useState('Routine');
  const [refReason, setRefReason] = useState('');
  const [refSummary, setRefSummary] = useState('');
  const [refDiagnosis, setRefDiagnosis] = useState('');
  const [refValidationAttempted, setRefValidationAttempted] = useState(false);
  const [issuedReferral, setIssuedReferral] = useState<ReferralLetterRecord | null>(null);

  const [previewDocModal, setPreviewDocModal] = useState(false);
  const [previewType, setPreviewType] = useState<'MEDCERT' | 'REFERRAL' | 'PRESCRIPTION'>('MEDCERT');
  const [docSigningMode, setDocSigningMode] = useState<'esign' | 'wet'>('esign');

  const DOC_SIGNING_OPTIONS: SegmentedOption<'esign' | 'wet'>[] = [
    { value: 'esign', label: 'E-Signed PDF' },
    { value: 'wet', label: 'Wet Signature (Pen)' },
  ];

  useEffect(() => {
    if (previewDocModal) {
      if (hasDangerousDrug) {
        setDocSigningMode('wet');
      } else if (signerStaff?.defaultSignatureMode === 'WetSignature') {
        setDocSigningMode('wet');
      } else {
        setDocSigningMode('esign');
      }
    }
  }, [previewDocModal, hasDangerousDrug, signerStaff?.defaultSignatureMode]);

  const handleDocSigningModeChange = (mode: 'esign' | 'wet') => {
    if (hasDangerousDrug && mode === 'esign') {
      Alert.alert(
        'PDEA S2 Statutory Safeguard',
        'Prescriptions containing Dangerous Drugs (PDEA S2 regulated substances) cannot be issued with electronic signature alone. A wet signature on a physical prescription pad is required under Philippine DOH-PDEA regulations (RA 9165).',
      );
      return;
    }
    setDocSigningMode(mode);
  };

  // E-Prescription Slip & Dual-Path Interoperability States
  const [signedConsultationId, setSignedConsultationId] = useState<string | null>(null);
  const [prescriptionSlip, setPrescriptionSlip] = useState<PrescriptionSlipData | null>(null);
  const [prescriptionSlipModalVisible, setPrescriptionSlipModalVisible] = useState(false);

  // Implicit Background Consultation Draft Persistence States & Refs
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>('idle');
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const consultationIdRef = useRef<string | null>(null);
  const savedConsultationByVisitRef = useRef<Record<string, string>>({});
  const needsBaselineCaptureRef = useRef<boolean>(true);
  const lastPersistedFingerprintRef = useRef<string>('');
  const inFlightFingerprintRef = useRef<string>('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightDraftSavePromiseRef = useRef<Promise<string | null> | null>(null);
  const draftSaveEpochRef = useRef<number>(0);
  const materializingVisitPromiseRef = useRef<Promise<PatientQueueItem | null> | null>(null);

  useEffect(() => {
    consultationIdRef.current = signedConsultationId;
  }, [signedConsultationId]);

  const draftSavedAtLabel = useMemo(
    () => formatDraftSavedTimestamp(lastDraftSavedAt),
    [lastDraftSavedAt],
  );

  // Lab Results & STAT Panic Alerts
  const [panicModalVisible, setPanicModalVisible] = useState(false);
  const [selectedPanicOrder, setSelectedPanicOrder] = useState<ClinicLabOrderRecord | null>(null);
  const [panicAckNotes, setPanicAckNotes] = useState('');
  const [isAcknowledgingPanic, setIsAcknowledgingPanic] = useState(false);

  // Clinical Decision Support (CDS) Safety Engine States
  const [cdsAlerts, setCdsAlerts] = useState<CdsAlert[]>([]);
  const [cdsUsedLocalRules, setCdsUsedLocalRules] = useState(false);
  const [evaluatingCds, setEvaluatingCds] = useState(false);
  const [cdsOverrideReason, setCdsOverrideReason] = useState('');
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [externalDispenseModalVisible, setExternalDispenseModalVisible] = useState(false);
  const [loadingSlip, setLoadingSlip] = useState(false);

  // Computed Interop & CDS helpers
  const activePanicAlert =
    labOrders.find((o) => o.hasCriticalPanicAlert && !(o.isPanicAcknowledged ?? Boolean(o.panicAcknowledgedAt))) ||
    labOrders.find((o) => o.hasCriticalPanicAlert);
  const hasCriticalCdsAlert = cdsAlerts.some((a) => a.severity === 'Critical');
  const facilityHeader = letterhead.header || facilityName;

  const handleOpenPrescriptionSlip = async () => {
    if (!selectedPatient) return;
    if (signedConsultationId && isSigned) {
      setLoadingSlip(true);
      const [slip, slipErr] = await clinicService.getPrescriptionSlip(signedConsultationId);
      setLoadingSlip(false);
      if (slip) {
        setPrescriptionSlip(slip);
        setPrescriptionSlipModalVisible(true);
      } else {
        notify.error(slipErr?.message || 'Unable to load the e-prescription slip. Please try again.');
      }
      return;
    }

    // Unsigned encounter: preview a draft built only from the real patient, facility and doctor records.
    const doctor = requireSigner();
    if (!doctor) return;
    if (!patientRecord) {
      notify.error('Patient details have not loaded yet, so a draft slip cannot be previewed.');
      return;
    }
    const draftSlip: PrescriptionSlipData = {
      consultationId: '',
      prescriptionNumber: 'Draft',
      issuedAt: new Date().toISOString(),
      clinicName: facilityHeader,
      clinicAddress: letterhead.address,
      clinicContact: letterhead.contact,
      doctorName: doctor.name,
      doctorPrcLicense: doctorPrc,
      doctorPtr: doctorPtr || undefined,
      doctorS2License: doctorS2 || undefined,
      doctorSpecialization: signerStaff?.specialty,
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      patientAge: patientRecord.age,
      patientGender: patientRecord.sex,
      philHealthNumber: patientRecord.philHealthNumber,
      patientAllergies: patientRecord.allergies || undefined,
      clinicalDiagnosis: assessment || undefined,
      specialInstructions: homeInstructions.trim() || plan || undefined,
      items: prescriptions.map((p, idx) => ({
        itemId: p.id || `item-${idx}`,
        genericName: p.genericName,
        brandName: undefined,
        dosage: p.dosage,
        form: p.form,
        sig: p.sig,
        quantity: p.quantity,
        durationDays: p.durationDays,
        refills: 0,
        isDangerousDrug: p.isDangerousDrug,
        philHealthDrugCode: p.philHealthDrugCode,
        isClinicDispensed: (p.clinicDispensedQuantity ?? 0) > 0,
        clinicDispensedQuantity: p.clinicDispensedQuantity,
      })),
      publicVerificationToken: '',
      publicVerificationUrl: '',
      qrPayload: '',
      dispenseStatus: 'Draft',
    };
    setPrescriptionSlip(draftSlip);
    setPrescriptionSlipModalVisible(true);
  };

  const primaryDiagnosisText = () =>
    assessment.trim() || selectedDiagnoses.find((d) => d.isPrimary)?.description || selectedDiagnoses[0]?.description || '';

  type DraftSaveSnapshot = {
    epoch: number;
    visit: PatientQueueItem;
    doctor: { id: string; name: string };
    consultationId: string | null;
    isFollowUpEncounter: boolean;
    payload: CreateConsultationRequest;
    fingerprint: string;
  };

  const queuedDraftSnapshotRef = useRef<DraftSaveSnapshot | null>(null);
  const latestUnsavedSnapshotRef = useRef<DraftSaveSnapshot | null>(null);

  const completedLabResultsCountForDraft = useMemo(
    () =>
      labOrders.filter(
        (o) => o.status === 'Completed' || o.status === 'CompletedWithExternalReport',
      ).length,
    [labOrders],
  );

  const currentDraftPayload = useMemo<CreateConsultationRequest | null>(() => {
    if (!selectedPatient || !signer) return null;
    return buildConsultationDraftPayload({
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      doctorId: signer.id,
      doctorName: signer.name,
      queueItemId: selectedPatient.id.startsWith('ephemeral-') ? undefined : selectedPatient.id,
      appointmentId: selectedPatient.appointmentId,
      hasExistingConsultation: true,
      specialtyMode: settings?.specialtyMode,
      isDentalEnabled,
      visitWorkflowMode,
      isYakapEligible,
      philHealthAtc,
      doctorPrc,
      doctorPtr,
      doctorS2,
      doctorPan,
      fallbackPrc: signerStaff?.prcLicenseNumber ?? undefined,
      fallbackPtr: signerStaff?.ptrNumber ?? undefined,
      fallbackS2: signerStaff?.s2LicenseNumber ?? undefined,
      fallbackPan: signerStaff?.philHealthPan ?? undefined,
      subjective,
      objective,
      assessment,
      plan,
      homeInstructions,
      rosCategory,
      rosCategories,
      rosItems,
      selectedSymptomCodes,
      painSymptomSelected,
      otherSymptomSelected,
      symptomPainSite,
      symptomOtherDesc,
      physicalExamFindings,
      obGyneExam,
      pediatricMilestones,
      adolescentAssessment,
      headsssAssessments,
      bpMonitoringLogs,
      planManagement,
      completedLabResultsCount: completedLabResultsCountForDraft,
      hasIssuedReferral: Boolean(issuedReferral),
      selectedDiagnoses,
      prescriptions,
      orderedLabs,
      orderedProcedures,
      dentalChart,
      cdsOverrideReason,
      overrideConfirmed,
      medCertFitness,
      medCertRestDays,
      medCertPurpose,
      medCertRemarks,
      refFacility,
      refDepartment,
      refUrgency,
      refReason,
      refSummary,
      showAddRx,
      newRxGeneric,
      newRxDosage,
      newRxForm,
      newRxSig,
      newRxQuantity,
      newRxClinicDispensedQty,
      newRxDangerous,
      newRxDrugCode,
    });
  }, [
    selectedPatient,
    signer?.id,
    signer?.name,
    settings?.specialtyMode,
    isDentalEnabled,
    visitWorkflowMode,
    isYakapEligible,
    philHealthAtc,
    doctorPrc,
    doctorPtr,
    doctorS2,
    doctorPan,
    signerStaff?.prcLicenseNumber,
    signerStaff?.ptrNumber,
    signerStaff?.s2LicenseNumber,
    signerStaff?.philHealthPan,
    subjective,
    objective,
    assessment,
    plan,
    homeInstructions,
    rosCategory,
    rosCategories,
    rosItems,
    selectedSymptomCodes,
    painSymptomSelected,
    otherSymptomSelected,
    symptomPainSite,
    symptomOtherDesc,
    physicalExamFindings,
    obGyneExam,
    pediatricMilestones,
    adolescentAssessment,
    headsssAssessments,
    bpMonitoringLogs,
    planManagement,
    completedLabResultsCountForDraft,
    issuedReferral,
    selectedDiagnoses,
    prescriptions,
    orderedLabs,
    orderedProcedures,
    dentalChart,
    cdsOverrideReason,
    overrideConfirmed,
    medCertFitness,
    medCertRestDays,
    medCertPurpose,
    medCertRemarks,
    refFacility,
    refDepartment,
    refUrgency,
    refReason,
    refSummary,
    showAddRx,
    newRxGeneric,
    newRxDosage,
    newRxForm,
    newRxSig,
    newRxQuantity,
    newRxClinicDispensedQty,
    newRxDangerous,
    newRxDrugCode,
  ]);

  const currentDraftFingerprint = useMemo(() => {
    if (!currentDraftPayload) return '';
    const { queueItemId: _omitQueueItemId, ...fingerprintPayload } = currentDraftPayload;
    return JSON.stringify(fingerprintPayload);
  }, [currentDraftPayload]);

  const flushOutgoingDraftSnapshot = async (snapshot: DraftSaveSnapshot): Promise<void> => {
    try {
      if (inFlightDraftSavePromiseRef.current) {
        await inFlightDraftSavePromiseRef.current.catch(() => null);
      }
      let queueItemId = snapshot.visit.id;
      if (queueItemId.startsWith('ephemeral-')) {
        const isYakap =
          snapshot.payload.visitWorkflowMode === 'YakapAvailment' ||
          Boolean(snapshot.payload.isYakapEligible) ||
          snapshot.visit.visitType === 'YakapAvailment';
        const [directVisit, visitErr] = await clinicService.ensureDirectVisit({
          patientId: snapshot.visit.patientId,
          patientName: snapshot.visit.patientName,
          doctorId: snapshot.doctor.id,
          doctorName: snapshot.doctor.name,
          visitType: 'RoutineCheckup',
          visitWorkflowMode: isYakap ? 'YakapAvailment' : 'Regular',
          initialStatus: 'InConsultation',
          chiefComplaint: snapshot.visit.chiefComplaint,
          allowDuplicateActive: snapshot.isFollowUpEncounter,
        });
        if (visitErr || !directVisit) return;
        queueItemId = directVisit.id;
        setPatients((prev) =>
          (prev || []).map((item) =>
            item.id === snapshot.visit.id
              ? { ...snapshot.visit, ...directVisit, isDirectVisit: true }
              : item,
          ),
        );
      }
      const payloadWithQueue: CreateConsultationRequest = {
        ...snapshot.payload,
        queueItemId,
      };
      const resolvedConsultationId =
        snapshot.consultationId || savedConsultationByVisitRef.current[queueItemId] || null;
      if (resolvedConsultationId) {
        const [updated] = await clinicService.updateConsultation(
          resolvedConsultationId,
          payloadWithQueue,
        );
        if (updated?.id) {
          savedConsultationByVisitRef.current[queueItemId] = updated.id;
        }
      } else {
        const [created] = await clinicService.createConsultation(payloadWithQueue);
        if (created?.id) {
          savedConsultationByVisitRef.current[queueItemId] = created.id;
        }
      }
    } catch {
      // Never allow background outgoing patient flush to disrupt incoming patient context
    }
  };

  const persistDraftSnapshot = async (snapshot: DraftSaveSnapshot): Promise<string | null> => {
    if (snapshot.fingerprint === lastPersistedFingerprintRef.current) {
      return consultationIdRef.current;
    }
    if (inFlightDraftSavePromiseRef.current) {
      if (snapshot.fingerprint !== inFlightFingerprintRef.current) {
        queuedDraftSnapshotRef.current = snapshot;
      }
      return inFlightDraftSavePromiseRef.current;
    }

    const executeSave = async (): Promise<string | null> => {
      if (snapshot.epoch !== draftSaveEpochRef.current) {
        return null;
      }
      inFlightFingerprintRef.current = snapshot.fingerprint;
      setDraftSaveStatus('saving');

      let activeVisit: PatientQueueItem | null = snapshot.visit;
      if (activeVisit.id.startsWith('ephemeral-')) {
        activeVisit = await materializeVisitIfNeeded('InConsultation');
        if (!activeVisit) {
          if (snapshot.epoch === draftSaveEpochRef.current) {
            setDraftSaveStatus('error');
          }
          return null;
        }
      }

      if (snapshot.epoch !== draftSaveEpochRef.current) {
        return null;
      }

      const payloadWithQueue: CreateConsultationRequest = {
        ...snapshot.payload,
        queueItemId: activeVisit.id,
        appointmentId: activeVisit.appointmentId ?? snapshot.payload.appointmentId,
      };

      const existingId =
        consultationIdRef.current ||
        snapshot.consultationId ||
        savedConsultationByVisitRef.current[activeVisit.id] ||
        null;

      const [saved, saveErr] = existingId
        ? await clinicService.updateConsultation(existingId, payloadWithQueue)
        : await clinicService.createConsultation(payloadWithQueue);

      if (snapshot.epoch !== draftSaveEpochRef.current) {
        if (saved?.id) {
          savedConsultationByVisitRef.current[activeVisit.id] = saved.id;
        }
        return saved?.id ?? null;
      }

      if (saveErr || !saved?.id) {
        setDraftSaveStatus('error');
        return null;
      }

      savedConsultationByVisitRef.current[activeVisit.id] = saved.id;
      consultationIdRef.current = saved.id;
      setSignedConsultationId(saved.id);
      const clientSavedAtIso = new Date().toISOString();
      const savedAtIso = saved.updatedAt || saved.createdAt || clientSavedAtIso;
      saveLocalConsultationDraft({
        version: 1,
        savedAt: clientSavedAtIso,
        clinicId: activeVisit.clinicId || settings?.clinicId || null,
        visitId: activeVisit.id,
        patientId: activeVisit.patientId,
        consultationId: saved.id,
        fingerprint: snapshot.fingerprint,
        payload: payloadWithQueue,
      });
      lastPersistedFingerprintRef.current = snapshot.fingerprint;
      if (latestUnsavedSnapshotRef.current?.fingerprint === snapshot.fingerprint) {
        latestUnsavedSnapshotRef.current = null;
      }
      setDraftSaveStatus('saved');
      setLastDraftSavedAt(savedAtIso);
      return saved.id;
    };

    const promise = executeSave().finally(() => {
      inFlightFingerprintRef.current = '';
      inFlightDraftSavePromiseRef.current = null;
      const nextQueued = queuedDraftSnapshotRef.current;
      queuedDraftSnapshotRef.current = null;
      if (
        nextQueued &&
        nextQueued.epoch === draftSaveEpochRef.current &&
        nextQueued.fingerprint !== lastPersistedFingerprintRef.current
      ) {
        void persistDraftSnapshot(nextQueued);
      }
    });

    inFlightDraftSavePromiseRef.current = promise;
    return promise;
  };

  useEffect(() => {
    if (
      !selectedPatient ||
      !signer ||
      !currentDraftPayload ||
      !currentDraftFingerprint ||
      contextLoading ||
      isSigned ||
      isSigning ||
      isAbandoningDraft
    ) {
      return;
    }

    if (needsBaselineCaptureRef.current) {
      lastPersistedFingerprintRef.current = currentDraftFingerprint;
      latestUnsavedSnapshotRef.current = null;
      needsBaselineCaptureRef.current = false;
      return;
    }

    if (currentDraftFingerprint === lastPersistedFingerprintRef.current) {
      latestUnsavedSnapshotRef.current = null;
      return;
    }

    if (currentDraftFingerprint === inFlightFingerprintRef.current) {
      return;
    }

    if (serverReadiness !== null) {
      setServerReadiness(null);
    }

    const snapshot: DraftSaveSnapshot = {
      epoch: draftSaveEpochRef.current,
      visit: selectedPatient,
      doctor: { id: signer.id, name: signer.name },
      consultationId: consultationIdRef.current,
      isFollowUpEncounter,
      payload: currentDraftPayload,
      fingerprint: currentDraftFingerprint,
    };

    latestUnsavedSnapshotRef.current = snapshot;
    saveLocalConsultationDraft({
      version: 1,
      savedAt: new Date().toISOString(),
      clinicId: selectedPatient.clinicId || settings?.clinicId || null,
      visitId: selectedPatient.id,
      patientId: selectedPatient.patientId,
      consultationId: consultationIdRef.current,
      fingerprint: currentDraftFingerprint,
      payload: currentDraftPayload,
    });

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void persistDraftSnapshot(snapshot);
    }, 500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    selectedPatient,
    signer?.id,
    signer?.name,
    currentDraftPayload,
    currentDraftFingerprint,
    contextLoading,
    isSigned,
    isSigning,
    isAbandoningDraft,
    isFollowUpEncounter,
    serverReadiness,
  ]);

  useEffect(() => {
    const flushPendingSnapshot = (preferKeepalive: boolean) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const pending = latestUnsavedSnapshotRef.current;
      if (!pending) return;
      latestUnsavedSnapshotRef.current = null;

      if (preferKeepalive && !pending.visit.id.startsWith('ephemeral-')) {
        const resolvedId =
          consultationIdRef.current ||
          pending.consultationId ||
          savedConsultationByVisitRef.current[pending.visit.id] ||
          null;
        if (!resolvedId && inFlightDraftSavePromiseRef.current) {
          return;
        }
        const dispatched = clinicService.flushConsultationDraftKeepalive(resolvedId, {
          ...pending.payload,
          queueItemId: pending.visit.id,
          appointmentId: pending.visit.appointmentId ?? pending.payload.appointmentId,
        });
        if (dispatched) {
          return;
        }
      }
      void flushOutgoingDraftSnapshot(pending);
    };

    const handlePageUnload = () => {
      flushPendingSnapshot(true);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        flushPendingSnapshot(true);
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', handlePageUnload);
      window.addEventListener('beforeunload', handlePageUnload);
      window.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('pagehide', handlePageUnload);
        window.removeEventListener('beforeunload', handlePageUnload);
        window.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      flushPendingSnapshot(false);
    };
  }, []);

  const handleRetryDraftSave = () => {
    if (!selectedPatient || !signer || !currentDraftPayload || isSigned || isSigning) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const snapshot: DraftSaveSnapshot = {
      epoch: draftSaveEpochRef.current,
      visit: selectedPatient,
      doctor: { id: signer.id, name: signer.name },
      consultationId: consultationIdRef.current,
      isFollowUpEncounter,
      payload: currentDraftPayload,
      fingerprint: currentDraftFingerprint,
    };
    latestUnsavedSnapshotRef.current = snapshot;
    void persistDraftSnapshot(snapshot);
  };

  const ensureDraftConsultationSaved = async (
    activeVisit: PatientQueueItem,
    doctor: { id: string; name: string },
  ): Promise<string | null> => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    queuedDraftSnapshotRef.current = null;
    if (inFlightDraftSavePromiseRef.current) {
      await inFlightDraftSavePromiseRef.current.catch(() => null);
    }
    const basePayload =
      currentDraftPayload ??
      buildConsultationDraftPayload({
        patientId: activeVisit.patientId,
        patientName: activeVisit.patientName,
        doctorId: doctor.id,
        doctorName: doctor.name,
        queueItemId: activeVisit.id,
        appointmentId: activeVisit.appointmentId,
        hasExistingConsultation: true,
        specialtyMode: settings?.specialtyMode,
        isDentalEnabled,
        visitWorkflowMode,
        isYakapEligible,
        philHealthAtc,
        doctorPrc,
        doctorPtr,
        doctorS2,
        doctorPan,
        fallbackPrc: signerStaff?.prcLicenseNumber ?? undefined,
        fallbackPtr: signerStaff?.ptrNumber ?? undefined,
        fallbackS2: signerStaff?.s2LicenseNumber ?? undefined,
        fallbackPan: signerStaff?.philHealthPan ?? undefined,
        subjective,
        objective,
        assessment,
        plan,
        homeInstructions,
        rosCategory,
        rosCategories,
        rosItems,
        selectedSymptomCodes,
        painSymptomSelected,
        otherSymptomSelected,
        symptomPainSite,
        symptomOtherDesc,
        physicalExamFindings,
        obGyneExam,
        pediatricMilestones,
        adolescentAssessment,
        headsssAssessments,
        bpMonitoringLogs,
        planManagement,
        completedLabResultsCount: completedLabResultsCountForDraft,
        hasIssuedReferral: Boolean(issuedReferral),
        selectedDiagnoses,
        prescriptions,
        orderedLabs,
        orderedProcedures,
        dentalChart,
        cdsOverrideReason,
        overrideConfirmed,
        medCertFitness,
        medCertRestDays,
        medCertPurpose,
        medCertRemarks,
        refFacility,
        refDepartment,
        refUrgency,
        refReason,
        refSummary,
        showAddRx,
        newRxGeneric,
        newRxDosage,
        newRxForm,
        newRxSig,
        newRxQuantity,
        newRxClinicDispensedQty,
        newRxDangerous,
        newRxDrugCode,
      });

    const payloadWithQueue: CreateConsultationRequest = {
      ...basePayload,
      patientId: activeVisit.patientId,
      patientName: activeVisit.patientName,
      doctorId: doctor.id,
      doctorName: doctor.name,
      queueItemId: activeVisit.id,
      appointmentId: activeVisit.appointmentId,
    };

    const existingId =
      consultationIdRef.current ||
      signedConsultationId ||
      savedConsultationByVisitRef.current[activeVisit.id] ||
      null;

    setDraftSaveStatus('saving');
    const [draft, draftErr] = existingId
      ? await clinicService.updateConsultation(existingId, payloadWithQueue)
      : await clinicService.createConsultation(payloadWithQueue);

    if (draftErr || !draft?.id) {
      setDraftSaveStatus('error');
      Alert.alert(
        'Unable to stage consultation draft',
        draftErr?.message || 'Could not initialize the unsigned consultation encounter.',
      );
      return null;
    }

    savedConsultationByVisitRef.current[activeVisit.id] = draft.id;
    consultationIdRef.current = draft.id;
    setSignedConsultationId(draft.id);
    const { queueItemId: _omitQueueItemId, ...fingerprintPayload } = payloadWithQueue;
    lastPersistedFingerprintRef.current = JSON.stringify(fingerprintPayload);
    latestUnsavedSnapshotRef.current = null;
    setDraftSaveStatus('saved');
    setLastDraftSavedAt(draft.updatedAt || draft.createdAt || new Date().toISOString());
    return draft.id;
  };

  const handleIssueMedCert = async () => {
    if (!selectedPatient) return;
    const doctor = requireSigner();
    if (!doctor) return;
    const diagnosis = primaryDiagnosisText();
    if (!diagnosis) {
      Alert.alert('Diagnosis required', 'Enter an assessment or add a diagnosis before issuing a medical certificate.');
      return;
    }
    if (!doctorPrc.trim()) {
      Alert.alert('PRC license required', 'Enter the PRC license number under Attending physician before issuing documents.');
      return;
    }
    setIssuingMedCert(true);
    const activeVisit = await materializeVisitIfNeeded('InConsultation');
    if (!activeVisit) {
      setIssuingMedCert(false);
      return;
    }
    const linkedConsultationId = await ensureDraftConsultationSaved(activeVisit, doctor);
    if (!linkedConsultationId) {
      setIssuingMedCert(false);
      return;
    }
    const [cert, certErr] = await clinicService.issueMedicalCertificate({
      patientId: activeVisit.patientId,
      patientName: activeVisit.patientName,
      consultationId: linkedConsultationId,
      queueItemId: activeVisit.id,
      doctorId: doctor.id,
      doctorName: doctor.name,
      prcLicenseNumber: doctorPrc.trim(),
      ptrNumber: doctorPtr.trim() || undefined,
      diagnosis,
      clinicalFindings: objective.trim() || undefined,
      fitnessStatus: medCertFitness,
      recommendedRestDays: parseInt(medCertRestDays, 10) || undefined,
      purpose: medCertPurpose.trim() || undefined,
      remarks: medCertRemarks.trim() || undefined,
    });
    setIssuingMedCert(false);

    if (certErr || !cert) {
      Alert.alert('Certificate not issued', certErr?.message || 'The medical certificate could not be issued. Please try again.');
      return;
    }
    setIssuedMedCert(isSigned ? cert : { ...cert, isSigned: false });
    setMedCertModalVisible(false);
    setPreviewType('MEDCERT');
    setPreviewDocModal(true);
  };

  const handleOpenIssueReferral = () => {
    if (!refDiagnosis.trim()) {
      setRefDiagnosis(primaryDiagnosisText());
    }
    if (!refSummary.trim() && subjective.trim()) {
      setRefSummary(subjective.trim());
    }
    setRefValidationAttempted(false);
    setReferralModalVisible(true);
  };

  const handleIssueReferral = async () => {
    if (!selectedPatient) return;
    const doctor = requireSigner();
    if (!doctor) return;

    setRefValidationAttempted(true);

    if (!refFacility.trim()) {
      Alert.alert('Missing Destination', 'Please enter the receiving facility name.');
      return;
    }
    if (!refDepartment.trim()) {
      Alert.alert('Missing Destination', 'Please enter the receiving department or specialty.');
      return;
    }
    if (!refReason.trim()) {
      Alert.alert('Missing Reason', 'Please specify the reason for referral.');
      return;
    }
    const diagnosis = refDiagnosis.trim() || primaryDiagnosisText();
    if (!diagnosis) {
      Alert.alert(
        'Missing Diagnosis',
        'Please provide a provisional diagnosis or assessment for the referral letter.',
      );
      return;
    }
    const summary = refSummary.trim() || subjective.trim();
    if (!summary) {
      Alert.alert(
        'Missing Clinical Summary',
        'Please provide a brief clinical summary or enter subjective consultation notes.',
      );
      return;
    }
    setIssuingReferral(true);
    const activeVisit = await materializeVisitIfNeeded('InConsultation');
    if (!activeVisit) {
      setIssuingReferral(false);
      return;
    }
    const linkedConsultationId = await ensureDraftConsultationSaved(activeVisit, doctor);
    if (!linkedConsultationId) {
      setIssuingReferral(false);
      return;
    }
    const [ref, refErr] = await clinicService.issueReferralLetter({
      patientId: activeVisit.patientId,
      patientName: activeVisit.patientName,
      consultationId: linkedConsultationId,
      queueItemId: activeVisit.id,
      referringDoctorId: doctor.id,
      referringDoctorName: doctor.name,
      referredToFacility: refFacility.trim(),
      referredDepartment: refDepartment.trim(),
      urgency: refUrgency,
      reasonForReferral: refReason.trim(),
      provisionalDiagnosis: diagnosis,
      clinicalSummary: summary,
    });
    setIssuingReferral(false);

    if (refErr || !ref) {
      Alert.alert('Referral not issued', refErr?.message || 'The referral letter could not be issued. Please try again.');
      return;
    }
    setIssuedReferral(isSigned ? ref : { ...ref, isSigned: false });
    setReferralModalVisible(false);
    setPreviewType('REFERRAL');
    setPreviewDocModal(true);
  };

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    const doctorId = signer?.id;
    const selectedRoomObj =
      selectedStationFilter === 'ALL'
        ? undefined
        : activeRooms.find((r) => r.name === selectedStationFilter);
    const [queueData, queueErr] = await clinicService.getQueue({
      date: getManilaTodayStr(),
      view: queueViewFilter,
      doctorId: queueViewFilter === 'MyRoom' ? doctorId : undefined,
      roomId: selectedRoomObj?.id,
      roomOrStation: selectedStationFilter === 'ALL' ? undefined : selectedStationFilter,
    });
    if (queueErr || !queueData) {
      setQueueError(queueErr?.message || 'Unable to load the patient queue.');
    } else {
      const filtered = queueData.filter((item) =>
        isPatientVisibleToStaff(item, current, activeRooms),
      );
      setPatients(filtered);
      setSelectedPatient((prev) => {
        if (!prev) return prev;
        const fresh = filtered.find((item) => item.id === prev.id);
        return fresh ? { ...prev, ...fresh } : prev;
      });
      setQueueError(null);
    }
    setQueueLoading(false);
  }, [signer?.id, current, queueViewFilter, selectedStationFilter, activeRooms]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Load triage vitals, the patient record (allergies, age, PhilHealth) and lab results for a queue item.
  const loadPatientContext = useCallback(async (p: PatientQueueItem) => {
    activePatientId.current = p.id;
    needsBaselineCaptureRef.current = true;
    setContextLoading(true);
    const [triageRes, recordRes, labRes, chartRes, dentalRes, consultationsRes] = await Promise.all([
      p.id.startsWith('ephemeral-') ? Promise.resolve([null, { status: 404, message: '' }] as const) : clinicService.getTriage(p.id),
      clinicService.getPatientById(p.patientId),
      clinicService.getLabOrders(p.patientId),
      clinicService.getPatientChart(p.patientId),
      clinicService.getPatientDentalChart(p.patientId),
      clinicService.getConsultations(p.patientId),
    ]);
    if (activePatientId.current !== p.id) return;

    const [dentalData] = dentalRes;
    const [chartData] = chartRes;
    const [patientConsultations] = consultationsRes;
    const candidateEncounters =
      Array.isArray(patientConsultations) && patientConsultations.length > 0
        ? patientConsultations
        : chartData?.consultations ?? [];
    const todayStr = getManilaTodayStr();
    const isStandardEphemeral = p.id === `ephemeral-${p.patientId}`;
    const serverMatchedEncounter =
      candidateEncounters.find((c) => c.queueItemId === p.id) ??
      (isStandardEphemeral
        ? candidateEncounters.find(
            (c) =>
              !c.isSigned &&
              Boolean(c.queueItemId) &&
              formatClinicDate(c.encounterDate, { dateFormat: 'yyyy-MM-dd', fallback: '' }) === todayStr,
          )
        : undefined);

    let effectiveVisitId = p.id;
    let resolvedTriageRes = triageRes;
    if (isStandardEphemeral && serverMatchedEncounter?.queueItemId) {
      effectiveVisitId = serverMatchedEncounter.queueItemId;
      activePatientId.current = effectiveVisitId;
      const currentRouteParams = route.params as Record<string, any> | undefined;
      appliedRouteKey.current = `${effectiveVisitId}|${p.patientId}|std|${currentRouteParams?.directVisitMode ?? ''}`;
      (navigation as any).setParams?.({
        queueId: effectiveVisitId,
        queueItemId: effectiveVisitId,
        patientId: p.patientId,
        forceSeparateVisit: undefined,
      });
      setSelectedPatient((prev) =>
        prev && prev.id === p.id ? { ...prev, id: effectiveVisitId, isDirectVisit: true } : prev,
      );
      setPatients((prev) =>
        (prev || []).map((item) =>
          item.id === p.id ? { ...item, id: effectiveVisitId, isDirectVisit: true } : item,
        ),
      );
      resolvedTriageRes = await clinicService.getTriage(effectiveVisitId);
      if (activePatientId.current !== effectiveVisitId) return;
    }

    const localDraft = readLocalConsultationDraft({
      clinicId: p.clinicId || settings?.clinicId || null,
      visitId: effectiveVisitId,
      patientId: p.patientId,
      consultationId: serverMatchedEncounter?.id ?? null,
    });
    const matchedEncounter =
      shouldOverlayLocalConsultationDraft(serverMatchedEncounter, localDraft) && localDraft
        ? mergeConsultationRecordWithLocalDraft(serverMatchedEncounter, localDraft)
        : serverMatchedEncounter;

    const baseDentalTeeth: DentalToothRecord[] = (dentalData?.teeth || []).map((t) => ({
      ...t,
      isCurrentEncounter: Boolean(matchedEncounter?.id && t.consultationId === matchedEncounter.id),
    }));
    if (!matchedEncounter?.isSigned && Array.isArray(matchedEncounter?.draftDentalTeeth)) {
      const stagedDraftTeeth: DentalToothRecord[] = matchedEncounter.draftDentalTeeth.map((dt, idx) => ({
        id: `draft-tooth-${matchedEncounter.id}-${dt.toothNumber}-${idx}`,
        tenantId: p.tenantId || '',
        clinicId: p.clinicId || '',
        patientId: p.patientId,
        consultationId: matchedEncounter.id,
        toothNumber: dt.toothNumber,
        status: dt.status as DentalToothRecord['status'],
        surface: dt.surface ?? null,
        notes: dt.notes ?? null,
        recordedAt: matchedEncounter.updatedAt || matchedEncounter.encounterDate,
        createdAt: matchedEncounter.updatedAt || matchedEncounter.encounterDate,
        isCurrentEncounter: true,
      }));
      const filteredHistorical = baseDentalTeeth.filter(
        (t) => !(matchedEncounter.id && t.consultationId === matchedEncounter.id),
      );
      const mergedTeeth = [...filteredHistorical, ...stagedDraftTeeth];
      setDentalChart(mergedTeeth.length > 0 ? normalizeTeethToMultiRecord(mergedTeeth) : {});
    } else if (baseDentalTeeth.length > 0) {
      setDentalChart(normalizeTeethToMultiRecord(baseDentalTeeth));
    } else {
      setDentalChart({});
    }

    const [triageData, triageErr] = resolvedTriageRes;
    if (triageErr) {
      setVitals(null);
      // 404 means triage has simply not been recorded yet.
      setVitalsError(triageErr.status === 404 ? null : triageErr.message || 'Unable to load triage vitals.');
    } else {
      setVitals(triageData);
      setVitalsError(null);
    }

    const [record, recordErr] = recordRes;
    if (recordErr || !record) {
      setPatientRecord(null);
      setRecordError(recordErr?.message || 'Unable to load patient details.');
    } else {
      setPatientRecord(record);
      setRecordError(null);
    }

    if (chartData) {
      setPatientChart(record ? reconcileChartWithPatient(chartData, record) : chartData);
    } else {
      setPatientChart(null);
    }

    if (chartData || matchedEncounter) {
      const existingEncounter = matchedEncounter;
      if (existingEncounter) {
        const isLocalOnlyEncounter = existingEncounter.id.startsWith('local-draft-');
        if (!isLocalOnlyEncounter) {
          savedConsultationByVisitRef.current[effectiveVisitId] = existingEncounter.id;
          consultationIdRef.current = existingEncounter.id;
          setSignedConsultationId(existingEncounter.id);
        } else {
          consultationIdRef.current = null;
          setSignedConsultationId(null);
          needsBaselineCaptureRef.current = false;
        }
        setIsSigned(Boolean(existingEncounter.isSigned));
        setSignedAt(
          existingEncounter.signedAt
            ? formatClinicTime(existingEncounter.signedAt)
            : null,
        );
        if (existingEncounter.isSigned) {
          setDraftSaveStatus('idle');
          setLastDraftSavedAt(null);
        } else {
          setDraftSaveStatus('saved');
          setLastDraftSavedAt(
            existingEncounter.updatedAt ||
              existingEncounter.createdAt ||
              existingEncounter.encounterDate,
          );
        }
        const workspaceRosCategories = existingEncounter.draftWorkspace?.rosCategories;
        const encounterRosCategories = existingEncounter.rosCategories;
        if (Array.isArray(workspaceRosCategories)) {
          applyRosCategories(workspaceRosCategories);
        } else if (Array.isArray(encounterRosCategories)) {
          applyRosCategories(encounterRosCategories);
        } else if (existingEncounter.rosCategory) {
          const norm = normalizeRosCategoryCode(existingEncounter.rosCategory);
          applyRosCategories(norm !== 'EssentiallyNormal' ? [norm] : []);
        } else if (triageData?.rosCategory) {
          const norm = normalizeRosCategoryCode(triageData.rosCategory);
          applyRosCategories(norm !== 'EssentiallyNormal' ? [norm] : []);
        } else {
          applyRosCategories([]);
        }
        setSubjective(existingEncounter.subjective ?? '');
        setObjective(existingEncounter.objective ?? '');
        setAssessment(existingEncounter.assessment ?? '');
        setPlan(existingEncounter.plan ?? '');
        setHomeInstructions(existingEncounter.homeInstructions ?? '');
        if (existingEncounter.doctorPrcLicense) {
          setDoctorPrc(existingEncounter.doctorPrcLicense);
        }
        if (existingEncounter.doctorPtr) {
          setDoctorPtr(existingEncounter.doctorPtr);
        }
        if (existingEncounter.doctorS2License) {
          setDoctorS2(existingEncounter.doctorS2License);
        }
        if (existingEncounter.doctorPhilHealthPan) {
          setDoctorPan(existingEncounter.doctorPhilHealthPan);
        }
        if (existingEncounter.diagnoses?.length) {
          setSelectedDiagnoses(
            existingEncounter.diagnoses.map((d) => ({
              icd10Code: d.icd10Code,
              description: d.description,
              isPrimary: d.isPrimary,
            })),
          );
        } else {
          setSelectedDiagnoses([]);
        }
        const hydratedRx: LocalPrescription[] = existingEncounter.prescriptions?.length
          ? existingEncounter.prescriptions.map((rx) => ({
              id: rx.id,
              genericName: rx.genericName,
              dosage: rx.dosage,
              form: rx.form,
              sig: rx.sig,
              quantity: rx.quantity,
              durationDays: rx.durationDays,
              isDangerousDrug: rx.isDangerousDrug,
              philHealthDrugCode: rx.philHealthDrugCode,
              clinicDispensedQuantity: rx.clinicDispensedQuantity ?? undefined,
              rosCategory: rx.rosCategory ?? existingEncounter.rosCategory,
            }))
          : [];
        setPrescriptions(hydratedRx);
        let matchedMedCert = chartData?.medicalCertificates?.find(
          (mc) => mc.consultationId === existingEncounter.id,
        );
        let matchedReferral = chartData?.referralLetters?.find(
          (rf) => rf.consultationId === existingEncounter.id,
        );
        if (!existingEncounter.isSigned && (!matchedMedCert || !matchedReferral)) {
          const [draftCertsRes, draftRefsRes] = await Promise.all([
            !matchedMedCert
              ? clinicService.getMedicalCertificates(p.patientId, undefined, { includeUnsigned: true })
              : Promise.resolve([null, null] as const),
            !matchedReferral
              ? clinicService.getReferralLetters(p.patientId, undefined, { includeUnsigned: true })
              : Promise.resolve([null, null] as const),
          ]);
          const [draftCerts] = draftCertsRes;
          const [draftRefs] = draftRefsRes;
          if (!matchedMedCert && draftCerts) {
            matchedMedCert = draftCerts.find(
              (mc) => mc.consultationId === existingEncounter.id || mc.queueItemId === effectiveVisitId,
            );
          }
          if (!matchedReferral && draftRefs) {
            matchedReferral = draftRefs.find(
              (rf) => rf.consultationId === existingEncounter.id || rf.queueItemId === effectiveVisitId,
            );
          }
        }
        setIssuedMedCert(
          matchedMedCert
            ? existingEncounter.isSigned
              ? matchedMedCert
              : { ...matchedMedCert, isSigned: false }
            : null,
        );
        setIssuedReferral(
          matchedReferral
            ? existingEncounter.isSigned
              ? matchedReferral
              : { ...matchedReferral, isSigned: false }
            : null,
        );

        const ws = !existingEncounter.isSigned ? existingEncounter.draftWorkspace : undefined;
        if (ws?.cdsOverrideReason) {
          setCdsOverrideReason(ws.cdsOverrideReason);
        }
        if (ws?.cdsOverrideConfirmed !== undefined) {
          setOverrideConfirmed(Boolean(ws.cdsOverrideConfirmed));
          if (ws.cdsOverrideConfirmed || ws.cdsOverrideReason) {
            setShowOverrideInput(true);
          }
        }
        if (!existingEncounter.isSigned && hydratedRx.length > 0) {
          void runCdsScreening(hydratedRx, {
            patientId: p.patientId,
            allergies: record?.allergies ?? '',
            labOrdersList: labRes[0] ?? [],
            preserveOverrideState: Boolean(ws?.cdsOverrideConfirmed || ws?.cdsOverrideReason),
          });
        }
        if (matchedMedCert) {
          setMedCertFitness(matchedMedCert.fitnessStatus || ws?.medCertFitness || 'FitToWork');
          setMedCertRestDays(
            matchedMedCert.recommendedRestDays != null
              ? String(matchedMedCert.recommendedRestDays)
              : ws?.medCertRestDays || '',
          );
          setMedCertPurpose(matchedMedCert.purpose || ws?.medCertPurpose || '');
          setMedCertRemarks(matchedMedCert.remarks || ws?.medCertRemarks || '');
        } else if (ws) {
          if (ws.medCertFitness) setMedCertFitness(ws.medCertFitness);
          if (ws.medCertRestDays != null) setMedCertRestDays(ws.medCertRestDays);
          if (ws.medCertPurpose != null) setMedCertPurpose(ws.medCertPurpose);
          if (ws.medCertRemarks != null) setMedCertRemarks(ws.medCertRemarks);
        }
        if (matchedReferral) {
          setRefFacility(matchedReferral.referredToFacility || ws?.refFacility || '');
          setRefDepartment(matchedReferral.referredDepartment || ws?.refDepartment || '');
          setRefUrgency(matchedReferral.urgency || ws?.refUrgency || 'Routine');
          setRefReason(matchedReferral.reasonForReferral || ws?.refReason || '');
          setRefSummary(matchedReferral.clinicalSummary || ws?.refSummary || '');
        } else if (ws) {
          if (ws.refFacility != null) setRefFacility(ws.refFacility);
          if (ws.refDepartment != null) setRefDepartment(ws.refDepartment);
          if (ws.refUrgency) setRefUrgency(ws.refUrgency);
          if (ws.refReason != null) setRefReason(ws.refReason);
          if (ws.refSummary != null) setRefSummary(ws.refSummary);
        }
        if (ws) {
          if (ws.rxShowAddForm !== undefined) setShowAddRx(Boolean(ws.rxShowAddForm));
          if (ws.rxDraftGeneric != null) setNewRxGeneric(ws.rxDraftGeneric);
          if (ws.rxDraftDosage != null) setNewRxDosage(ws.rxDraftDosage);
          if (ws.rxDraftForm) setNewRxForm(ws.rxDraftForm);
          if (ws.rxDraftSig != null) setNewRxSig(ws.rxDraftSig);
          if (ws.rxDraftQuantity != null) setNewRxQuantity(ws.rxDraftQuantity);
          if (ws.rxDraftClinicDispensedQty != null) {
            setNewRxClinicDispensedQty(ws.rxDraftClinicDispensedQty);
          }
          if (ws.rxDraftDangerous !== undefined) setNewRxDangerous(Boolean(ws.rxDraftDangerous));
          if (ws.rxDraftDrugCode != null) setNewRxDrugCode(ws.rxDraftDrugCode);
        }

        const hydratedMode: VisitWorkflowMode | null = existingEncounter.visitWorkflowMode
          ? existingEncounter.visitWorkflowMode
          : existingEncounter.isYakapEligible != null
            ? existingEncounter.isYakapEligible
              ? 'YakapAvailment'
              : 'Regular'
            : null;
        if (hydratedMode) {
          setVisitWorkflowMode(hydratedMode);
          setIsYakapEligible(hydratedMode === 'YakapAvailment');
          setSelectedPatient((prev) =>
            prev && prev.id === effectiveVisitId
              ? { ...prev, visitWorkflowMode: hydratedMode }
              : prev,
          );
          setPatients((prev) =>
            (prev || []).map((item) =>
              item.id === effectiveVisitId
                ? { ...item, visitWorkflowMode: hydratedMode }
                : item,
            ),
          );
        }
        setPhilHealthAtc(existingEncounter.philHealthAtc?.trim() ? existingEncounter.philHealthAtc : 'WALKEDIN');
        const positiveRosItems = (existingEncounter.reviewOfSystemsItems || []).filter(
          (item) => item.isPertinentPositive !== false && item.optionCode !== '00',
        );
        if (positiveRosItems.length > 0) {
          setRosItems(positiveRosItems);
          setSelectedSymptomCodes(positiveRosItems.map((i) => i.optionCode));
          const hydratedPain = positiveRosItems.find((i) => Boolean(i.painSite));
          if (!existingEncounter.philHealthPainSite && hydratedPain?.painSite) {
            setSymptomPainSite(hydratedPain.painSite);
          }
          const hydratedOther = positiveRosItems.find((i) => Boolean(i.othersSpecifyText));
          if (!existingEncounter.philHealthOtherComplaint && hydratedOther?.othersSpecifyText) {
            setSymptomOtherDesc(hydratedOther.othersSpecifyText);
          }
        } else if (existingEncounter.philHealthSignSympCode) {
          const codes = existingEncounter.philHealthSignSympCode
            .split(',')
            .map((s) => s.trim())
            .filter((code) => Boolean(code) && code !== '00');
          setSelectedSymptomCodes(codes);
          setRosItems(
            codes.map((c) => ({
              optionCode: c,
              symptomName: c,
              isPertinentPositive: true,
            })),
          );
        } else {
          setRosItems([]);
          setSelectedSymptomCodes([]);
        }
        setObGyneExam(existingEncounter.obGyneExam ?? null);
        setPediatricMilestones(existingEncounter.pediatricMilestones ?? []);
        setAdolescentAssessment(existingEncounter.adolescentAssessment ?? null);
        setHeadsssAssessments(existingEncounter.headsssAssessments ?? []);
        setBpMonitoringLogs(existingEncounter.bpMonitoringLogs ?? []);
        if (existingEncounter.philHealthOtherComplaint != null) {
          setSymptomOtherDesc(existingEncounter.philHealthOtherComplaint);
        }
        if (existingEncounter.philHealthPainSite != null) {
          setSymptomPainSite(existingEncounter.philHealthPainSite);
        }
        setPlanManagement(rehydrateEncounterPlanManagementWithWorkspace(existingEncounter));
        // Bidirectional Physical Exam Hydration: 1NF relational child rows first, fallback to JSON blob
        const reconstructed1NF = existingEncounter.physicalExams?.length
          ? from1NFFindings(existingEncounter.physicalExams)
          : null;

        if (reconstructed1NF) {
          setPhysicalExamFindings(reconstructed1NF);
        } else if (existingEncounter.physicalExamFindingsJson) {
          try {
            const parsedPe = JSON.parse(existingEncounter.physicalExamFindingsJson);
            if (parsedPe && typeof parsedPe === 'object') {
              setPhysicalExamFindings((prev) => ({ ...prev, ...parsedPe }));
            }
          } catch {
            // Keep default PE findings on malformed JSON
          }
        }

        const existingInvoice = chartData?.invoicesHistory?.find(
          (inv) =>
            (existingEncounter.id && inv.consultationId === existingEncounter.id) ||
            (effectiveVisitId && inv.queueItemId === effectiveVisitId)
        );

        // Rehydrate orderedLabs: prefer persisted draftDiagnosticOrders when unsigned, else invoice + labOrders
        if (!existingEncounter.isSigned && Array.isArray(existingEncounter.draftDiagnosticOrders)) {
          setOrderedLabs(
            existingEncounter.draftDiagnosticOrders.map((d) => ({
              serviceItemId: d.serviceItemId,
              code: d.code,
              name: d.name,
              category: d.category || 'Diagnostic',
              standardPrice: d.standardPrice ?? 0,
              philHealthCode: d.philHealthCode,
              fulfillmentMode: d.fulfillmentMode === 'outside' ? 'outside' : 'in_house',
              instructions: d.instructions,
            })),
          );
        } else {
          // Rehydrate orderedLabs from invoice diagnostic items (in-house) and lab orders (outside)
          const rehydratedLabs: LocalLabOrder[] = [];
          if (existingInvoice?.lineItems?.length) {
            const diagItems = existingInvoice.lineItems.filter(
              (item) => (item.category || '').toLowerCase() === 'diagnostic'
            );
            for (const item of diagItems) {
              const cleanName = item.description
                ? item.description.replace(/\s*\(PhilHealth Yakap.*?\)$/i, '').trim()
                : item.description;
              const matchedDiag = diagnosticCatalog.find(
                (d) =>
                  (item.serviceItemId && d.id === item.serviceItemId) ||
                  (item.itemCode && d.code === item.itemCode) ||
                  d.name.toLowerCase() === cleanName.toLowerCase()
              );
              rehydratedLabs.push({
                serviceItemId: item.serviceItemId || matchedDiag?.id,
                code: item.itemCode || matchedDiag?.code,
                name: matchedDiag?.name || cleanName,
                category: item.category || matchedDiag?.category || 'Diagnostic',
                standardPrice: matchedDiag?.standardPrice ?? item.unitPrice,
                philHealthCode: matchedDiag?.philHealthCode,
                fulfillmentMode: 'in_house',
              });
            }
          }

          let labSourceList = chartData?.labOrdersHistory || [];
          if (!existingEncounter.isSigned) {
            const [unsignedLabOrders] = await clinicService.getLabOrders(
              p.patientId,
              undefined,
              undefined,
              { includeUnsigned: true },
            );
            if (unsignedLabOrders?.length) {
              labSourceList = unsignedLabOrders;
            }
          }

          const existingLabOrders = labSourceList.filter(
            (lo) =>
              lo.status !== 'Cancelled' &&
              ((existingEncounter.id && lo.consultationId === existingEncounter.id) ||
                (effectiveVisitId && (lo as any).queueItemId === effectiveVisitId))
          );
          if (existingLabOrders?.length) {
            for (const lo of existingLabOrders) {
              if (lo.items?.length) {
                for (const item of lo.items) {
                  const matchedDiag = diagnosticCatalog.find(
                    (d) => d.name.toLowerCase() === item.testName.toLowerCase()
                  );
                  rehydratedLabs.push({
                    serviceItemId: matchedDiag?.id,
                    code: matchedDiag?.code,
                    name: item.testName,
                    category: item.category || matchedDiag?.category || 'Diagnostic',
                    standardPrice: matchedDiag?.standardPrice ?? 0,
                    philHealthCode: matchedDiag?.philHealthCode,
                    fulfillmentMode: 'outside',
                    instructions: item.instructions,
                  });
                }
              } else if (lo.testName) {
                const matchedDiag = diagnosticCatalog.find(
                  (d) => d.name.toLowerCase() === lo.testName?.toLowerCase()
                );
                rehydratedLabs.push({
                  serviceItemId: matchedDiag?.id,
                  code: matchedDiag?.code,
                  name: lo.testName,
                  category: matchedDiag?.category || 'Diagnostic',
                  standardPrice: matchedDiag?.standardPrice ?? 0,
                  philHealthCode: matchedDiag?.philHealthCode,
                  fulfillmentMode: 'outside',
                  instructions: lo.notes,
                });
              }
            }
          }

          // Deduplicate rehydratedLabs by name
          const uniqueLabs: LocalLabOrder[] = [];
          const seenLabNames = new Set<string>();
          for (const lab of rehydratedLabs) {
            const lower = lab.name.toLowerCase();
            if (!seenLabNames.has(lower)) {
              seenLabNames.add(lower);
              uniqueLabs.push(lab);
            }
          }
          setOrderedLabs(uniqueLabs);
        }

        // Rehydrate orderedProcedures from proceduresHistory, persisted draftProcedures, and invoice line items
        const existingProcedures = chartData?.proceduresHistory?.filter(
          (proc) =>
            proc.status !== 'Cancelled' &&
            ((existingEncounter.id && proc.consultationId === existingEncounter.id) ||
              (effectiveVisitId && proc.queueItemId === effectiveVisitId))
        );
        const rehydratedProcs: LocalProcedureOrder[] = [];
        const seenProcKeys = new Set<string>();

        if (existingProcedures && existingProcedures.length > 0) {
          for (const pr of existingProcedures) {
            if (!pr.procedureName) continue;
            const lower = pr.procedureName.toLowerCase();
            const procKey = `${lower}-${pr.toothNumber ?? '0'}`;
            if (!seenProcKeys.has(procKey)) {
              seenProcKeys.add(procKey);
              const matchedCatalog = procedureCatalog.find((pc) => pc.name.toLowerCase() === lower);
              rehydratedProcs.push({
                procedureId: pr.id,
                serviceItemId: matchedCatalog?.id,
                code: pr.procedureCode || matchedCatalog?.code,
                name: pr.procedureName,
                category: pr.category || matchedCatalog?.category || 'Procedure',
                standardPrice: matchedCatalog?.standardPrice ?? 0,
                instructions: pr.clinicalNotes || undefined,
                roomId: pr.targetRoomId || undefined,
                roomName: pr.targetRoomName || undefined,
                targetRoomId: pr.targetRoomId || undefined,
                targetRoomName: pr.targetRoomName || undefined,
                sentToRoomId: pr.targetRoomId || undefined,
                sentToRoomName: pr.targetRoomName || undefined,
                status: 'sent_to_room',
                isHandedOff: true,
                handedOffAt: pr.scheduledAt
                  ? formatClinicTime(pr.scheduledAt)
                  : undefined,
                toothNumber: pr.toothNumber ?? undefined,
                toothSurface: pr.toothSurface ?? undefined,
              });
            }
          }
        }

        if (!existingEncounter.isSigned && Array.isArray(existingEncounter.draftProcedures)) {
          for (const dp of existingEncounter.draftProcedures) {
            if (!dp.name) continue;
            const lower = dp.name.toLowerCase();
            const procKey = `${lower}-${dp.toothNumber ?? '0'}`;
            if (!seenProcKeys.has(procKey)) {
              seenProcKeys.add(procKey);
              rehydratedProcs.push({
                serviceItemId: dp.serviceItemId,
                code: dp.code,
                name: dp.name,
                category: dp.category || 'Procedure',
                standardPrice: dp.standardPrice ?? 0,
                instructions: dp.instructions,
                roomId: dp.roomId,
                roomName: dp.roomName,
                targetRoomId: dp.targetRoomId,
                targetRoomName: dp.targetRoomName,
                status: dp.status === 'sent_to_room' ? 'sent_to_room' : 'draft',
                isHandedOff: Boolean(dp.isHandedOff),
                toothNumber: dp.toothNumber,
                toothSurface: dp.toothSurface,
              });
            }
          }
        } else {
          const invoiceProcLineItems = (existingInvoice?.lineItems || []).filter((li) => {
            const cat = (li.category || '').toLowerCase();
            return cat === 'procedure' || cat === 'nursingservice';
          });

          for (const li of invoiceProcLineItems) {
            if (!li.description) continue;
            const lower = li.description.toLowerCase();
            const procKey = `${lower}-0`;
            if (!seenProcKeys.has(procKey)) {
              seenProcKeys.add(procKey);
              const matchedCatalog = procedureCatalog.find((pc) => pc.name.toLowerCase() === lower);
              rehydratedProcs.push({
                serviceItemId: li.serviceItemId || matchedCatalog?.id,
                code: li.itemCode || matchedCatalog?.code,
                name: li.description,
                category: li.category || matchedCatalog?.category || 'Procedure',
                standardPrice: li.unitPrice || matchedCatalog?.standardPrice || 0,
                isHandedOff: false,
              });
            }
          }
        }

        setOrderedProcedures(rehydratedProcs);
      } else {
        consultationIdRef.current = null;
        setDraftSaveStatus('idle');
        setLastDraftSavedAt(null);
        const triageRos = triageData?.rosCategory
          ? normalizeRosCategoryCode(triageData.rosCategory)
          : null;
        applyRosCategories(
          triageRos && triageRos !== 'EssentiallyNormal' ? [triageRos] : [],
        );
      }
    } else if (triageData?.rosCategory) {
      consultationIdRef.current = null;
      setDraftSaveStatus('idle');
      setLastDraftSavedAt(null);
      const triageRos = normalizeRosCategoryCode(triageData.rosCategory);
      applyRosCategories(triageRos !== 'EssentiallyNormal' ? [triageRos] : []);
    } else {
      consultationIdRef.current = null;
      setDraftSaveStatus('idle');
      setLastDraftSavedAt(null);
      applyRosCategories([]);
    }

    const [labData, labErr] = labRes;
    if (labErr || !labData) {
      setLabOrders([]);
      setLabError(labErr?.message || 'Unable to load laboratory results.');
    } else {
      setLabOrders(labData);
      setLabError(null);
    }
    setContextLoading(false);
  }, []);

  const resetEncounter = (p: PatientQueueItem) => {
    needsBaselineCaptureRef.current = true;
    consultationIdRef.current = null;
    setDraftSaveStatus('idle');
    setLastDraftSavedAt(null);
    setServerReadiness(null);
    setIsSigned(false);
    setSignedAt(null);
    setIsFollowUpEncounter(false);
    setBanner(null);
    setSubjective(p.chiefComplaint ? `Patient presents with: ${p.chiefComplaint}.` : '');
    setObjective('');
    setImportedProcedureIds([]);
    setAssessment('');
    setPlan('');
    setHomeInstructions('');
    setSelectedDiagnoses([]);
    setPrescriptions([]);
    setOrderedLabs([]);
    setOrderedProcedures([]);
    setDentalChart({});
    setOrderInitialToothNumber(undefined);
    setOrderInitialToothSurface(undefined);
    setSelectedSymptomCodes([]);
    setSymptomOtherDesc('');
    setSymptomPainSite('');
    setCdsAlerts([]);
    setCdsUsedLocalRules(false);
    setCdsOverrideReason('');
    setShowOverrideInput(false);
    setOverrideConfirmed(false);
    setMedCertFitness('FitToWork');
    setMedCertRestDays('');
    setMedCertPurpose('');
    setMedCertRemarks('');
    setRefFacility('');
    setRefDepartment('');
    setRefUrgency('Routine');
    setRefReason('');
    setRefSummary('');
    setRefDiagnosis('');
    setRefValidationAttempted(false);
    setDoctorPrc(signerPrc);
    setDoctorPtr(signerPtr);
    setDoctorS2(signerS2);
    setDoctorPan(signerPan);
    setIssuedMedCert(null);
    setIssuedReferral(null);
    setSignedConsultationId(null);
    setPrescriptionSlip(null);
    setShowAddRx(false);
    setIcdQuery('');
    setIcdResults([]);
    setIcdNotice(null);
    setShowIcdDropdown(false);
    setVitals(null);
    setVitalsError(null);
    setPatientRecord(null);
    setPatientChart(null);
    setRecordError(null);
    setLabOrders([]);
    setLabError(null);
    const initialYakap =
      p.visitWorkflowMode === 'YakapAvailment' || p.visitType === 'YakapAvailment';
    setIsYakapEligible(initialYakap);
    setVisitWorkflowMode(initialYakap ? 'YakapAvailment' : 'Regular');
    setRosCategory('EssentiallyNormal');
    setRosCategories([]);
    setNewRxGeneric('');
    setNewRxDosage('');
    setNewRxForm('Tablet');
    setNewRxSig('');
    setNewRxQuantity('30');
    setNewRxClinicDispensedQty('');
    setNewRxDangerous(false);
    setNewRxDrugCode('');
    setSelectedCatalogMedId('');
    setRxCatalogQuery('');
    setRosItems([]);
    setObGyneExam(null);
    setPediatricMilestones([]);
    setAdolescentAssessment(null);
    setHeadsssAssessments([]);
    setBpMonitoringLogs([]);
    setPlanManagement({ ...DEFAULT_YAKAP_PLAN_MANAGEMENT });
    setPhilHealthAtc('WALKEDIN');
    setChartTabHistory([]);
    setPhysicalExamFindings({ ...DEFAULT_PHYSICAL_EXAM_NORMAL });
    setChargeSlipItems([]);
    setPostEncounterModalVisible(false);
  };

  const materializeVisitIfNeeded = async (
    initialStatus: QueueStatus = 'InConsultation'
  ): Promise<PatientQueueItem | null> => {
    if (!selectedPatient) return null;
    if (!selectedPatient.id.startsWith('ephemeral-')) {
      return selectedPatient;
    }

    if (materializingVisitPromiseRef.current) {
      return materializingVisitPromiseRef.current;
    }

    const targetEphemeral = selectedPatient;
    const promise = (async (): Promise<PatientQueueItem | null> => {
      const doctor = requireSigner();
      const doctorId = doctor?.id || current?.id;
      const doctorName = doctor?.name || (current ? formatStaffName(current) : undefined);
      const isYakap =
        visitWorkflowMode === 'YakapAvailment' ||
        targetEphemeral.visitType === 'YakapAvailment' ||
        targetEphemeral.visitWorkflowMode === 'YakapAvailment' ||
        isYakapEligible;

      const [directVisit, err] = await clinicService.ensureDirectVisit({
        patientId: targetEphemeral.patientId,
        patientName: targetEphemeral.patientName,
        doctorId,
        doctorName,
        visitType: 'RoutineCheckup',
        visitWorkflowMode: isYakap ? 'YakapAvailment' : 'Regular',
        initialStatus,
        chiefComplaint: targetEphemeral.chiefComplaint,
        allowDuplicateActive: isFollowUpEncounter,
      });

      if (err || !directVisit) {
        notify.error(err?.message || 'Could not materialize direct visit record.');
        return null;
      }

      const materialized: PatientQueueItem = {
        ...targetEphemeral,
        ...directVisit,
        isDirectVisit: true,
      };

      if (activePatientId.current === targetEphemeral.id) {
        activePatientId.current = materialized.id;
        setSelectedPatient(materialized);
        const currentRouteParams = route.params as Record<string, any> | undefined;
        appliedRouteKey.current = `${materialized.id}|${materialized.patientId}|std|${currentRouteParams?.directVisitMode ?? ''}`;
        (navigation as any).setParams?.({
          queueId: materialized.id,
          queueItemId: materialized.id,
          patientId: materialized.patientId,
          forceSeparateVisit: undefined,
        });
      }
      setPatients((prev) =>
        (prev || []).map((p) => (p.id === targetEphemeral.id ? materialized : p))
      );
      return materialized;
    })().finally(() => {
      materializingVisitPromiseRef.current = null;
    });

    materializingVisitPromiseRef.current = promise;
    return promise;
  };

  const handleStartFollowUpEncounter = () => {
    if (!selectedPatient) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const outgoing = latestUnsavedSnapshotRef.current;
    if (outgoing) {
      latestUnsavedSnapshotRef.current = null;
      void flushOutgoingDraftSnapshot(outgoing);
    }
    draftSaveEpochRef.current += 1;
    inFlightFingerprintRef.current = '';
    queuedDraftSnapshotRef.current = null;
    needsBaselineCaptureRef.current = true;
    consultationIdRef.current = null;
    setDraftSaveStatus('idle');
    setLastDraftSavedAt(null);
    setServerReadiness(null);

    const ephemeralPatient: PatientQueueItem = {
      ...selectedPatient,
      id: `ephemeral-${selectedPatient.patientId}-${Date.now()}`,
      queueNumber: 'DIRECT',
      sequenceNumber: 0,
      isDirectVisit: true,
      status: 'InConsultation',
      checkInTime: new Date().toISOString(),
    };
    activePatientId.current = ephemeralPatient.id;
    setSelectedPatient(ephemeralPatient);
    setPatients((prev) => [ephemeralPatient, ...(prev || []).filter((p) => p.id !== ephemeralPatient.id)]);
    setIsSigned(false);
    setSignedAt(null);
    setSignedConsultationId(null);
    setChargeSlipItems([]);
    setIsFollowUpEncounter(true);
    setBanner(null);
    setSubjective(selectedPatient.chiefComplaint ? `Follow-up: ${selectedPatient.chiefComplaint}.` : '');
    setObjective('');
    setImportedProcedureIds([]);
    setAssessment('');
    setPlan('');
    setHomeInstructions('');
    setSelectedDiagnoses([]);
    setPrescriptions([]);
    setOrderedLabs([]);
    setOrderedProcedures([]);
    setDentalChart({});
    setOrderInitialToothNumber(undefined);
    setOrderInitialToothSurface(undefined);
    setSelectedSymptomCodes([]);
    setRosCategory('EssentiallyNormal');
    setShowAddRx(false);
    setNewRxGeneric('');
    setNewRxDosage('');
    setNewRxForm('Tablet');
    setNewRxSig('');
    setNewRxQuantity('30');
    setNewRxClinicDispensedQty('');
    setNewRxDangerous(false);
    setNewRxDrugCode('');
    setSelectedCatalogMedId('');
    setRxCatalogQuery('');
    setCdsAlerts([]);
    setCdsUsedLocalRules(false);
    setCdsOverrideReason('');
    setShowOverrideInput(false);
    setOverrideConfirmed(false);
    setPhysicalExamFindings({ ...DEFAULT_PHYSICAL_EXAM_NORMAL });
    setRosItems([]);
    setObGyneExam(null);
    setPediatricMilestones([]);
    setAdolescentAssessment(null);
    setHeadsssAssessments([]);
    setBpMonitoringLogs([]);
    setPlanManagement({ ...DEFAULT_YAKAP_PLAN_MANAGEMENT });
    setPhilHealthAtc((prev) => prev.trim() || 'WALKEDIN');
    setSymptomOtherDesc('');
    setSymptomPainSite('');
    setMedCertFitness('FitToWork');
    setMedCertRestDays('');
    setMedCertPurpose('');
    setMedCertRemarks('');
    setRefFacility('');
    setRefDepartment('');
    setRefUrgency('Routine');
    setRefReason('');
    setRefSummary('');
    setRefDiagnosis('');
    setRefValidationAttempted(false);
    setPrescriptionSlip(null);
    setIssuedMedCert(null);
    setIssuedReferral(null);
  };

  const handleSelectPatient = (p: PatientQueueItem, explicitTab?: ChartReviewTab) => {
    if (p.id === selectedPatient?.id && !explicitTab) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const outgoing = latestUnsavedSnapshotRef.current;
    if (outgoing && p.id !== selectedPatient?.id) {
      latestUnsavedSnapshotRef.current = null;
      void flushOutgoingDraftSnapshot(outgoing);
    }
    draftSaveEpochRef.current += 1;
    inFlightFingerprintRef.current = '';
    queuedDraftSnapshotRef.current = null;
    setSelectedPatient(p);
    if (explicitTab) {
      setActiveChartTab(explicitTab);
    } else if (p.status === 'PendingProcedure') {
      setActiveChartTab('procedures');
    }
    resetEncounter(p);
    loadPatientContext(p);
  };

  useEffect(() => {
    const params = route.params as
      | {
          queueId?: string;
          queueItemId?: string;
          patientId?: string;
          patientName?: string;
          directVisitMode?: 'regular' | 'yakap';
          forceSeparateVisit?: boolean;
          initialChartTab?: ChartReviewTab;
        }
      | undefined;
    const targetQueueId = params?.queueId ?? params?.queueItemId;
    const forceSeparate = parseBooleanRouteParam(params?.forceSeparateVisit);
    const key = `${targetQueueId ?? ''}|${params?.patientId ?? ''}|${forceSeparate ? 'sep' : 'std'}|${params?.directVisitMode ?? ''}`;
    if (key === '|||' || (!targetQueueId && !params?.patientId) || appliedRouteKey.current === key) return;

    const terminalStatuses: QueueStatus[] = [
      'Completed',
      'Cancelled',
      'NoShow',
      'DischargedNonDoctor',
      'Diverted',
    ];
    const target = targetQueueId
      ? patients.find((x) => x.id === targetQueueId)
      : !forceSeparate
        ? patients.find(
            (x) => x.patientId === params?.patientId && !terminalStatuses.includes(x.status)
          )
        : undefined;

    if (target) {
      appliedRouteKey.current = key;
      if (params?.directVisitMode === 'yakap') {
        setPhilHealthAtc('WALKEDIN');
      }
      handleSelectPatient(target, params?.initialChartTab);
      return;
    }

    appliedRouteKey.current = key;
    (async () => {
      if (targetQueueId || (params?.patientId && !forceSeparate)) {
        const [allQueue] = await clinicService.getQueue({
          date: getManilaTodayStr(),
          view: 'All',
        });
        const fetchedTarget = targetQueueId
          ? (allQueue || []).find((x) => x.id === targetQueueId)
          : (allQueue || []).find(
              (x) => x.patientId === params?.patientId && !terminalStatuses.includes(x.status),
            );
        if (fetchedTarget) {
          if (params?.directVisitMode === 'yakap') {
            setPhilHealthAtc('WALKEDIN');
          }
          setPatients((prev) => [
            fetchedTarget,
            ...(prev || []).filter((p) => p.id !== fetchedTarget.id),
          ]);
          handleSelectPatient(fetchedTarget, params?.initialChartTab);
          return;
        }
      }

      if (params?.patientId) {
        const [pat] = await clinicService.getPatientById(params.patientId);
        if (pat) {
          const ephemeralId = forceSeparate
            ? `ephemeral-${pat.id}-${Date.now()}`
            : `ephemeral-${pat.id}`;
          const ephemeralPatient: PatientQueueItem = {
            id: ephemeralId,
            tenantId: pat.tenantId || '',
            clinicId: pat.clinicId || '',
            queueNumber: 'DIRECT',
            sequenceNumber: 0,
            queueDate: getManilaTodayStr(),
            patientId: pat.id,
            patientName: pat.fullName,
            priority: 'Routine',
            status: 'InConsultation',
            checkInTime: new Date().toISOString(),
            hasVitals: false,
            visitType: 'RoutineCheckup',
            visitWorkflowMode: params.directVisitMode === 'yakap' ? 'YakapAvailment' : 'Regular',
            isDirectVisit: true,
          };
          setPatients((prev) => [
            ephemeralPatient,
            ...(prev || []).filter((p) => p.id !== ephemeralPatient.id),
          ]);
          handleSelectPatient(ephemeralPatient, params?.initialChartTab);
          if (forceSeparate) {
            setIsFollowUpEncounter(true);
          }
          if (params.directVisitMode === 'yakap') {
            setPhilHealthAtc('WALKEDIN');
            setIsYakapEligible(true);
            setVisitWorkflowMode('YakapAvailment');
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params, patients]);

  const handleOpenCallModal = useCallback(
    (target?: PatientQueueItem) => {
      const patientToCall = target || nextEligiblePatient;
      if (!patientToCall) {
        notify.info('No patients are currently waiting to be called in this queue.');
        return;
      }
      const resolved = resolveCallToRoom({
        ticket: patientToCall,
        selectedStation: selectedStationFilter,
        currentStaff: current,
        activeRooms,
        visibleRooms,
      });
      setCallModalItem(patientToCall);
      setSelectedCallRoom(resolved.roomName);
      setSelectedCallRoomId(resolved.roomId);
    },
    [nextEligiblePatient, selectedStationFilter, current, activeRooms, visibleRooms]
  );

  const handleExecuteCall = useCallback(async () => {
    if (!callModalItem) return;
    setIsCallingNext(true);
    const doctorName = current ? formatStaffName(current) : undefined;
    const targetRoom = activeRooms.find((r) => r.name === selectedCallRoom || r.id === selectedCallRoomId);
    const targetRoomId = targetRoom?.id || selectedCallRoomId;

    const [, err] = await clinicService.callQueueItem(
      callModalItem.id,
      current?.id,
      doctorName,
      selectedCallRoom,
      targetRoomId,
    );

    setIsCallingNext(false);
    if (err) {
      notify.error(err.message || 'Failed to call patient.');
      return;
    }

    notify.success(`${callModalItem.patientName} (${callModalItem.queueNumber}) called to ${selectedCallRoom}.`);
    const calledItem: PatientQueueItem = {
      ...callModalItem,
      status: 'InConsultation' as QueueStatus,
      doctorId: current?.id,
      doctorName,
      roomOrStation: selectedCallRoom,
      roomId: targetRoomId ?? null,
    };
    setCallModalItem(null);
    await loadQueue();
    handleSelectPatient(calledItem);
  }, [callModalItem, current, selectedCallRoom, selectedCallRoomId, activeRooms, loadQueue, handleSelectPatient]);

  const runCdsScreening = async (
    currentPrescriptions: LocalPrescription[],
    contextOverride?: {
      patientId?: string;
      allergies?: string;
      labOrdersList?: ClinicLabOrderRecord[];
      preserveOverrideState?: boolean;
    },
  ) => {
    const patId = contextOverride?.patientId ?? selectedPatient?.patientId;
    if (!patId) return;
    if (currentPrescriptions.length === 0) {
      setCdsAlerts([]);
      setCdsUsedLocalRules(false);
      setShowOverrideInput(false);
      setOverrideConfirmed(false);
      return;
    }
    const allergies = contextOverride?.allergies ?? patientRecord?.allergies ?? '';
    const sourceLabOrders = contextOverride?.labOrdersList ?? labOrders;

    // Extract latest renal & electrolyte lab values from recent orders if available
    let latestCreatinine: number | undefined;
    let latestEgfr: number | undefined;
    let latestPotassium: number | undefined;

    for (const ord of sourceLabOrders) {
      if (ord.observationsJson) {
        try {
          const obs = JSON.parse(ord.observationsJson);
          for (const item of obs) {
            const val = parseFloat(item.value);
            if (!isNaN(val)) {
              if (item.analyteCode === 'CREA' && !latestCreatinine) latestCreatinine = val;
              if (item.analyteCode === 'EGFR' && !latestEgfr) latestEgfr = val;
              if (item.analyteCode === 'K' && !latestPotassium) latestPotassium = val;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    setEvaluatingCds(true);
    try {
      const [res, err] = await clinicService.evaluateCds({
        patientId: patId,
        patientAllergies: allergies || undefined,
        prescriptions: currentPrescriptions.map((p) => ({ genericName: p.genericName, dosage: p.dosage })),
        serumCreatinineMgDl: latestCreatinine,
        egfrMlMin: latestEgfr,
        serumPotassiumMmolL: latestPotassium,
      });

      if (!err && res && res.alerts) {
        setCdsAlerts(res.alerts);
        setCdsUsedLocalRules(false);
        if (res.hasCriticalAlerts) {
          setShowOverrideInput(true);
        } else if (!contextOverride?.preserveOverrideState) {
          setShowOverrideInput(false);
          setOverrideConfirmed(false);
        }
        return;
      }
    } catch {
      // Fall through to local screening.
    } finally {
      setEvaluatingCds(false);
    }

    // The server check was unavailable: run basic client-side rules and say so in the UI.
    setCdsUsedLocalRules(true);
    const localAlerts: CdsAlert[] = [];
    const allNames = currentPrescriptions.map((p) => p.genericName.toLowerCase());

    // Allergy checks
    if (allergies.toLowerCase().includes('penicillin')) {
      for (const rx of currentPrescriptions) {
        const name = rx.genericName.toLowerCase();
        if (name.includes('amox') || name.includes('ampicillin') || name.includes('penicillin') || name.includes('augmentin')) {
          localAlerts.push({
            alertId: `loc-allergy-${rx.id}`,
            type: 'DrugAllergy',
            severity: 'Critical',
            title: 'Contraindication: patient has a documented penicillin allergy',
            clinicalMechanism: `${rx.genericName} is a beta-lactam penicillin. High risk of anaphylaxis and severe cutaneous reaction.`,
            recommendation: 'Do not prescribe. Substitute Macrolide or alternative class.',
            offendingDrug: rx.genericName,
            requiresOverrideReason: true,
          });
        } else if (name.includes('ceph') || name.includes('cefu') || name.includes('ceft') || name.includes('cefi')) {
          localAlerts.push({
            alertId: `loc-cross-${rx.id}`,
            type: 'DrugAllergy',
            severity: 'Major',
            title: 'Cross-reactivity warning: cephalosporin in a penicillin-allergic patient',
            clinicalMechanism: `${rx.genericName} shares structural beta-lactam motifs with penicillin (~2-5% cross-reactivity).`,
            recommendation: 'Verify reaction history. Avoid if previous reaction was angioedema or anaphylaxis.',
            offendingDrug: rx.genericName,
            requiresOverrideReason: true,
          });
        }
      }
    }

    // Aspirin & NSAID
    if (allergies.toLowerCase().includes('aspirin') || allergies.toLowerCase().includes('nsaid')) {
      for (const rx of currentPrescriptions) {
        const name = rx.genericName.toLowerCase();
        if (name.includes('ibuprofen') || name.includes('mefenamic') || name.includes('aspirin') || name.includes('naproxen') || name.includes('ketorolac')) {
          localAlerts.push({
            alertId: `loc-nsaid-allergy-${rx.id}`,
            type: 'DrugAllergy',
            severity: 'Critical',
            title: 'Contraindication: NSAID prescribed to an aspirin/NSAID-sensitive patient',
            clinicalMechanism: `${rx.genericName} inhibits COX-1, triggering severe bronchospasm or urticaria in aspirin-exacerbated respiratory disease.`,
            recommendation: 'Do not prescribe NSAIDs. Use Paracetamol for mild analgesia.',
            offendingDrug: rx.genericName,
            requiresOverrideReason: true,
          });
        }
      }
    }

    // Warfarin + NSAID
    if (allNames.some((n) => n.includes('warfarin')) && allNames.some((n) => n.includes('mefenamic') || n.includes('ibuprofen') || n.includes('aspirin') || n.includes('ketorolac'))) {
      localAlerts.push({
        alertId: 'loc-warf-nsaid',
        type: 'DrugDrugInteraction',
        severity: 'Critical',
        title: 'Severe bleeding risk: warfarin + NSAID',
        clinicalMechanism: 'Synergistic GI mucosal ulceration and platelet inhibition markedly increases major internal hemorrhage risk.',
        recommendation: 'Avoid combination. Consider Paracetamol for analgesia with INR monitoring.',
        offendingDrug: 'NSAID',
        interactingDrug: 'Warfarin',
        requiresOverrideReason: true,
      });
    }

    // ACEi/ARB + Spironolactone / Potassium
    if (allNames.some((n) => n.includes('losartan') || n.includes('enalapril')) && allNames.some((n) => n.includes('spironolactone') || n.includes('potassium'))) {
      localAlerts.push({
        alertId: 'loc-ace-k',
        type: 'DrugDrugInteraction',
        severity: 'Major',
        title: 'Hyperkalemia risk: ACEi/ARB + potassium-sparing agent',
        clinicalMechanism: 'Combined aldosterone suppression impairs renal potassium excretion, risking severe hyperkalemia.',
        recommendation: 'Monitor serum potassium and renal panel within 1-2 weeks of initiation.',
        offendingDrug: 'Spironolactone',
        interactingDrug: 'ACEi/ARB',
        requiresOverrideReason: false,
      });
    }

    // Renal check for Metformin
    if (allNames.some((n) => n.includes('metformin'))) {
      if (latestEgfr && latestEgfr < 30) {
        localAlerts.push({
          alertId: 'loc-met-30',
          type: 'RenalDoseAdjustment',
          severity: 'Critical',
          title: `Renal contraindication: metformin in severe CKD (eGFR ${latestEgfr.toFixed(1)} mL/min)`,
          clinicalMechanism: 'Drug accumulation in severe renal impairment triggers potentially fatal lactic acidosis.',
          recommendation: 'Discontinue Metformin. Switch to Linagliptin or Insulin.',
          offendingDrug: 'Metformin',
          requiresOverrideReason: true,
        });
      } else if (latestEgfr && latestEgfr < 45) {
        localAlerts.push({
          alertId: 'loc-met-45',
          type: 'RenalDoseAdjustment',
          severity: 'Major',
          title: `Renal dose adjustment: metformin in moderate CKD (eGFR ${latestEgfr.toFixed(1)} mL/min)`,
          clinicalMechanism: 'Decreased clearance increases toxicity. Maximum safe dose is 1,000 mg/day.',
          recommendation: 'Limit dose to 500mg BID and monitor renal profile every 3 months.',
          offendingDrug: 'Metformin',
          requiresOverrideReason: false,
        });
      }
    }

    setCdsAlerts(localAlerts);
    if (localAlerts.some((a) => a.requiresOverrideReason)) {
      setShowOverrideInput(true);
    } else if (!contextOverride?.preserveOverrideState) {
      setShowOverrideInput(false);
      setOverrideConfirmed(false);
    }
  };

  const handleAcknowledgePanic = async () => {
    if (!selectedPanicOrder) return;
    const doctor = requireSigner();
    if (!doctor) return;
    if (!panicAckNotes.trim()) {
      Alert.alert('Notes required', 'Record the readback notes and immediate clinical actions before confirming.');
      return;
    }
    setIsAcknowledgingPanic(true);
    const [res, err] = await clinicService.acknowledgePanicAlert(selectedPanicOrder.id, doctor.name, panicAckNotes.trim());
    setIsAcknowledgingPanic(false);
    if (err || !res) {
      Alert.alert('Acknowledgment failed', err?.message || 'Failed to acknowledge the critical value. Please try again.');
      return;
    }
    setLabOrders((prev) => prev.map((o) => (o.id === selectedPanicOrder.id ? res : o)));
    setPanicModalVisible(false);
    setPanicAckNotes('');
    notify.success('Critical value readback recorded in the patient record.');
  };

  const handleOpenLabSlip = async (orderOrId: ClinicLabOrderRecord | string) => {
    const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId.id;
    const url = clinicService.getLabOrderSlipPdfUrl(orderId);
    try {
      if (!(await openDocument(url))) {
        throw new Error('Could not open the requisition slip');
      }
    } catch (e: any) {
      notify.error(e?.message || 'Unable to open laboratory requisition slip.');
    }
  };

  const handleOpenLabPdf = (orderOrId: ClinicLabOrderRecord | string) => {
    const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId.id;
    const found = typeof orderOrId === 'string' ? labOrders.find((o) => o.id === orderOrId) : orderOrId;
    const isCompleted = found?.status === 'Completed' || found?.status === 'CompletedWithExternalReport';

    if (found && !isCompleted) {
      Alert.alert(
        'Official Lab Report Pending',
        `The official signed laboratory report is not yet available for Accession #${found.orderNumber ?? orderId.slice(0, 8)}.\n\nStatus: ${humanize(found.status)}.\nResults have not yet been released by the laboratory.\n\nWould you like to open the official Requisition Slip instead?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'View Requisition Slip',
            onPress: () => {
              handleOpenLabSlip(orderId);
            },
          },
        ]
      );
      return;
    }

    const url = clinicService.getLabReportPdfUrl(orderId);
    openDocument(url)
      .then((opened) => {
        if (!opened) throw new Error('Could not open the document');
      })
      .catch((err: any) => {
        Alert.alert(
          'Could not open the PDF report',
          [
            `Accession #${found?.orderNumber ?? orderId.slice(0, 8)}`,
            found?.verifiedByPathologist ? `Verified by: ${found.verifiedByPathologist}` : null,
            found?.pathologistImpression ? `Pathologist impression:\n${found.pathologistImpression}` : null,
            err?.message ? `Details: ${err.message}` : 'Please verify that the lab report has been finalized and uploaded.',
          ]
            .filter(Boolean)
            .join('\n\n'),
        );
      });
  };

  // Search ICD-10 codes
  const handleSearchIcd10 = async (q: string) => {
    setIcdQuery(q);
    setIcdNotice(null);
    if (!q.trim()) {
      setIcdResults([]);
      return;
    }
    const [data, err] = await clinicService.searchIcd10(q);
    if (!err && data) {
      setIcdResults(data);
    } else {
      setIcdResults([]);
      setIcdNotice('The PhilHealth ICD-10 catalog is unreachable, so diagnoses cannot be searched right now.');
    }
  };

  const handleAddDiagnosis = (code: Icd10Code) => {
    if (selectedDiagnoses.some((d) => d.icd10Code === code.code)) return;
    const isFirst = selectedDiagnoses.length === 0;
    setSelectedDiagnoses((prev) => [
      ...prev,
      { icd10Code: code.code, description: code.description, isPrimary: isFirst },
    ]);
    setShowIcdDropdown(false);
    setIcdQuery('');
  };

  const handleRemoveDiagnosis = (code: string) => {
    setSelectedDiagnoses((prev) => prev.filter((d) => d.icd10Code !== code));
  };

  const handleToggleLab = (diagOrName: ClinicServiceItem | string) => {
    const item: ClinicServiceItem | undefined =
      typeof diagOrName === 'string'
        ? diagnosticCatalog.find((d) => d.name.toLowerCase() === diagOrName.toLowerCase()) ||
          activeCatalog.find((c) => c.name.toLowerCase() === diagOrName.toLowerCase())
        : diagOrName;

    const testName = typeof diagOrName === 'string' ? diagOrName : diagOrName.name;

    setOrderedLabs((prev) => {
      const exists = prev.some((l) => l.name.toLowerCase() === testName.toLowerCase());
      if (exists) {
        return prev.filter((l) => l.name.toLowerCase() !== testName.toLowerCase());
      }
      const matchTarget = item ? `${item.name} ${item.code || ''} ${item.description || ''}` : testName;
      const isHeuristicInHouse = IN_HOUSE_RAPID_TEST_REGEX.test(matchTarget);

      const newLab: LocalLabOrder = {
        serviceItemId: item?.id,
        code: item?.code,
        name: testName,
        category: item?.category || 'Diagnostic',
        standardPrice: item?.standardPrice ?? 0,
        philHealthCode: item?.philHealthCode,
        fulfillmentMode: isHeuristicInHouse ? 'in_house' : 'outside',
      };
      return [...prev, newLab];
    });
  };

  const handleToggleLabFulfillmentMode = (testName: string) => {
    if (isSigned) return;
    setOrderedLabs((prev) =>
      prev.map((lab) =>
        lab.name.toLowerCase() === testName.toLowerCase()
          ? { ...lab, fulfillmentMode: lab.fulfillmentMode === 'in_house' ? 'outside' : 'in_house' }
          : lab
      )
    );
  };

  const handleRemoveLab = (testName: string) => {
    if (isSigned) return;
    setOrderedLabs((prev) => prev.filter((lab) => lab.name.toLowerCase() !== testName.toLowerCase()));
  };

  const handleOpenEditInstructions = (item: LocalLabOrder | LocalProcedureOrder, type: 'lab' | 'procedure') => {
    if (isSigned) return;
    setEditingOrderItem({
      type,
      name: item.name,
      category: item.category,
      standardPrice: item.standardPrice,
      instructions: item.instructions || '',
    });
    setEditingInstructionText(item.instructions || '');
  };

  const handleSaveOrderInstructions = (newInstructions: string) => {
    if (!editingOrderItem) return;
    const trimmed = newInstructions.trim();
    if (editingOrderItem.type === 'lab') {
      setOrderedLabs((prev) =>
        prev.map((lab) =>
          lab.name.toLowerCase() === editingOrderItem.name.toLowerCase()
            ? { ...lab, instructions: trimmed || undefined }
            : lab
        )
      );
    } else {
      setOrderedProcedures((prev) =>
        prev.map((proc) =>
          proc.name.toLowerCase() === editingOrderItem.name.toLowerCase()
            ? { ...proc, instructions: trimmed || undefined }
            : proc
        )
      );
    }
    notify.success(`Instructions updated for ${editingOrderItem.name}.`);
    setEditingOrderItem(null);
  };

  const handleSelectCatalogOrder = (order: OrderCatalogItemPayload) => {
    const isDiagnostic = (order.category || '').toLowerCase().includes('diagnostic');
    if (isDiagnostic) {
      setOrderedLabs((prev) => {
        const index = prev.findIndex((l) => l.name.toLowerCase() === order.name.toLowerCase());
        const newLab: LocalLabOrder = {
          serviceItemId: order.serviceItemId,
          code: order.code,
          name: order.name,
          category: order.category || 'Diagnostic',
          standardPrice: order.standardPrice,
          philHealthCode: order.philHealthCode,
          fulfillmentMode: order.fulfillmentMode || 'outside',
          instructions: order.instructions,
        };
        if (index >= 0) {
          const next = [...prev];
          next[index] = newLab;
          return next;
        }
        return [...prev, newLab];
      });
    } else {
      const availableRooms = treatmentRooms.length > 0 ? treatmentRooms : activeRooms;
      const targetTreatmentRoom =
        treatmentRooms.find((r) => r.id === selectedTreatmentRoomId) ?? availableRooms[0];
      setOrderedProcedures((prev) => {
        const index = prev.findIndex(
          (p) =>
            p.name.toLowerCase() === order.name.toLowerCase() &&
            (order.toothNumber !== undefined ? p.toothNumber === order.toothNumber : p.toothNumber === undefined)
        );
        const existing = index >= 0 ? prev[index] : null;
        const designatedRoomId = order.roomId || order.targetRoomId;
        const designatedRoom = designatedRoomId
          ? availableRooms.find((r) => r.id === designatedRoomId)
          : undefined;

        const resolvedRoomId =
          designatedRoomId ||
          existing?.roomId ||
          existing?.targetRoomId ||
          targetTreatmentRoom?.id;

        const resolvedRoomName =
          designatedRoom?.name ||
          order.roomName ||
          order.targetRoomName ||
          existing?.roomName ||
          existing?.targetRoomName ||
          targetTreatmentRoom?.name;

        const newProc: LocalProcedureOrder = {
          serviceItemId: order.serviceItemId,
          code: order.code,
          name: order.name,
          category: order.category || 'Procedure',
          standardPrice: order.standardPrice,
          instructions: order.instructions,
          roomId: resolvedRoomId,
          roomName: resolvedRoomName,
          targetRoomId: resolvedRoomId,
          targetRoomName: resolvedRoomName,
          status: existing?.status || (existing?.isHandedOff ? 'sent_to_room' : 'draft'),
          sentToRoomId: existing?.sentToRoomId,
          sentToRoomName: existing?.sentToRoomName,
          sentAt: existing?.sentAt,
          isHandedOff: existing?.isHandedOff ?? false,
          handedOffAt: existing?.handedOffAt,
          toothNumber: order.toothNumber,
          toothSurface: order.toothSurface,
        };
        if (index >= 0) {
          const next = [...prev];
          next[index] = newProc;
          return next;
        }
        return [...prev, newProc];
      });
      setOrderInitialToothNumber(undefined);
      setOrderInitialToothSurface(undefined);
    }
  };

  const handleToggleProcedure = (procOrName: string | ClinicServiceItem) => {
    if (isSigned) return;
    const item =
      typeof procOrName === 'string'
        ? procedureCatalog.find((p) => p.name.toLowerCase() === procOrName.toLowerCase())
        : procOrName;
    const procName = typeof procOrName === 'string' ? procOrName : procOrName.name;

    setOrderedProcedures((prev) => {
      const exists = prev.some((p) => p.name.toLowerCase() === procName.toLowerCase());
      if (exists) {
        return prev.filter((p) => p.name.toLowerCase() !== procName.toLowerCase());
      }
      const availableRooms = treatmentRooms.length > 0 ? treatmentRooms : activeRooms;
      const targetTreatmentRoom =
        treatmentRooms.find((r) => r.id === selectedTreatmentRoomId) ?? availableRooms[0];
      const newProc: LocalProcedureOrder = {
        serviceItemId: item?.id,
        code: item?.code,
        name: procName,
        category: item?.category || 'Procedure',
        standardPrice: item?.standardPrice ?? 0,
        roomId: targetTreatmentRoom?.id,
        roomName: targetTreatmentRoom?.name,
        targetRoomId: targetTreatmentRoom?.id,
        targetRoomName: targetTreatmentRoom?.name,
        status: 'draft',
        isHandedOff: false,
      };
      return [...prev, newProc];
    });
  };

  const handleRemoveProcedure = async (procName: string, toothNumber?: number) => {
    if (isSigned) return;
    const target = orderedProcedures.find((p) => {
      if (p.name.toLowerCase() !== procName.toLowerCase()) return false;
      if (toothNumber !== undefined && p.toothNumber !== toothNumber) return false;
      if (toothNumber === undefined && p.toothNumber !== undefined) return false;
      return true;
    });

    if (target?.status === 'sent_to_room' && target.procedureId) {
      const shouldCancel = typeof window !== 'undefined' && window?.confirm
        ? window.confirm(
            `Cancel procedure "${procName}"? This will cancel the active clinical order in ${target.targetRoomName || 'the Treatment Room'} and recall the patient if no other procedures are pending.`
          )
        : true;
      if (!shouldCancel) return;

      const [, cancelErr] = await clinicService.cancelProcedure(target.procedureId, 'Cancelled from Consultation workstation');
      if (cancelErr) {
        notify.error(cancelErr.message || `Failed to cancel ${procName}.`);
        return;
      }
      notify.success(`Cancelled ${procName}.`);
      if (selectedPatient?.patientId) {
        await refreshPatientChart(selectedPatient.patientId).catch(() => {});
      }
      loadQueue();
    }

    setOrderedProcedures((prev) =>
      prev.filter((p) => {
        if (p.name.toLowerCase() !== procName.toLowerCase()) return true;
        if (toothNumber !== undefined && p.toothNumber !== toothNumber) return true;
        if (toothNumber === undefined && p.toothNumber !== undefined) return true;
        return false;
      })
    );
  };

  const handleQuickOrderDentalProcedure = (toothNumber: number, toothSurface?: string) => {
    if (isSigned) return;
    setOrderInitialToothNumber(toothNumber);
    setOrderInitialToothSurface(toothSurface);
    setOrderSearchInitialCategory('Dental');
    setOrderSearchModalVisible(true);
  };

  const handleAddPrescription = () => {
    if (!newRxGeneric.trim() || !newRxDosage.trim() || !newRxSig.trim()) {
      Alert.alert('Incomplete prescription', 'Please provide the generic name, dosage and directions (sig).');
      return;
    }
    const prescribedQty = parseInt(newRxQuantity, 10) || 30;
    if (prescribedQty <= 0) {
      Alert.alert('Invalid quantity', 'Prescribed quantity must be at least 1.');
      return;
    }
    let clinicDispensedQty = 0;
    if (newRxClinicDispensedQty.trim() !== '') {
      const parsedDispensed = Number(newRxClinicDispensedQty.trim());
      if (!Number.isInteger(parsedDispensed) || parsedDispensed < 0) {
        Alert.alert('Invalid clinic dispensed quantity', 'Enter a whole number of pieces dispensed from clinic stock (0 or more).');
        return;
      }
      if (parsedDispensed > prescribedQty) {
        Alert.alert(
          'Exceeds prescribed quantity',
          `Clinic stock dispensed pieces (${parsedDispensed}) cannot exceed the prescribed quantity (${prescribedQty}).`,
        );
        return;
      }
      clinicDispensedQty = parsedDispensed;
    }

    const newRx: LocalPrescription = {
      id: `rx-${Date.now()}`,
      genericName: newRxGeneric.trim(),
      dosage: newRxDosage.trim(),
      form: newRxForm.trim() || 'Tablet',
      sig: newRxSig.trim(),
      quantity: prescribedQty,
      isDangerousDrug: newRxDangerous,
      philHealthDrugCode: newRxDrugCode.trim() || undefined,
      clinicDispensedQuantity: clinicDispensedQty > 0 ? clinicDispensedQty : undefined,
      rosCategory,
    };
    const updated = [...prescriptions, newRx];
    setPrescriptions(updated);
    runCdsScreening(updated);
    setNewRxGeneric('');
    setNewRxDosage('');
    setNewRxForm('Tablet');
    setNewRxSig('');
    setNewRxQuantity('30');
    setNewRxClinicDispensedQty('');
    setNewRxDangerous(false);
    setNewRxDrugCode('');
    setSelectedCatalogMedId('');
    setShowAddRx(false);
  };

  const handleRemovePrescription = (id: string) => {
    const updated = prescriptions.filter((p) => p.id !== id);
    setPrescriptions(updated);
    runCdsScreening(updated);
  };

  const handleSignAndSync = async () => {
    if (!selectedPatient) return;
    setBanner(null);

    const doctor = requireSigner();
    if (!doctor) return;

    if (hasPendingInClinicProcedures) {
      const msg = `Encounter signing is locked: ${pendingProcedureReason ?? 'In-clinic procedures are pending in the Procedure Bay'}. All ordered procedures must be executed or cancelled before signing.`;
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      return;
    }

    // Clinical Decision Support (CDS) Critical Override Gate
    const criticalAlerts = cdsAlerts.filter((a) => a.requiresOverrideReason);
    if (criticalAlerts.length > 0 && (!cdsOverrideReason.trim() || !overrideConfirmed)) {
      const msg = `Safety check: ${criticalAlerts.length} critical drug allergy or severe interaction alert(s) need a documented clinical override before the encounter can be signed.`;
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      setShowOverrideInput(true);
      return;
    }

    // PDEA Dangerous Drug validation (Philippine Comprehensive Dangerous Drugs Act RA 9165)
    const hasDangerousDrug = prescriptions.some((p) => p.isDangerousDrug);
    const finalS2 = doctorS2.trim() || signerStaff?.s2LicenseNumber;
    if (hasDangerousDrug && !finalS2) {
      const msg = 'An S2 license number is required to prescribe PDEA dangerous drugs.';
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      handleJumpToSection('doctor-s2');
      return;
    }

    const finalPrc = doctorPrc.trim() || signerStaff?.prcLicenseNumber;
    if (!finalPrc) {
      const msg = 'A PRC license number is required to sign clinical encounters.';
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      handleJumpToSection('doctor-prc');
      return;
    }

    const finalPan = isYakapEligible ? (doctorPan.trim() || signerStaff?.philHealthPan) : undefined;
    if (isYakapEligible && (!finalPan || !finalPrc)) {
      const msg = 'Doctor PhilHealth Accreditation Number (PAN) and PRC license are required for Konsulta encounters.';
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      handleJumpToSection('doctor-pan');
      return;
    }

    // Pre-flight Yakap readiness gatekeeper
    if (isYakapEligible && !isYakapReady) {
      const msg = 'Encounter signing is locked: Complete all 10 requirements on the Yakap Claim Readiness checklist before signing.';
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      return;
    }

    setIsSigning(true);
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    queuedDraftSnapshotRef.current = null;
    latestUnsavedSnapshotRef.current = null;
    inFlightFingerprintRef.current = '';
    draftSaveEpochRef.current += 1;
    if (inFlightDraftSavePromiseRef.current) {
      await inFlightDraftSavePromiseRef.current.catch(() => null);
    }

    const completedLabResultsCount = labOrders.filter(
      (o) => o.status === 'Completed' || o.status === 'CompletedWithExternalReport'
    ).length;

    const activeVisit = await materializeVisitIfNeeded('InConsultation');
    if (!activeVisit) {
      setIsSigning(false);
      return;
    }

    const signDraftPayload = buildConsultationDraftPayload({
      patientId: activeVisit.patientId,
      patientName: activeVisit.patientName,
      doctorId: doctor.id,
      doctorName: doctor.name,
      queueItemId: activeVisit.id,
      appointmentId: activeVisit.appointmentId,
      hasExistingConsultation: true,
      specialtyMode: settings?.specialtyMode,
      isDentalEnabled,
      visitWorkflowMode,
      isYakapEligible,
      philHealthAtc,
      doctorPrc,
      doctorPtr,
      doctorS2,
      doctorPan,
      fallbackPrc: signerStaff?.prcLicenseNumber ?? undefined,
      fallbackPtr: signerStaff?.ptrNumber ?? undefined,
      fallbackS2: signerStaff?.s2LicenseNumber ?? undefined,
      fallbackPan: signerStaff?.philHealthPan ?? undefined,
      subjective,
      objective,
      assessment,
      plan,
      homeInstructions,
      rosCategory,
      rosCategories,
      rosItems,
      selectedSymptomCodes,
      painSymptomSelected,
      otherSymptomSelected,
      symptomPainSite,
      symptomOtherDesc,
      physicalExamFindings,
      obGyneExam,
      pediatricMilestones,
      adolescentAssessment,
      headsssAssessments,
      bpMonitoringLogs,
      planManagement,
      completedLabResultsCount,
      hasIssuedReferral: Boolean(issuedReferral),
      selectedDiagnoses,
      prescriptions,
      orderedLabs,
      orderedProcedures,
      dentalChart,
      cdsOverrideReason,
      overrideConfirmed,
      medCertFitness,
      medCertRestDays,
      medCertPurpose,
      medCertRemarks,
      refFacility,
      refDepartment,
      refUrgency,
      refReason,
      refSummary,
    });

    let consultationId =
      consultationIdRef.current ||
      signedConsultationId ||
      savedConsultationByVisitRef.current[activeVisit.id] ||
      null;
    if (!consultationId) {
      const [consultation, createErr] = await clinicService.createConsultation(signDraftPayload);
      if (createErr || !consultation?.id) {
        setIsSigning(false);
        const reason = createErr?.message || 'Unable to save consultation record';
        const msg = `Cannot sign encounter — Step failed: Save Consultation Notes (${reason}). Encounter was not signed.`;
        setBanner({
          text: msg,
          isError: true,
        });
        notify.error(msg, { traceId: createErr?.traceId });
        return;
      }
      consultationId = consultation.id;
      savedConsultationByVisitRef.current[activeVisit.id] = consultation.id;
      consultationIdRef.current = consultation.id;
      setSignedConsultationId(consultation.id);
    } else {
      const [, updateErr] = await clinicService.updateConsultation(consultationId, signDraftPayload);
      if (updateErr) {
        setIsSigning(false);
        const reason = updateErr.message || 'Unable to update consultation record';
        const msg = `Cannot sign encounter — Step failed: Save Consultation Notes (${reason}). Encounter was not signed.`;
        setBanner({
          text: msg,
          isError: true,
        });
        notify.error(msg, { traceId: updateErr.traceId });
        return;
      }
    }

    // Step 2: Atomic batch save dental chart BEFORE signing when dental is enabled and teeth have been marked
    let savedDentalChartResponse: any = null;
    if (isDentalEnabled && Object.keys(dentalChart).length > 0) {
      const multiMap = normalizeTeethToMultiRecord(dentalChart as any);
      const currentEncounterRecords = Object.values(multiMap)
        .flat()
        .filter((rec) => !rec.isVoided && rec.status !== 'Healthy' && rec.isCurrentEncounter !== false);
      if (currentEncounterRecords.length > 0) {
        const teethPayload = currentEncounterRecords.map((rec) => ({
          toothNumber: rec.toothNumber,
          status: rec.status,
          surface: rec.surface || undefined,
          notes: rec.notes || undefined,
        }));
        const [savedDentalChart, dentalErr] = await clinicService.batchSaveDentalChart(selectedPatient.patientId, {
          consultationId,
          teeth: teethPayload,
        });
        if (dentalErr) {
          setIsSigning(false);
          const errDetail = dentalErr.message || 'Server rejected dental tooth records';
          const msg = `Cannot sign encounter — Step failed: Save Dental Chart (${errDetail}). Encounter was not signed.`;
          setBanner({
            text: msg,
            isError: true,
          });
          notify.error(msg, { traceId: dentalErr.traceId });
          return;
        }
        savedDentalChartResponse = savedDentalChart;
      }
    }

    // Step 3: Verify that no in-clinic procedures remain pending execution or handoff BEFORE staging requisitions
    const unhandedOffProcs = orderedProcedures.filter((p) => !p.isHandedOff && p.status !== 'sent_to_room');
    if (unhandedOffProcs.length > 0) {
      setIsSigning(false);
      const msg = `Cannot sign encounter — ${unhandedOffProcs.length} in-clinic procedure(s) have not been handed off or executed in the Procedure Bay.`;
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      return;
    }

    // Partition orderedLabs into Outside Laboratory orders vs In-House Clinic tests
    const outsideLabs = orderedLabs.filter((l) => l.fulfillmentMode === 'outside');
    const inHouseLabs = orderedLabs.filter((l) => l.fulfillmentMode === 'in_house');

    // Step 4: Auto-create Diagnostic Lab Requisitions for outside labs BEFORE signing (deduplicated on sign retry)
    if (outsideLabs.length > 0) {
      const [existingLabOrders] = await clinicService.getLabOrders(
        activeVisit.patientId,
        undefined,
        undefined,
        { includeUnsigned: true },
      );
      const alreadyStagedForConsultation = (existingLabOrders ?? []).some(
        (lo) =>
          lo.consultationId === consultationId &&
          lo.status !== 'Cancelled' &&
          !lo.isSigned,
      );

      if (!alreadyStagedForConsultation) {
        const [, labErr] = await clinicService.createLabOrder({
          patientId: activeVisit.patientId,
          patientName: activeVisit.patientName,
          queueItemId: activeVisit.id,
          consultationId,
          orderedByDoctorId: doctor.id,
          orderedByDoctorName: doctor.name,
          clinicalDiagnosis: assessment,
          items: outsideLabs.map((l) => ({
            testName: l.name,
            category: l.category || (diagnosticCatalog.find((d) => d.name === l.name)?.category ?? 'Diagnostic'),
            instructions: l.instructions,
            isDoneOutsideFacility: true,
            testCode: l.code || undefined,
          })),
        });
        if (labErr) {
          setIsSigning(false);
          const reason = labErr.message || 'Unable to create laboratory requisition';
          const msg = `Cannot sign encounter — Step failed: Laboratory Requisition (${reason}). Encounter was not signed.`;
          setBanner({
            text: msg,
            isError: true,
          });
          notify.error(msg, { traceId: labErr.traceId });
          return;
        }
      }
    }

    // Step 5: Sign Consultation ONLY after all pre-sign steps succeeded
    const [, signErr] = await clinicService.signConsultation(consultationId, {
      prcLicenseNumber: finalPrc,
      ptrNumber: doctorPtr.trim() || signerStaff?.ptrNumber,
      s2LicenseNumber: finalS2,
      doctorPhilHealthPan: finalPan,
      philHealthAtc: isYakapEligible ? (philHealthAtc.trim() || 'WALKEDIN') : undefined,
    });
    if (signErr) {
      setIsSigning(false);
      const reason = signErr.message || 'Unable to sign consultation';
      const msg = `Cannot sign encounter — Step failed: Sign Consultation (${reason}). Encounter was not signed.`;
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg, { traceId: signErr.traceId });
      return;
    }

    // Update left-side longitudinal Patient Chart dentalTeeth now that the encounter is signed
    if (isDentalEnabled && Object.keys(dentalChart).length > 0) {
      const multiMap = normalizeTeethToMultiRecord(dentalChart as any);
      const targetPatientId = selectedPatient?.patientId || patientRecord?.id || '';
      const syncedTeeth: DentalToothRecord[] =
        savedDentalChartResponse?.teeth && savedDentalChartResponse.teeth.length > 0
          ? savedDentalChartResponse.teeth
          : Object.values(multiMap).flat().map((rec) => ({
              ...rec,
              tenantId: rec.tenantId || settings?.tenantId || (patientRecord as any)?.tenantId || '',
              clinicId: rec.clinicId || settings?.clinicId || (patientRecord as any)?.clinicId || '',
              patientId: targetPatientId,
              consultationId,
              notes: rec.notes || null,
              surface: rec.surface || null,
            }));
      setPatientChart((prev) =>
        prev
          ? {
              ...prev,
              dentalTeeth: syncedTeeth,
              ...(savedDentalChartResponse ? { dentalChart: savedDentalChartResponse } : {}),
            }
          : prev
      );
    }

    if (prescriptions.length > 0) {
      const [slip] = await clinicService.getPrescriptionSlip(consultationId);
      if (slip) {
        setPrescriptionSlip(slip);
      }
    }

    // Complete queue item
    await clinicService.completeQueueItem(activeVisit.id);
    clearLocalConsultationDraft({
      clinicId: activeVisit.clinicId || settings?.clinicId || null,
      visitId: activeVisit.id,
      patientId: activeVisit.patientId,
      consultationId,
    });
    if (selectedPatient.id !== activeVisit.id) {
      clearLocalConsultationDraft({
        clinicId: selectedPatient.clinicId || settings?.clinicId || null,
        visitId: selectedPatient.id,
        patientId: selectedPatient.patientId,
        consultationId,
      });
    }

    // Update local state immediately and await full refresh of queue & longitudinal patient chart
    setSelectedPatient((prev) => (prev ? { ...prev, id: activeVisit.id, status: 'Completed' } : null));
    setPatients((prev) =>
      prev.map((p) => (p.id === selectedPatient.id || p.id === activeVisit.id ? { ...p, id: activeVisit.id, status: 'Completed' } : p))
    );
    await Promise.all([
      loadQueue().catch(() => {}),
      refreshPatientChart(selectedPatient.patientId).catch(() => {}),
      refreshDiagnosticsTab().catch(() => {}),
    ]);

    setIsSigning(false);
    setIsSigned(true);
    setDraftSaveStatus('idle');
    setLastDraftSavedAt(null);
    setIssuedMedCert((prev) => (prev ? { ...prev, isSigned: true } : null));
    setIssuedReferral((prev) => (prev ? { ...prev, isSigned: true } : null));
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSignedAt(nowStr);
    const successMsg = `Encounter signed by ${doctor.name} (${finalPrc}) at ${nowStr}. Clinical charge slip posted to Cashier.`;
    setBanner({
      text: successMsg,
      isError: false,
    });
    notify.success(successMsg);
    setPostEncounterModalVisible(true);
  };

  const handleAbandonUnsignedEncounter = () => {
    if (!selectedPatient || isSigned) return;
    Alert.alert(
      'Discard unsigned consultation draft?',
      'Prescriptions, clinic-dispensed starter medicines, medical certificates, referrals, and laboratory requisitions created during an unsigned encounter are invalid and will be cleanly reverted with zero orphan records.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard & revert',
          style: 'destructive',
          onPress: async () => {
            setIsAbandoningDraft(true);
            if (autoSaveTimerRef.current) {
              clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            queuedDraftSnapshotRef.current = null;
            latestUnsavedSnapshotRef.current = null;
            inFlightFingerprintRef.current = '';
            draftSaveEpochRef.current += 1;
            if (inFlightDraftSavePromiseRef.current) {
              await inFlightDraftSavePromiseRef.current.catch(() => null);
            }
            const targetConsultationId =
              consultationIdRef.current ||
              signedConsultationId ||
              (selectedPatient ? savedConsultationByVisitRef.current[selectedPatient.id] : null) ||
              null;
            if (targetConsultationId) {
              const [, abandonErr] = await clinicService.abandonConsultation(targetConsultationId, {
                reason: 'Unsigned consultation draft discarded by physician',
                cancelVisit: false,
              });
              if (abandonErr) {
                setIsAbandoningDraft(false);
                Alert.alert('Unable to discard draft', abandonErr.message || 'Please try again.');
                return;
              }
            }
            if (selectedPatient?.id) {
              delete savedConsultationByVisitRef.current[selectedPatient.id];
              clearLocalConsultationDraft({
                clinicId: selectedPatient.clinicId || settings?.clinicId || null,
                visitId: selectedPatient.id,
                patientId: selectedPatient.patientId,
                consultationId: targetConsultationId,
              });
            }
            const currentPatient = selectedPatient;
            resetEncounter(currentPatient);
            await Promise.all([
              loadPatientContext(currentPatient).catch(() => {}),
              loadQueue().catch(() => {}),
            ]);
            setIsAbandoningDraft(false);
            notify.info('Unsigned consultation draft discarded with zero orphan records.');
          },
        },
      ],
    );
  };

  const buildBillableItems = (): CreateInvoiceRequest['lineItems'] => {
    const items: CreateInvoiceRequest['lineItems'] = [];
    const doctor = signer;
    const docId = doctor?.id;
    const docName = doctor?.name;
    if (consultationFee) {
      items.push({
        serviceItemId: consultationFee.id,
        itemCode: consultationFee.code,
        description: consultationFee.name,
        category: consultationFee.category,
        unitPrice: consultationFee.standardPrice,
        quantity: 1,
        doctorId: docId,
        doctorName: docName,
      });
    }
    for (const proc of orderedProcedures) {
      const procInfo = procedureCatalog.find(
        (p) => p.name.toLowerCase() === proc.name.toLowerCase() || (p.code && p.code === proc.code)
      );
      items.push({
        serviceItemId: proc.serviceItemId || procInfo?.id,
        itemCode: proc.code || procInfo?.code,
        description: proc.name,
        category: proc.category || procInfo?.category || 'Procedure',
        unitPrice: proc.standardPrice || procInfo?.standardPrice || 0,
        quantity: 1,
        doctorId: (proc as any).orderedByDoctorId || docId,
        doctorName: (proc as any).orderedByDoctorName || docName,
      });
    }
    const inHouseLabs = orderedLabs.filter((l) => l.fulfillmentMode === 'in_house');
    for (const inHouseLab of inHouseLabs) {
      const matchedDiag = diagnosticCatalog.find((d) => d.name.toLowerCase() === inHouseLab.name.toLowerCase());
      const philHealthCode = inHouseLab.philHealthCode || matchedDiag?.philHealthCode;
      const isCoveredByYakap = Boolean(isYakapEligible && philHealthCode);
      const unitPrice = isCoveredByYakap ? 0 : (inHouseLab.standardPrice ?? matchedDiag?.standardPrice ?? 0);
      const description = isCoveredByYakap
        ? `${inHouseLab.name} (PhilHealth Yakap - ₱0 Co-pay)`
        : inHouseLab.name;

      items.push({
        serviceItemId: inHouseLab.serviceItemId || matchedDiag?.id,
        itemCode: inHouseLab.code || matchedDiag?.code,
        description,
        category: inHouseLab.category || matchedDiag?.category || 'Diagnostic',
        unitPrice,
        quantity: 1,
        doctorId: docId,
        doctorName: docName,
      });
    }
    if (items.length === 0) {
      items.push({
        itemCode: isDentalEnabled ? 'CONS-DENT' : 'CONS-GEN',
        description: isDentalEnabled ? 'Dental Consultation' : 'General Outpatient Consultation',
        category: 'Consultation',
        unitPrice: 500,
        quantity: 1,
        doctorId: docId,
        doctorName: docName,
      });
    }
    return items;
  };

  const chargeSlipGross = useMemo(
    () => chargeSlipItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [chargeSlipItems]
  );
  const soaGrossAmount = chargeSlipGross;

  const handleInitiateSignAndReviewChargeSlip = () => {
    if (!selectedPatient) return;
    setBanner(null);

    const doctor = requireSigner();
    if (!doctor) return;

    if (hasPendingInClinicProcedures) {
      const msg = `Encounter signing is locked: ${pendingProcedureReason ?? 'In-clinic procedures are pending in the Procedure Bay'}. All ordered procedures must be executed or cancelled before signing.`;
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      return;
    }

    // Clinical Decision Support (CDS) Critical Override Gate
    const criticalAlerts = cdsAlerts.filter((a) => a.requiresOverrideReason);
    if (criticalAlerts.length > 0 && (!cdsOverrideReason.trim() || !overrideConfirmed)) {
      const msg = `Safety check: ${criticalAlerts.length} critical drug allergy or severe interaction alert(s) need a documented clinical override before the encounter can be signed.`;
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      setShowOverrideInput(true);
      return;
    }

    // PDEA Dangerous Drug validation (Philippine Comprehensive Dangerous Drugs Act RA 9165)
    const hasDangerousDrugs = prescriptions.some((p) => p.isDangerousDrug);
    if (hasDangerousDrugs) {
      const finalS2 = (doctorS2.trim() || signerStaff?.s2LicenseNumber?.trim()) || '';
      if (!finalS2) {
        const msg = 'PDEA dangerous drug prescribed: Doctor S2 license number is required before signing.';
        setBanner({
          text: msg,
          isError: true,
        });
        notify.error(msg);
        return;
      }
    }

    // PhilHealth Yakap statutory signing gate
    if (isYakapEligible && !isYakapReady) {
      const missing = (serverReadiness || localEvaluation).missingFields;
      const msg = `PhilHealth Yakap encounter cannot be signed: ${missing.length} required field(s) missing (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}). Complete these fields or switch off the Yakap toggle.`;
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg);
      return;
    }

    // Auto-populate billable items for read-only charge slip preview
    const items = buildBillableItems();
    setChargeSlipItems(items);
    setReviewChargeSlipModalVisible(true);
  };

  const handleInitiateSignAndReviewSoa = handleInitiateSignAndReviewChargeSlip;

  const handleConfirmAndSignEncounter = async () => {
    setReviewChargeSlipModalVisible(false);
    await handleSignAndSync();
  };

  const vitalItems = (
    vitals
      ? [
          vitals.systolicBp != null && vitals.diastolicBp != null
            ? { label: 'BP', value: `${vitals.systolicBp}/${vitals.diastolicBp}` }
            : null,
          vitals.heartRateBpm != null ? { label: 'HR', value: `${vitals.heartRateBpm} bpm` } : null,
          (vitals.respiratoryRateBreathsPerMin != null || (vitals as any).respiratoryRate != null)
            ? { label: 'RR', value: `${vitals.respiratoryRateBreathsPerMin ?? (vitals as any).respiratoryRate}/min` }
            : null,
          vitals.temperatureCelsius != null ? { label: 'Temp', value: `${vitals.temperatureCelsius}°C` } : null,
          vitals.oxygenSaturationPercent != null ? { label: 'SpO2', value: `${vitals.oxygenSaturationPercent}%` } : null,
          vitals.bodyLengthCm != null
            ? { label: 'Length', value: `${vitals.bodyLengthCm} cm` }
            : (vitals.heightCm != null ? { label: 'Height', value: `${vitals.heightCm} cm` } : null),
          vitals.weightKg != null ? { label: 'Weight', value: `${vitals.weightKg} kg` } : null,
          vitals.bmi != null ? { label: 'BMI', value: `${vitals.bmi}` } : null,
          vitals.painScore != null ? { label: 'Pain', value: `${vitals.painScore}/10` } : null,
        ]
      : []
  ).filter((v): v is { label: string; value: string } => v !== null);

  const localEvaluation = useMemo(() => {
    const panValid = !!(doctorPan.trim() || signerStaff?.philHealthPan?.trim());
    const prcValid = !!(doctorPrc.trim() || signerStaff?.prcLicenseNumber?.trim());
    const pinRaw = patientRecord?.philHealthNumber || (patientRecord as any)?.pin || patientChart?.demographics?.philHealthNumber || '';
    const pinDigits = pinRaw.replace(/\D/g, '');
    const pinValid = pinDigits.length === 12;
    const atcVal = philHealthAtc.trim();
    const atcValid = !!atcVal;

    const hasSymptom = selectedSymptomCodes.length > 0;
    const hasPainCode = selectedSymptomCodes.includes('38');
    const painSiteValid = !hasPainCode || !!symptomPainSite.trim();
    const hasOtherCode = selectedSymptomCodes.includes('X');
    const otherValid = !hasOtherCode || !!(symptomOtherDesc.trim() || subjective.trim());
    const symptomsValid = hasSymptom && painSiteValid && otherValid;

    const peComplete = !!(
      physicalExamFindings.generalSurvey &&
      physicalExamFindings.skin &&
      physicalExamFindings.heent &&
      physicalExamFindings.chest &&
      physicalExamFindings.heart &&
      physicalExamFindings.abdomen &&
      physicalExamFindings.neuro &&
      physicalExamFindings.rectal &&
      physicalExamFindings.gu &&
      physicalExamFindings.musculoskeletal
    );

    const primaryDiagPresent = selectedDiagnoses.some((d) => d.isPrimary);

    const dob = patientRecord?.dateOfBirth;
    let ageMonths = (patientRecord?.age ?? 30) * 12;
    if (dob) {
      const birth = new Date(dob);
      const now = new Date();
      ageMonths = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
      if (now.getDate() < birth.getDate()) ageMonths--;
      if (ageMonths < 0) ageMonths = 0;
    }
    const isInfant = ageMonths <= 24;

    const hasRr = !!(vitals?.respiratoryRateBreathsPerMin || (vitals as any)?.respiratoryRate);
    const hasHr = !!vitals?.heartRateBpm;
    const hasTemp = !!vitals?.temperatureCelsius;
    const hasWeight = !!vitals?.weightKg;
    const hasLengthOrHeight = !!(vitals?.heightCm || vitals?.bodyLengthCm);
    const hasBp = !!(vitals?.systolicBp && vitals?.diastolicBp);

    const vitalsComp = isInfant
      ? !!(hasHr && hasRr && hasTemp && hasWeight && hasLengthOrHeight)
      : !!(hasBp && hasHr && hasRr && hasTemp && hasWeight && hasLengthOrHeight);

    const hasDangerousDrug = prescriptions.some((p) => p.isDangerousDrug);
    const s2Valid = !hasDangerousDrug || !!(doctorS2.trim() || signerStaff?.s2LicenseNumber?.trim());
    const medicinesValid = prescriptions.length === 0 || prescriptions.every((p) => !!p.genericName);

    const missing: string[] = [];
    if (!panValid) missing.push('Doctor PhilHealth Accreditation Number (PAN) is missing.');
    if (!prcValid) missing.push('Doctor PRC License number is required to sign encounters.');
    if (!pinValid) missing.push('Patient PhilHealth PIN is invalid (must contain exactly 12 numeric digits).');
    if (!atcValid) missing.push('Encounter ATC code is required.');
    if (!hasSymptom) missing.push('At least one complaint or symptom is required.');
    if (hasPainCode && !painSiteValid) missing.push('Pain site description is required when pain is reported.');
    if (hasOtherCode && !otherValid) missing.push('Description is required when other complaint is reported.');
    if (!peComplete) missing.push('Comprehensive physical examination and general survey must be completed.');
    if (!primaryDiagPresent) missing.push('At least one diagnosis must be designated Primary ICD-10.');
    if (!vitalsComp) {
      if (isInfant) {
        missing.push('Complete infant triage vitals required (HR, RR, Temp, Weight, Length/Height).');
      } else {
        missing.push('Complete triage vitals required (BP, HR, RR, Temp, Height, Weight).');
      }
    }
    if (!s2Valid) missing.push('Doctor S2 License number is required for PDEA controlled drugs.');

    const ready =
      panValid &&
      prcValid &&
      pinValid &&
      atcValid &&
      symptomsValid &&
      peComplete &&
      primaryDiagPresent &&
      vitalsComp &&
      medicinesValid &&
      s2Valid;

    return {
      encounterId: signedConsultationId || selectedPatient?.id || '',
      doctorPanValid: panValid,
      doctorPrcValid: prcValid,
      patientPinValid: pinValid,
      atcValid,
      symptomsValid,
      physicalExamComplete: peComplete,
      primaryDiagnosisPresent: primaryDiagPresent,
      vitalsComplete: vitalsComp,
      medicinesValid,
      s2LicenseValid: s2Valid,
      missingFields: missing,
      warnings: [],
      isReady: ready,
    };
  }, [
    doctorPan,
    doctorPrc,
    doctorS2,
    signerStaff,
    patientRecord,
    patientChart?.demographics?.philHealthNumber,
    philHealthAtc,
    selectedSymptomCodes,
    symptomPainSite,
    symptomOtherDesc,
    subjective,
    physicalExamFindings,
    selectedDiagnoses,
    vitals,
    prescriptions,
  ]);

  const loadYakapReadiness = useCallback(async () => {
    if (!signedConsultationId) return;
    setIsValidatingReadiness(true);
    const [res] = await clinicService.validateConsultationYakapReadiness(signedConsultationId);
    if (res) {
      setServerReadiness(res);
    }
    setIsValidatingReadiness(false);
  }, [signedConsultationId]);

  const isYakapReady = isYakapEligible
    ? (serverReadiness ? serverReadiness.isReady : localEvaluation.isReady)
    : true;

  const pendingProcedureReason = useMemo(() => {
    if (!selectedPatient) return null;

    // 1. Unhanded-off procedures drafted in workstation
    const unhandedOff = orderedProcedures.filter((p) => !p.isHandedOff && p.status !== 'sent_to_room');
    if (unhandedOff.length > 0) {
      return `${unhandedOff.length} procedure(s) pending handoff`;
    }

    const procsList = patientChart?.proceduresHistory || [];
    // 2. Active procedures in chart for this patient/visit
    const relevantProcs = procsList.filter(
      (proc) =>
        (selectedPatient.id && proc.queueItemId === selectedPatient.id) ||
        (signedConsultationId && proc.consultationId === signedConsultationId) ||
        (!proc.queueItemId && selectedPatient.patientId && proc.patientId === selectedPatient.patientId)
    );

    const hasActiveProcs = relevantProcs.some(
      (p) => p.status === 'Ordered' || p.status === 'InProgress'
    );
    if (hasActiveProcs) {
      return 'In-clinic procedures pending in Procedure Bay';
    }

    // If there are procedures for this visit/patient and all are Completed/Cancelled, NO procedures are pending!
    if (relevantProcs.length > 0 && relevantProcs.every((p) => p.status === 'Completed' || p.status === 'Cancelled')) {
      return null;
    }

    // Check if the patient chart as a whole has completed procedures and NO active ones
    const anyActiveInChart = procsList.some((p) => p.status === 'Ordered' || p.status === 'InProgress');
    const anyCompletedInChart = procsList.some((p) => p.status === 'Completed');
    if (anyCompletedInChart && !anyActiveInChart) {
      return null;
    }

    // 3. Fallback: If queue status is PendingProcedure and there are no completed procedures to contradict it
    if (selectedPatient.status === 'PendingProcedure') {
      return 'In Procedure Bay';
    }

    return null;
  }, [selectedPatient, patientChart?.proceduresHistory, signedConsultationId, orderedProcedures]);

  const hasPendingInClinicProcedures = Boolean(pendingProcedureReason);

  const latestExecutedProcedure = useMemo(() => {
    const list = patientChart?.proceduresHistory || [];
    return list.find((p) => p.status === 'Completed') || null;
  }, [patientChart?.proceduresHistory]);

  // Automatically sync patient status to ReEvaluation when procedures are completed
  useEffect(() => {
    if (
      selectedPatient?.status === 'PendingProcedure' &&
      !hasPendingInClinicProcedures &&
      latestExecutedProcedure?.status === 'Completed'
    ) {
      setSelectedPatient((prev) =>
        prev && prev.status === 'PendingProcedure' ? { ...prev, status: 'ReEvaluation' } : prev
      );
      setPatients((prev) =>
        prev.map((item) =>
          item.id === selectedPatient?.id && item.status === 'PendingProcedure'
            ? { ...item, status: 'ReEvaluation' }
            : item
        )
      );
      loadQueue().catch(() => {});
    }
  }, [selectedPatient?.id, selectedPatient?.status, hasPendingInClinicProcedures, latestExecutedProcedure?.status, loadQueue]);

  const formatProcedureVitals = (jsonStr?: string) => {
    if (!jsonStr) return 'Not recorded';
    try {
      const v = JSON.parse(jsonStr);
      const items: string[] = [];
      if (v.systolicBp && v.diastolicBp) items.push(`BP ${v.systolicBp}/${v.diastolicBp}`);
      if (v.heartRateBpm || v.heartRate) items.push(`HR ${v.heartRateBpm || v.heartRate} bpm`);
      if (v.respiratoryRateBreathsPerMin || v.respiratoryRate) items.push(`RR ${v.respiratoryRateBreathsPerMin || v.respiratoryRate} cpm`);
      if (v.temperatureCelsius || v.temperature) items.push(`Temp ${v.temperatureCelsius || v.temperature}°C`);
      if (v.oxygenSaturationPercent || v.oxygenSaturation) items.push(`SpO2 ${v.oxygenSaturationPercent || v.oxygenSaturation}%`);
      return items.join(' • ') || 'Normal';
    } catch {
      return jsonStr;
    }
  };

  const isPostProcedureVitalsImported = useMemo(() => {
    if (!latestExecutedProcedure) return false;
    if (importedProcedureIds.includes(latestExecutedProcedure.id)) return true;
    if (!objective) return false;
    const marker = `Post-${latestExecutedProcedure.procedureName} Vitals:`;
    return objective.includes(marker);
  }, [latestExecutedProcedure, importedProcedureIds, objective]);

  const handleImportPostProcedureVitals = (proc?: ClinicalProcedureRecord | null) => {
    if (!proc) return;
    const marker = `Post-${proc.procedureName} Vitals:`;
    if (objective.includes(marker) || importedProcedureIds.includes(proc.id)) {
      notify.info('Post-procedure findings are already included in Objective notes.');
      return;
    }
    const postStr = `\nPost-${proc.procedureName} Vitals: ${formatProcedureVitals(proc.postProcedureVitalsJson)}. Nurse Notes: ${proc.clinicalNotes || 'Tolerated well'}. Complications: ${proc.complications || 'None'}.`;
    setObjective((prev) => {
      if (!prev) return postStr.trim();
      if (prev.includes(marker)) return prev;
      return `${prev.trim()}${postStr}`;
    });
    setImportedProcedureIds((prev) => (prev.includes(proc.id) ? prev : [...prev, proc.id]));
    notify.success('Imported post-procedure findings into Objective notes.');
  };

  const handleHandoffAllProcedures = async () => {
    if (!selectedPatient) return;
    const doctor = requireSigner();
    if (!doctor) return;

    const activeVisit = await materializeVisitIfNeeded('PendingProcedure');
    if (!activeVisit) return;

    const availableRooms = treatmentRooms.length > 0 ? treatmentRooms : activeRooms;
    const defaultTargetRoom =
      treatmentRooms.find((r) => r.id === selectedTreatmentRoomId) ?? availableRooms[0];
    const defaultResolvedName = defaultTargetRoom?.name || 'Treatment Room';

    const unhandedOff = orderedProcedures.filter((p) => !p.isHandedOff && p.status !== 'sent_to_room');
    if (unhandedOff.length === 0) {
      notify.info('All selected procedures have already been handed off to the nurse station.');
      return;
    }

    setIsHandoffSending(true);
    const linkedConsultationId = await ensureDraftConsultationSaved(activeVisit, doctor);
    if (!linkedConsultationId) {
      setIsHandoffSending(false);
      return;
    }
    const errors: string[] = [];
    const newlyCreatedProcs: ClinicalProcedureRecord[] = [];
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    for (const proc of unhandedOff) {
      const procInfo = procedureCatalog.find(
        (p) => p.name.toLowerCase() === proc.name.toLowerCase() || (p.code && p.code === proc.code)
      );
      const procTargetRoom =
        availableRooms.find((r) => r.id === (proc.targetRoomId || proc.roomId)) ??
        defaultTargetRoom;
      const procTargetId = proc.targetRoomId || proc.roomId || procTargetRoom?.id;
      const procTargetName = proc.targetRoomName || proc.roomName || procTargetRoom?.name || defaultResolvedName;

      const [orderedProc, procErr] = await clinicService.orderProcedure({
        patientId: activeVisit.patientId,
        patientName: activeVisit.patientName,
        queueItemId: activeVisit.id,
        consultationId: linkedConsultationId,
        procedureCode: proc.code || procInfo?.code,
        procedureName: proc.name,
        category: proc.category || procInfo?.category || 'Procedure',
        orderedByDoctorId: doctor.id,
        orderedByDoctorName: doctor.name,
        targetRoomId: procTargetId,
        targetRoomName: procTargetName,
        toothNumber: proc.toothNumber,
        toothSurface: proc.toothSurface,
        clinicalNotes: proc.instructions
          ? `${proc.instructions} (Assessment: ${assessment || 'Evaluation'})`
          : `Ordered for in-clinic execution: ${assessment || 'Evaluation'}`,
      });

      if (procErr) {
        errors.push(`${proc.name}: ${procErr.message || 'failed'}`);
      } else {
        if (orderedProc) {
          newlyCreatedProcs.push(orderedProc);
        }
        const finalRoomId = orderedProc?.targetRoomId || procTargetId;
        const finalRoom = orderedProc?.targetRoomName || procTargetName;
        setOrderedProcedures((prev) =>
          prev.map((item) =>
            item.name.toLowerCase() === proc.name.toLowerCase() && item.toothNumber === proc.toothNumber
              ? {
                  ...item,
                  status: 'sent_to_room',
                  sentToRoomId: finalRoomId,
                  sentToRoomName: finalRoom,
                  sentAt: nowStr,
                  isHandedOff: true,
                  handedOffAt: nowStr,
                  targetRoomId: finalRoomId,
                  targetRoomName: finalRoom,
                  roomId: finalRoomId,
                  roomName: finalRoom,
                  procedureId: orderedProc?.id,
                }
              : item
          )
        );
      }
    }

    setIsHandoffSending(false);

    if (errors.length > 0) {
      notify.error(`Handoff incomplete: ${errors.join(', ')}`);
    } else {
      setSelectedPatient((prev) =>
        prev
          ? {
              ...prev,
              id: activeVisit.id,
              status: 'PendingProcedure',
              roomId: defaultTargetRoom?.id,
              roomOrStation: defaultResolvedName,
            }
          : null
      );
      notify.success(
        `${unhandedOff.length} in-clinic procedure${unhandedOff.length > 1 ? 's' : ''} handed off to ${defaultResolvedName}.`
      );

      // Immediate reflection in patient chart on the left without needing manual page refresh:
      if (newlyCreatedProcs.length > 0) {
        setPatientChart((prev) => {
          if (!prev) return prev;
          const existing = (prev.proceduresHistory || []).filter(
            (p) => !newlyCreatedProcs.some((np) => np.id === p.id)
          );
          return {
            ...prev,
            proceduresHistory: [...newlyCreatedProcs, ...existing],
          };
        });
      }
      await refreshPatientChart(activeVisit.patientId).catch(() => {});
      loadQueue();
    }
  };

  const handleHandoffToTreatmentRoom = async (procedureName: string, toothNumber?: number) => {
    if (!selectedPatient) return;
    const doctor = requireSigner();
    if (!doctor) return;

    const activeVisit = await materializeVisitIfNeeded('PendingProcedure');
    if (!activeVisit) return;

    const linkedConsultationId = await ensureDraftConsultationSaved(activeVisit, doctor);
    if (!linkedConsultationId) return;

    const target = orderedProcedures.find(
      (p) => p.name.toLowerCase() === procedureName.toLowerCase() && (toothNumber === undefined || p.toothNumber === toothNumber)
    );
    const procInfo = procedureCatalog.find((p) => p.name.toLowerCase() === procedureName.toLowerCase());
    const availableRooms = treatmentRooms.length > 0 ? treatmentRooms : activeRooms;
    const targetRoom =
      availableRooms.find((r) => r.id === (target?.targetRoomId || target?.roomId)) ??
      treatmentRooms.find((r) => r.id === selectedTreatmentRoomId) ??
      availableRooms[0];
    const resolvedTargetName = target?.targetRoomName || target?.roomName || targetRoom?.name || 'Treatment Room';
    const targetRoomId = target?.targetRoomId || target?.roomId || targetRoom?.id;

    const [proc, procErr] = await clinicService.orderProcedure({
      patientId: activeVisit.patientId,
      patientName: activeVisit.patientName,
      queueItemId: activeVisit.id,
      consultationId: linkedConsultationId,
      procedureCode: target?.code || procInfo?.code,
      procedureName: procedureName,
      category: target?.category || procInfo?.category || 'Procedure',
      orderedByDoctorId: doctor.id,
      orderedByDoctorName: doctor.name,
      targetRoomId: targetRoomId,
      targetRoomName: resolvedTargetName,
      toothNumber: target?.toothNumber,
      toothSurface: target?.toothSurface,
      clinicalNotes: target?.instructions
        ? `${target.instructions} (Assessment: ${assessment || 'Evaluation'})`
        : `Ordered for in-clinic execution: ${assessment || 'Evaluation'}`,
    });

    if (procErr) {
      notify.error(procErr.message || `Could not hand off procedure to ${resolvedTargetName}.`);
      return;
    }

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const finalRoomId = proc?.targetRoomId ?? targetRoomId;
    const finalRoomName = proc?.targetRoomName || resolvedTargetName;
    setOrderedProcedures((prev) =>
      prev.map((item) =>
        item.name.toLowerCase() === procedureName.toLowerCase() && (toothNumber === undefined || item.toothNumber === toothNumber)
          ? {
              ...item,
              status: 'sent_to_room',
              sentToRoomId: finalRoomId,
              sentToRoomName: finalRoomName,
              sentAt: nowStr,
              isHandedOff: true,
              handedOffAt: nowStr,
              targetRoomId: finalRoomId,
              targetRoomName: finalRoomName,
              roomId: finalRoomId,
              roomName: finalRoomName,
              procedureId: proc?.id,
            }
          : item
      )
    );
    setSelectedPatient((prev) =>
      prev
        ? {
            ...prev,
            id: activeVisit.id,
            status: 'PendingProcedure',
            roomId: finalRoomId,
            roomOrStation: finalRoomName,
          }
        : null,
    );
    notify.success(`${procedureName} ordered. Patient routed to ${finalRoomName}.`);

    // Immediate reflection in patient chart on the left without needing manual page refresh:
    if (proc) {
      setPatientChart((prev) =>
        prev
          ? {
              ...prev,
              proceduresHistory: [proc, ...(prev.proceduresHistory || []).filter((p) => p.id !== proc.id)],
            }
          : prev
      );
    }
    await refreshPatientChart(selectedPatient.patientId).catch(() => {});
    loadQueue();
  };

  const patientAgeString = patientRecord?.dateOfBirth
    ? formatLongAge(patientRecord.dateOfBirth)
    : (patientRecord ? `${patientRecord.age} yrs` : null);

  const patientMeta = selectedPatient
    ? [
        `Ticket ${selectedPatient.queueNumber}`,
        patientRecord ? `${patientAgeString ? `${patientAgeString}, ` : ''}${patientRecord.sex}` : null,
        selectedPatient.chiefComplaint ? `Chief complaint: ${selectedPatient.chiefComplaint}` : null,
      ]
        .filter(Boolean)
        .join(' • ')
    : '';
  const allergiesText = patientRecord?.allergies?.trim();

  const isMedCertDraft = Boolean(issuedMedCert && (!isSigned || issuedMedCert.isSigned === false));
  const isReferralDraft = Boolean(issuedReferral && (!isSigned || issuedReferral.isSigned === false));
  const isPreviewDocDraft =
    previewType === 'MEDCERT'
      ? isMedCertDraft
      : previewType === 'REFERRAL'
        ? isReferralDraft
        : !isSigned;

  const docSignature =
    previewType === 'MEDCERT'
      ? {
          name: issuedMedCert?.doctorName,
          prc: issuedMedCert?.prcLicenseNumber,
          ptr: issuedMedCert?.ptrNumber,
          signed: Boolean(isSigned && issuedMedCert?.isSigned !== false),
        }
      : {
          name: issuedReferral?.referringDoctorName,
          prc: doctorPrc || undefined,
          ptr: doctorPtr || undefined,
          signed: Boolean(isSigned && issuedReferral?.isSigned !== false),
        };

  const chartMedCertsForTab = useMemo(() => {
    const base = (patientChart?.medicalCertificates || []).map((cert) => {
      if (
        !isSigned &&
        ((consultationIdRef.current && cert.consultationId === consultationIdRef.current) ||
          (selectedPatient?.id && cert.queueItemId === selectedPatient.id) ||
          (issuedMedCert && cert.id === issuedMedCert.id))
      ) {
        return { ...cert, isSigned: false };
      }
      return cert;
    });
    if (issuedMedCert && !base.some((c) => c.id === issuedMedCert.id)) {
      return [{ ...issuedMedCert, isSigned: !isMedCertDraft }, ...base];
    }
    return base;
  }, [patientChart?.medicalCertificates, isSigned, selectedPatient?.id, issuedMedCert, isMedCertDraft]);

  const chartReferralsForTab = useMemo(() => {
    const base = (patientChart?.referralLetters || []).map((letter) => {
      if (
        !isSigned &&
        ((consultationIdRef.current && letter.consultationId === consultationIdRef.current) ||
          (selectedPatient?.id && letter.queueItemId === selectedPatient.id) ||
          (issuedReferral && letter.id === issuedReferral.id))
      ) {
        return { ...letter, isSigned: false };
      }
      return letter;
    });
    if (issuedReferral && !base.some((r) => r.id === issuedReferral.id)) {
      return [{ ...issuedReferral, isSigned: !isReferralDraft }, ...base];
    }
    return base;
  }, [patientChart?.referralLetters, isSigned, selectedPatient?.id, issuedReferral, isReferralDraft]);

  const openPanicModal = (order: ClinicLabOrderRecord) => {
    setSelectedPanicOrder(order);
    setPanicModalVisible(true);
  };

  const downloadPdf = async (url: string, failureMessage: string) => {
    try {
      if (!(await openDocument(url))) throw new Error('Could not open the document');
    } catch {
      Alert.alert('Download error', failureMessage);
    }
  };

  const renderLabResults = () => (
    <Card>
      <CardHeader
        title="Diagnostic reports"
        icon="lab"
        subtitle="Verified findings from the diagnostic and laboratory information system"
      />
      {labError ? (
        <ErrorState
          compact
          title="Unable to load diagnostic reports"
          message={labError}
          onRetry={() => selectedPatient && loadPatientContext(selectedPatient)}
        />
      ) : contextLoading && labOrders.length === 0 ? (
        <SkeletonList rows={2} />
      ) : labOrders.length === 0 ? (
        <ThemedText variant="small" color={theme.colors.textMuted}>
          No diagnostic reports on file for this patient.
        </ThemedText>
      ) : (
        <View style={styles.stack}>
          {labOrders.map((order) => {
            const isFinal = order.status === 'Completed';
            const isAck = order.isPanicAcknowledged ?? Boolean(order.panicAcknowledgedAt);
            const testName = order.testName || order.items?.[0]?.testName || 'Laboratory panel';
            const orderedDate = formatDate(order.orderedAt || order.orderDate);
            const findings = formatCriticalFindings(order);
            const meta = [
              order.specimenType ? `Specimen: ${order.specimenType}` : null,
              orderedDate ? `Ordered: ${orderedDate}` : null,
            ]
              .filter(Boolean)
              .join(' • ');

            return (
              <View
                key={order.id}
                style={[styles.labCard, order.hasCriticalPanicAlert && styles.labCardCritical]}
              >
                <View style={styles.rowBetween}>
                  <View style={styles.flex}>
                    <View style={styles.rowWrap}>
                      <ThemedText variant="bodyBold">{testName}</ThemedText>
                      <Badge
                        label={isFinal ? 'Final, verified' : humanize(order.status)}
                        variant={isFinal ? 'success' : order.status === 'SpecimenCollected' ? 'info' : 'neutral'}
                      />
                      {order.hasCriticalPanicAlert ? <Badge label="Critical value" variant="emergency" /> : null}
                    </View>
                    {meta ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {meta}
                      </ThemedText>
                    ) : null}
                    <LabOrderStageChip order={order} />
                  </View>
                  <Button
                    title={isFinal ? 'PDF report' : 'View Lab Slip'}
                    icon="file"
                    variant="outline"
                    size="sm"
                    onPress={() => (isFinal ? handleOpenLabPdf(order.id) : handleOpenLabSlip(order.id))}
                  />
                </View>

                {findings ? (
                  <View style={styles.findingsBox}>
                    <ThemedText variant="small" color={theme.colors.emergencyText}>
                      <ThemedText variant="smallBold" color={theme.colors.emergencyText}>
                        Findings:{' '}
                      </ThemedText>
                      {findings}
                    </ThemedText>
                  </View>
                ) : null}

                {order.hasCriticalPanicAlert && !isAck ? (
                  <View style={styles.rowBetween}>
                    <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex}>
                      The telephone readback for this critical value has not been logged yet.
                    </ThemedText>
                    <Button
                      title="Acknowledge"
                      variant="danger"
                      size="sm"
                      onPress={() => openPanicModal(order)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );

  const handleVerifyAttachment = async (
    attachmentId: string,
    isApproved: boolean,
    userRejectionReason?: string
  ) => {
    const verifierName = (
      (current ? formatStaffName(current) : '') ||
      signerName ||
      authUser?.name ||
      authUser?.email ||
      ''
    ).trim();
    const rawVerifierId = current?.id || signer?.id || authUser?.id || '';
    const verifierId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawVerifierId)
      ? rawVerifierId
      : undefined;

    const rejectionReason = !isApproved
      ? (userRejectionReason?.trim() || 'Document illegible or missing official physician signature/stamp.')
      : undefined;
    const [, verifyErr] = await clinicService.verifyRecordAttachment(
      attachmentId,
      isApproved,
      rejectionReason,
      verifierName || undefined,
      verifierId
    );
    if (verifyErr) {
      notify.error(verifyErr.message || 'Could not update the document.');
      return;
    }

    setPatientChart((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        attachments: (prev.attachments || []).map((att) =>
          att.id === attachmentId
            ? {
                ...att,
                verificationStatus: isApproved ? 'Verified' : 'Rejected',
                rejectionReason,
                verifiedAt: new Date().toISOString(),
                verifiedByStaffId: verifierId || att.verifiedByStaffId,
                verifiedByStaffName: verifierName || att.verifiedByStaffName || undefined,
              }
            : att
        ),
      };
    });

    notify.success(isApproved ? 'Document verified.' : 'Document rejected.');
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    try {
      const url = clinicService.getRecordAttachmentDownloadUrl(attachmentId);
      if (!(await openDocument(url))) throw new Error('Could not open the document');
    } catch (e: any) {
      Alert.alert('Unable to open document', e.message || 'Network error');
    }
  };

  const refreshChartContextRef = useRef({
    selectedPatientId: selectedPatient?.patientId,
    patientRecord,
    dentalChart,
    signedConsultationId,
  });
  refreshChartContextRef.current = {
    selectedPatientId: selectedPatient?.patientId,
    patientRecord,
    dentalChart,
    signedConsultationId,
  };

  // Dedicated lightweight chart refresh that does not re-initialize encounter state or trigger skeleton states
  const refreshPatientChart = useCallback(async (explicitPatientId?: string) => {
    const ctx = refreshChartContextRef.current;
    const patientId = explicitPatientId || ctx.selectedPatientId || ctx.patientRecord?.id;
    if (!patientId) return;
    const [chartRes, labRes, recordRes] = await Promise.all([
      clinicService.getPatientChart(patientId),
      clinicService.getLabOrders(patientId),
      clinicService.getPatientById(patientId),
    ]);
    const [chartData, chartErr] = chartRes;
    const [labData, labErr] = labRes;
    const [freshRecord, recordErr] = recordRes;
    const latestCtx = refreshChartContextRef.current;
    const effectiveRecord = !recordErr && freshRecord ? freshRecord : latestCtx.patientRecord;
    if (!recordErr && freshRecord) {
      setPatientRecord(freshRecord);
    }
    if (!labErr && labData) {
      setLabOrders(labData);
    }
    if (!chartErr && chartData) {
      if (!chartData.dentalTeeth || chartData.dentalTeeth.length === 0) {
        const [dentalData] = await clinicService.getPatientDentalChart(patientId);
        if (dentalData?.teeth && dentalData.teeth.length > 0) {
          chartData.dentalTeeth = dentalData.teeth;
          chartData.dentalChart = dentalData;
        }
      }
      setPatientChart(
        effectiveRecord ? reconcileChartWithPatient(chartData, effectiveRecord) : chartData,
      );
      if (
        chartData.dentalTeeth &&
        chartData.dentalTeeth.length > 0 &&
        Object.keys(latestCtx.dentalChart).length === 0
      ) {
        const taggedTeeth = chartData.dentalTeeth.map((t) => ({
          ...t,
          isCurrentEncounter: Boolean(
            latestCtx.signedConsultationId && t.consultationId === latestCtx.signedConsultationId
          ),
        }));
        const multiMap = normalizeTeethToMultiRecord(taggedTeeth);
        setDentalChart(multiMap);
      }
    }
  }, []);

  const handleVoidDentalCondition = useCallback(
    async (toothNumber: number, recordId: string, reason?: string) => {
      const targetPatientId = selectedPatient?.patientId || patientRecord?.id;
      if (!targetPatientId) return;
      const [voidedRec, voidErr] = await clinicService.voidDentalToothRecord(
        targetPatientId,
        recordId,
        reason || 'Voided in patient dental chart'
      );
      if (voidErr) {
        notify.error(voidErr.message || 'Unable to void dental tooth record.');
        return;
      }
      notify.success(`Voided condition on Tooth #${toothNumber}.`);
      setDentalChart((prev) => {
        const multi = normalizeTeethToMultiRecord(prev as any);
        const currentRecs = multi[toothNumber] || [];
        const nextRecs = voidConditionOnTooth(currentRecs, recordId, {
          voidedBy: voidedRec?.voidedBy || signerName || 'Attending Clinician',
          voidReason: voidedRec?.voidReason || reason || 'Voided in patient dental chart',
          voidedAt: voidedRec?.voidedAt || new Date().toISOString(),
        });
        return {
          ...multi,
          [toothNumber]: nextRecs,
        };
      });
      await refreshPatientChart(targetPatientId);
    },
    [selectedPatient?.patientId, patientRecord?.id, signerName, refreshPatientChart]
  );

  // Specialized refresh for Diagnostics tab that reloads chart + lab orders without touching encounter SOAP
  const refreshDiagnosticsTab = useCallback(async () => {
    const patientId = selectedPatient?.patientId || patientRecord?.id;
    if (!patientId) return;
    const [chartRes, labRes] = await Promise.all([
      clinicService.getPatientChart(patientId),
      clinicService.getLabOrders(patientId),
    ]);
    const [chartData] = chartRes;
    if (chartData) {
      setPatientChart(patientRecord ? reconcileChartWithPatient(chartData, patientRecord) : chartData);
    }
    const [labData, labErr] = labRes;
    if (!labErr && labData) setLabOrders(labData);
  }, [selectedPatient?.patientId, patientRecord]);

  // Specialized refresh for Procedures tab that reloads chart + syncs queue and patient status
  const refreshProceduresTab = useCallback(async () => {
    const patientId = selectedPatient?.patientId || patientRecord?.id;
    if (patientId) {
      await refreshPatientChart(patientId).catch(() => {});
    }
    await loadQueue().catch(() => {});
    setSelectedPatient((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: prev.status === 'PendingProcedure' ? 'ReEvaluation' : prev.status,
      };
    });
    setPatients((prev) =>
      prev.map((item) =>
        item.id === selectedPatient?.id && item.status === 'PendingProcedure'
          ? { ...item, status: 'ReEvaluation' }
          : item
      )
    );
  }, [selectedPatient?.patientId, selectedPatient?.id, patientRecord?.id, refreshPatientChart, loadQueue]);

  const handleOpenOrderProcedureModal = () => {
    setOrderSearchInitialCategory('Procedure');
    setOrderSearchModalVisible(true);
  };

  const handleOpenOrderDiagnosticModal = () => {
    setOrderSearchInitialCategory('Diagnostic');
    setOrderSearchModalVisible(true);
  };

  const renderLongitudinalChartContent = () => (
    <View style={styles.longitudinalChartContainer}>
      <Card>
        <CardHeader
          title="Patient Chart"
          subtitle={CHART_TAB_DESCRIPTIONS[activeChartTab] || 'Historical clinical chart & records'}
          icon="folder"
          truncateTitle
          truncateSubtitle
          rightAction={
            previousChartTab || isDesktopWorkstation ? (
              <View style={styles.chartHeaderActions}>
                {previousChartTab ? (
                  <Button
                    iconOnly
                    icon="arrowLeft"
                    variant="secondary"
                    size="sm"
                    onPress={handleChartTabBack}
                    accessibilityLabel={`Back to ${CHART_TAB_LABELS[previousChartTab] || 'previous section'}`}
                    testID="patient-chart-back-btn"
                  />
                ) : null}
                {isDesktopWorkstation ? (
                  <Button
                    iconOnly
                    icon={isChartExpanded ? 'layoutSplit' : 'maximize'}
                    variant="secondary"
                    size="sm"
                    onPress={handleToggleChartExpand}
                    accessibilityLabel={
                      isChartExpanded
                        ? 'Switch back to 2-column split pane'
                        : 'Expand patient chart'
                    }
                    testID={
                      isChartExpanded
                        ? 'collapse-patient-chart-btn'
                        : 'expand-patient-chart-btn'
                    }
                  />
                ) : null}
              </View>
            ) : undefined
          }
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartTabsRow}>
          {[
            { id: 'summary', label: 'Summary', icon: 'file' },
            { id: 'encounters', label: 'Encounters', icon: 'clock' },
            { id: 'diagnostics', label: 'Diagnostics', icon: 'lab' },
            { id: 'procedures', label: 'Procedures', icon: 'activity' },
            { id: 'immunizations', label: 'Immunizations', icon: 'shield' },
            { id: 'profiles', label: 'Profiles', icon: 'user' },
            { id: 'vault', label: 'Doc Vault', icon: 'folder' },
            { id: 'documents', label: 'Admin Vault', icon: 'scroll' },
            ...(isDentalEnabled ? [{ id: 'dental', label: 'Dental', icon: 'medical' }] : []),
          ].map((tab) => {
            const isActive = activeChartTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="button"
                onPress={() => handleSelectChartTab(tab.id as ChartReviewTab)}
                style={[styles.chartTabButton, isActive && styles.chartTabButtonActive]}
              >
                <Icon
                  name={tab.icon as any}
                  size={theme.sizes.iconSm}
                  color={isActive ? theme.colors.primaryDark : theme.colors.textMuted}
                />
                <ThemedText
                  variant="captionBold"
                  color={isActive ? theme.colors.primaryDark : theme.colors.textSecondary}
                >
                  {tab.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </Card>

      {activeChartTab === 'summary' && (
        <ExecutiveSummaryTab
          patient={patientRecord}
          chart={patientChart}
          onNavigateTab={(tab: any) => handleSelectChartTab(tab)}
          onRefreshChart={refreshPatientChart}
        />
      )}
      {activeChartTab === 'encounters' && (
        <EncountersTimelineTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          consultations={patientChart?.consultations || []}
          onRefreshChart={refreshPatientChart}
        />
      )}
      {activeChartTab === 'diagnostics' && (
        <DiagnosticLabTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          labOrders={labOrders}
          onRefreshChart={refreshDiagnosticsTab}
          onOpenLabSlip={handleOpenLabSlip}
          onViewLabSlip={handleOpenLabSlip}
          onOrderDiagnostic={handleOpenOrderDiagnosticModal}
        />
      )}
      {activeChartTab === 'procedures' && (
        <NursingProceduresTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          patientName={selectedPatient?.patientName}
          queueItemId={selectedPatient?.id}
          procedures={patientChart?.proceduresHistory || []}
          onRefreshChart={refreshProceduresTab}
          onOrderProcedure={handleOpenOrderProcedureModal}
        />
      )}
      {activeChartTab === 'immunizations' && (
        <StatutoryImmunizationsTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          demographics={patientChart?.demographics}
          immunizations={patientChart?.immunizations || []}
          onAdministerVaccine={async (payload) => {
            const targetPatientId = selectedPatient?.patientId || patientRecord?.id;
            if (!targetPatientId) {
              notify.error('No patient selected for vaccine administration.');
              throw new Error('No patient selected for vaccine administration.');
            }
            const [, err] = await clinicService.administerVaccine(targetPatientId, payload);
            if (err) {
              notify.error(err.message || 'Could not record vaccine administration.');
              throw new Error(err.message || 'Could not record vaccine administration.');
            }
            notify.success('Vaccine administration recorded.');
            if (selectedPatient) {
              await refreshPatientChart();
            }
          }}
          onRecordHistoricalVaccine={async (payload) => {
            const targetPatientId = selectedPatient?.patientId || patientRecord?.id;
            if (!targetPatientId) {
              notify.error('No patient selected for recording historical immunization.');
              throw new Error('No patient selected for recording historical immunization.');
            }
            const [, err] = await clinicService.recordHistoricalImmunization(targetPatientId, payload);
            if (err) {
              notify.error(err.message || 'Could not record historical immunization.');
              throw new Error(err.message || 'Could not record historical immunization.');
            }
            notify.success('Historical immunization added.');
            if (selectedPatient) {
              await refreshPatientChart();
            }
          }}
          onRecordAefi={async (immId, payload) => {
            const targetPatientId = selectedPatient?.patientId || patientRecord?.id;
            if (!targetPatientId) {
              notify.error('No patient selected for recording adverse reaction.');
              throw new Error('No patient selected for recording adverse reaction.');
            }
            const [, err] = await clinicService.recordImmunizationAefi(targetPatientId, immId, payload);
            if (err) {
              notify.error(err.message || 'Could not record adverse reaction.');
              throw new Error(err.message || 'Could not record adverse reaction.');
            }
            notify.success('Adverse event (AEFI) recorded.');
            if (selectedPatient) {
              await refreshPatientChart();
            }
          }}
          onRefreshChart={refreshPatientChart}
        />
      )}
      {activeChartTab === 'profiles' && (
        <HealthProfilesTab
          patient={patientRecord || ({} as any)}
          surgicalHistories={patientChart?.surgicalHistories || []}
          socialHistory={patientChart?.socialHistory}
          reproductiveHistory={patientChart?.reproductiveHistory}
          latestNcdAssessment={patientChart?.latestNcdAssessment}
          onRefreshChart={refreshPatientChart}
        />
      )}
      {activeChartTab === 'vault' && (
        <ExternalDocumentVaultTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          attachments={patientChart?.attachments || []}
          onUploadDocument={() => setUploadDocModalVisible(true)}
          onVerifyAttachment={handleVerifyAttachment}
          onDownloadAttachment={handleDownloadAttachment}
          onRefreshChart={refreshPatientChart}
        />
      )}
      {activeChartTab === 'documents' && (
        <AdministrativeDocumentsTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          queueItemId={selectedPatient?.id}
          medicalCertificates={chartMedCertsForTab}
          referralLetters={chartReferralsForTab}
          onRefreshChart={refreshPatientChart}
        />
      )}
      {activeChartTab === 'dental' && (
        <DentalChartTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId || patientRecord?.id}
          chart={patientChart}
          onVoidCondition={handleVoidDentalCondition}
          onRefreshChart={refreshPatientChart}
        />
      )}
    </View>
  );

  const renderSoapDocumentationContent = () => (
    <View style={styles.soapContentColumn}>
            {recordError && !contextLoading ? (
              <View style={[styles.rowBetween, { marginTop: theme.spacing.sm }]}>
                <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex}>
                  {recordError}
                </ThemedText>
                <Button
                  title="Retry"
                  icon="refresh"
                  variant="ghost"
                  size="sm"
                  onPress={() => selectedPatient && loadPatientContext(selectedPatient)}
                />
              </View>
            ) : null}

            {/* Critical lab value banner */}
            {activePanicAlert
              ? (() => {
                  const isAck = activePanicAlert.isPanicAcknowledged ?? Boolean(activePanicAlert.panicAcknowledgedAt);
                  const testName =
                    activePanicAlert.testName || activePanicAlert.items?.[0]?.testName || 'Diagnostic panel';
                  const findings = formatCriticalFindings(activePanicAlert);
                  const meta = [
                    `Order #${activePanicAlert.id.slice(-6).toUpperCase()}`,
                    testName,
                    activePanicAlert.specimenType ? `Specimen: ${activePanicAlert.specimenType}` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ');
                  const ackAt = activePanicAlert.panicAcknowledgedAt
                    ? new Date(activePanicAlert.panicAcknowledgedAt).toLocaleTimeString()
                    : '';
                  return (
                    <View style={[styles.panicBanner, isAck && styles.panicBannerAcknowledged]}>
                      <View style={styles.row}>
                        <Icon
                          name={isAck ? 'checkCircle' : 'emergency'}
                          size={theme.sizes.iconLg}
                          color={isAck ? theme.colors.success : theme.colors.emergency}
                        />
                        <View style={styles.flex}>
                          <ThemedText variant="h3" color={isAck ? theme.colors.successText : theme.colors.emergencyText}>
                            {isAck ? 'Critical value acknowledged' : 'Critical lab value needs readback'}
                          </ThemedText>
                          <ThemedText variant="small" color={theme.colors.textSecondary}>
                            {meta}
                          </ThemedText>
                        </View>
                        <Badge
                          label={isAck ? 'Readback completed' : 'Readback required'}
                          variant={isAck ? 'success' : 'emergency'}
                        />
                      </View>
                      <ThemedText variant="body" color={theme.colors.text}>
                        {findings || 'The laboratory flagged a critical value for this patient.'}
                      </ThemedText>
                      {isAck ? (
                        <ThemedText variant="small" color={theme.colors.textSecondary}>
                          Acknowledged by {activePanicAlert.panicAcknowledgedBy ?? signerName}
                          {ackAt ? ` at ${ackAt}` : ''}.
                        </ThemedText>
                      ) : (
                        <ThemedText variant="small" color={theme.colors.emergencyText}>
                          The physician must confirm receipt of this critical value by verbal readback.
                        </ThemedText>
                      )}
                      <View style={styles.actionRow}>
                        {!isAck ? (
                          <Button
                            title="Record readback"
                            icon="phone"
                            variant="danger"
                            size="sm"
                            onPress={() => openPanicModal(activePanicAlert)}
                          />
                        ) : null}
                        <Button
                          title="View lab report (PDF)"
                          icon="file"
                          variant="outline"
                          size="sm"
                          onPress={() => handleOpenLabPdf(activePanicAlert.id)}
                        />
                      </View>
                    </View>
                  );
                })()
              : null}

            {/* Notification banner */}
            {banner ? (
              <View style={[styles.bannerCard, banner.isError && styles.bannerCardError]}>
                <Icon
                  name={banner.isError ? 'alertCircle' : 'checkCircle'}
                  size={theme.sizes.iconMd}
                  color={banner.isError ? theme.colors.emergency : theme.colors.success}
                />
                <ThemedText
                  variant="bodyBold"
                  color={banner.isError ? theme.colors.emergencyText : theme.colors.successText}
                  style={styles.flex}
                >
                  {banner.text}
                </ThemedText>
              </View>
            ) : null}

            {/* Clinical Workflow Mode & ATC (when Yakap Availment) */}
            <View onLayout={(e) => { sectionOffsets.current['atc'] = e.nativeEvent.layout.y; }}>
              <WorkflowModeSelector
                mode={visitWorkflowMode}
                onChange={handleWorkflowModeChange}
                disabled={isSigned}
                atcValue={philHealthAtc}
                onChangeAtc={setPhilHealthAtc}
                isExpanded={isWorkspaceExpanded}
                onToggleExpand={isDesktopWorkstation ? handleToggleWorkspaceExpand : undefined}
                draftSaveStatus={draftSaveStatus}
                draftSavedAtLabel={draftSavedAtLabel}
                onRetryDraftSave={handleRetryDraftSave}
              />
            </View>

            {/* Nurse Pre-assessment & Triage Handoff */}
            {(() => {
              const matchedChartVitals = vitals
                ? patientChart?.vitalsHistory?.find(
                    (v) =>
                      (vitals.id && v.id === vitals.id) ||
                      (vitals.queueItemId && v.queueItemId === vitals.queueItemId)
                  )
                : null;
              const matchedNurseStaff = vitals?.nurseId
                ? staff.find((s) => s.id === vitals.nurseId)
                : undefined;
              const fallbackNurseName =
                matchedChartVitals?.recordedByNurseName?.trim() ||
                (matchedNurseStaff ? formatStaffName(matchedNurseStaff) : null);
              return (
                <NursePreAssessmentCard
                  vitals={vitals}
                  fallbackNurseName={fallbackNurseName}
                />
              );
            })()}

            {/* S - Subjective */}
            <View onLayout={(e) => { sectionOffsets.current['symptoms'] = e.nativeEvent.layout.y; }}>
              <Card>
                <CardHeader
                  title="Subjective"
                  subtitle="Chief complaint, Review of Systems categories, and history of present illness"
                />
                <View style={{ marginBottom: theme.spacing.sm }}>
                  <RosCategorySelectorSection
                    compact
                    multiple
                    disabled={isSigned}
                    value={rosCategory}
                    values={rosCategories}
                    onChangeMultiple={(next) => {
                      if (!isSigned) applyRosCategories(next);
                    }}
                    title="Review of Systems (ROS) Category"
                    subtitle="Select all involved body systems, or mark Essentially Normal when all systems are normal"
                  />
                </View>
                {isYakapEligible && symptomLibrary.error && symptoms.length === 0 ? (
                  <ErrorState
                    compact
                    title="Unable to load symptoms"
                    message={symptomLibrary.error.message}
                    onRetry={symptomLibrary.reload}
                  />
                ) : null}
                <ReviewOfSystemsChecklist
                  embedded
                  items={rosItems}
                  onChange={handleRosChange}
                  disabled={isSigned}
                  options={
                    isYakapEligible && symptoms.length > 0
                      ? symptoms.map((s) => ({ code: s.code, label: s.name }))
                      : undefined
                  }
                  loading={isYakapEligible ? symptomLibrary.loading : undefined}
                />
                <Input
                  multiline
                  placeholder="Patient narrative, symptoms, onset and duration"
                  accessibilityLabel="Subjective notes"
                  value={subjective}
                  onChangeText={setSubjective}
                  editable={!isSigned}
                  inputStyle={styles.textArea}
                />
              </Card>
            </View>

            {/* O - Objective */}
            <View onLayout={(e) => { sectionOffsets.current['physical-exam'] = e.nativeEvent.layout.y; }}>
              <Card>
                <CardHeader
                  title="Objective"
                  subtitle="Physical findings, auscultation and examination"
                  rightAction={
                    latestVitalsRecordedMeta || (!isSigned && canRecordVitals) ? (
                      <View style={styles.objectiveHeaderRight}>
                        {latestVitalsRecordedMeta ? (
                          <ThemedText variant="caption" color={theme.colors.textMuted}>
                            {latestVitalsRecordedMeta}
                          </ThemedText>
                        ) : null}
                        {!isSigned && canRecordVitals ? (
                          <Button
                            title={latestDisplayedVitals ? 'Update Vitals' : 'Record Vitals'}
                            icon="activity"
                            size="sm"
                            variant="outline"
                            onPress={handleOpenVitalsModal}
                          />
                        ) : null}
                      </View>
                    ) : undefined
                  }
                />
                {settings?.specialtyMode !== 'Dental' ? (
                  <InlinePhysicalExamCard
                    embedded
                    collapsible
                    defaultExpanded={false}
                    findings={physicalExamFindings}
                    onChange={setPhysicalExamFindings}
                    disabled={isSigned}
                  />
                ) : null}
                <Input
                  multiline
                  placeholder="Additional objective notes and clinical observations"
                  accessibilityLabel="Objective notes"
                  value={objective}
                  onChangeText={setObjective}
                  editable={!isSigned}
                  inputStyle={styles.textArea}
                />
              </Card>
            </View>

            {/* PhilHealth YAKAP Specific Encounter Forms (Ob-Gyne, Pediatric, Adolescent, HEADSSS, BP Log) */}
            {isYakapEligible && (
              <SpecificEncounterFormsCard
                obGyneExam={obGyneExam}
                onObGyneExamChange={setObGyneExam}
                pediatricMilestones={pediatricMilestones}
                onPediatricMilestonesChange={setPediatricMilestones}
                adolescentAssessment={adolescentAssessment}
                onAdolescentAssessmentChange={setAdolescentAssessment}
                headsssAssessments={headsssAssessments}
                onHeadsssAssessmentsChange={setHeadsssAssessments}
                bpMonitoringLogs={bpMonitoringLogs}
                onBpMonitoringLogsChange={setBpMonitoringLogs}
                patientAgeYears={patientRecord?.age ?? patientChart?.demographics?.age ?? null}
                patientDateOfBirth={
                  patientRecord?.dateOfBirth ??
                  patientChart?.demographics?.dateOfBirth ??
                  patientChart?.demographics?.dob ??
                  null
                }
                patientSex={patientRecord?.sex ?? patientChart?.demographics?.sex ?? null}
                disabled={isSigned}
              />
            )}

            {/* Inline Dental Chart Card (Adult & Child Odontogram) */}
            {isDentalEnabled && (
              <View onLayout={(e) => { sectionOffsets.current['dental-chart'] = e.nativeEvent.layout.y; }}>
                <InlineDentalChartCard
                  chart={dentalChart}
                  consultationId={signedConsultationId || undefined}
                  onChange={handleDentalChartChange}
                  disabled={isSigned}
                  onQuickOrderProcedure={handleQuickOrderDentalProcedure}
                />
              </View>
            )}

            {/* A - Assessment & ICD-10 */}
            <View onLayout={(e) => { sectionOffsets.current['primary-diagnosis'] = e.nativeEvent.layout.y; }}>
              <Card>
                <CardHeader
                  title="Assessment"
                  subtitle="Clinical impression and ICD-10 diagnoses"
                />

                <Input
                  placeholder="Primary impression"
                  accessibilityLabel="Assessment"
                  value={assessment}
                  onChangeText={setAssessment}
                  editable={!isSigned}
                />

                {selectedDiagnoses.length > 0 ? (
                  <View style={styles.chipsRow}>
                    {selectedDiagnoses.map((d) => (
                      <View key={d.icd10Code} style={styles.diagBadge}>
                        <ThemedText variant="smallBold" color={theme.colors.primaryDark}>
                          {d.icd10Code}
                        </ThemedText>
                        <ThemedText variant="small" color={theme.colors.primaryDark} numberOfLines={1} style={styles.diagDesc}>
                          {d.description}
                        </ThemedText>
                        {d.isPrimary ? <Badge label="Primary" variant="primary" size="sm" /> : null}
                        {!isSigned ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${d.icd10Code}`}
                            onPress={() => handleRemoveDiagnosis(d.icd10Code)}
                            hitSlop={theme.spacing.sm}
                          >
                            <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {!isSigned ? (
                  <View style={styles.stack}>
                    <Input
                      leftIcon="search"
                      placeholder="Search ICD-10 codes (e.g. I10, diabetes, cold)"
                      accessibilityLabel="Search ICD-10 codes"
                      value={icdQuery}
                      onChangeText={handleSearchIcd10}
                      onFocus={() => setShowIcdDropdown(true)}
                    />
                    {showIcdDropdown ? (
                      <View style={styles.icdDropdown}>
                        {icdNotice ? (
                          <ThemedText variant="caption" color={theme.colors.warningText} style={styles.icdNotice}>
                            {icdNotice}
                          </ThemedText>
                        ) : null}
                        {icdResults.length === 0 ? (
                          <ThemedText variant="small" color={theme.colors.textMuted} style={styles.icdNotice}>
                            {icdQuery.trim() ? 'No matching codes in the PhilHealth ICD-10 catalog.' : 'Type a code or a diagnosis to search the PhilHealth ICD-10 catalog.'}
                          </ThemedText>
                        ) : (
                          icdResults.map((item) => (
                            <Pressable key={item.code} style={styles.icdItem} onPress={() => handleAddDiagnosis(item)}>
                              <ThemedText variant="smallBold" color={theme.colors.primary} style={styles.icdItemCode}>
                                {item.code}
                              </ThemedText>
                              <ThemedText variant="small" style={styles.flex}>
                                {item.description}
                              </ThemedText>
                            </Pressable>
                          ))
                        )}
                        <View style={styles.icdFooter}>
                          <Button
                            title="Close suggestions"
                            variant="ghost"
                            size="sm"
                            onPress={() => setShowIcdDropdown(false)}
                          />
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            </View>

            {/* Diagnostic orders */}
            <Card>
              <CardHeader
                title={`Diagnostic orders (${orderedLabs.length})`}
                icon="lab"
                subtitle="Selected diagnostic and laboratory tests create a requisition when the encounter is signed"
                rightAction={
                  !isSigned ? (
                    <Button
                      title="Add test"
                      icon="plus"
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        setOrderSearchInitialCategory('Diagnostic');
                        setOrderSearchModalVisible(true);
                      }}
                      testID="consultation-add-lab-test-btn"
                    />
                  ) : null
                }
              />
              {catalogLoading && diagnosticCatalog.length === 0 ? (
                <SkeletonList rows={1} rowHeight={theme.sizes.controlMd} />
              ) : diagnosticCatalog.length === 0 ? (
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  No diagnostic tests are set up in the clinic fee schedule yet.
                </ThemedText>
              ) : (
                <View style={styles.quickAddSection}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Quick Add:
                  </ThemedText>
                  <View style={styles.chipsRow}>
                    {diagnosticCatalog.map((diag) => {
                      const isOrdered = orderedLabs.some((l) => l.name.toLowerCase() === diag.name.toLowerCase());
                      return (
                        <ToggleChip
                          key={diag.id}
                          tone="success"
                          label={`${diag.name} (₱${diag.standardPrice.toFixed(0)})`}
                          meta={isYakapEligible && diag.philHealthCode ? 'PhilHealth Covered' : undefined}
                          selected={isOrdered}
                          disabled={isSigned}
                          onPress={() => handleToggleLab(diag.name)}
                        />
                      );
                    })}
                  </View>
                </View>
              )}
              {/* Selected Lab Orders List */}
              {orderedLabs.length > 0 ? (
                <View style={styles.orderedListStack}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.orderedSectionTitle}>
                    ACTIVE DIAGNOSTIC TESTS ({orderedLabs.length})
                  </ThemedText>
                  {orderedLabs.map((lab) => {
                    const isInHouse = lab.fulfillmentMode === 'in_house';
                    const isYakapCopayFree = Boolean(isYakapEligible && lab.philHealthCode && isInHouse);
                    return (
                      <View key={lab.name} style={styles.activeOrderCard}>
                        <View style={styles.activeOrderMainCol}>
                          <View style={styles.activeOrderHeaderRow}>
                            <View style={styles.activeOrderTitleGroup}>
                              <Icon name="lab" size={theme.sizes.iconSm} color={theme.colors.primary} />
                              <ThemedText variant="bodyBold" color={theme.colors.text}>
                                {lab.name}
                              </ThemedText>
                              {lab.code ? <Badge label={lab.code} variant="neutral" size="sm" /> : null}
                            </View>
                            <View style={styles.activeOrderBadgesRow}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Fulfillment mode: ${isInHouse ? 'In-House' : 'Outside Lab'}. Click to toggle.`}
                                disabled={isSigned}
                                onPress={() => handleToggleLabFulfillmentMode(lab.name)}
                              >
                                <Badge
                                  label={isInHouse ? 'In-House' : 'Outside Lab'}
                                  variant={isInHouse ? 'success' : 'info'}
                                  size="sm"
                                />
                              </Pressable>
                              {isYakapCopayFree ? (
                                <Badge label="PhilHealth ₱0 Co-pay" variant="success" size="sm" />
                              ) : isInHouse && (lab.standardPrice ?? 0) > 0 ? (
                                <Badge label={`₱${(lab.standardPrice ?? 0).toLocaleString()}`} variant="neutral" size="sm" />
                              ) : null}
                            </View>
                          </View>
                          {/* Instructions callout */}
                          <View style={styles.instructionCalloutRow}>
                            <View style={styles.instructionCalloutLeft}>
                              <Icon name="file" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                              <ThemedText variant="caption" color={lab.instructions ? theme.colors.textSecondary : theme.colors.textMuted} style={styles.flexOne}>
                                {lab.instructions ? `Instructions: ${lab.instructions}` : 'No specific fasting or test preparation instructions specified.'}
                              </ThemedText>
                            </View>
                            {!isSigned ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                icon="edit"
                                title={lab.instructions ? 'Edit Notes' : '+ Add Notes'}
                                accessibilityLabel={`Edit instructions for ${lab.name}`}
                                onPress={() => handleOpenEditInstructions(lab, 'lab')}
                              />
                            ) : null}
                          </View>
                        </View>
                        {!isSigned ? (
                          <Button
                            variant="dangerGhost"
                            size="xs"
                            icon="close"
                            iconOnly
                            accessibilityLabel={`Remove ${lab.name}`}
                            onPress={() => handleRemoveLab(lab.name)}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {catalogError ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  The clinic's tests could not be loaded: {catalogError}
                </ThemedText>
              ) : null}
            </Card>

            {/* Laboratory results */}
            {renderLabResults()}

            {/* In-clinic procedures */}
            <Card>
              <CardHeader
                title={`In-clinic procedures (${orderedProcedures.length})`}
                icon="medical"
                subtitle="Orders go to the nurse station for immediate treatment"
                rightAction={
                  !isSigned ? (
                    <Button
                      title="Add procedure"
                      icon="plus"
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        setOrderSearchInitialCategory('Procedure');
                        setOrderSearchModalVisible(true);
                      }}
                      testID="consultation-add-procedure-btn"
                    />
                  ) : null
                }
              />
              {catalogLoading && procedureCatalog.length === 0 ? (
                <SkeletonList rows={1} rowHeight={theme.sizes.controlMd} />
              ) : catalogError && procedureCatalog.length === 0 ? (
                <ErrorState compact title="Unable to load procedures" message={catalogError} onRetry={loadCatalog} />
              ) : procedureCatalog.length === 0 ? (
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  No procedures are set up in the clinic fee schedule yet.
                </ThemedText>
              ) : (
                <View style={styles.quickAddSection}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Quick Add:
                  </ThemedText>
                  <View style={styles.chipsRow}>
                    {procedureCatalog.map((proc) => {
                      const isOrdered = orderedProcedures.some((p) => p.name.toLowerCase() === proc.name.toLowerCase());
                      return (
                        <ToggleChip
                          key={proc.id}
                          label={`${proc.name} (₱${proc.standardPrice.toFixed(0)})`}
                          selected={isOrdered}
                          disabled={isSigned}
                          onPress={() => handleToggleProcedure(proc.name)}
                        />
                      );
                    })}
                    {orderedProcedures
                      .filter((p) => !procedureCatalog.some((pc) => pc.name.toLowerCase() === p.name.toLowerCase()))
                      .map((proc) => (
                        <ToggleChip
                          key={proc.name}
                          label={proc.name}
                          selected={true}
                          disabled={isSigned}
                          onPress={() => handleToggleProcedure(proc.name)}
                        />
                      ))}
                  </View>
                </View>
              )}

              {/* Active Procedures Stack */}
              {orderedProcedures.length > 0 ? (
                <View style={styles.orderedListStack}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.orderedSectionTitle}>
                    ACTIVE PROCEDURES ({orderedProcedures.length})
                  </ThemedText>
                  {orderedProcedures.map((proc) => {
                    const isSent = proc.status === 'sent_to_room' || Boolean(proc.isHandedOff);
                    const availableRooms = treatmentRooms.length > 0 ? treatmentRooms : activeRooms;
                    const resolvedRoom =
                      (isSent
                        ? proc.sentToRoomName || proc.targetRoomName || proc.roomName
                        : proc.targetRoomName || proc.roomName) ||
                      (availableRooms.find((r) => r.id === (isSent ? (proc.sentToRoomId || proc.targetRoomId) : proc.targetRoomId)) ??
                        availableRooms.find((r) => r.id === selectedTreatmentRoomId) ??
                        availableRooms[0])?.name ||
                      'Treatment Room';
                    const procKey = proc.serviceItemId
                      ? `${proc.serviceItemId}-${proc.toothNumber ?? '0'}`
                      : `${proc.name}-${proc.toothNumber ?? '0'}-${proc.code ?? ''}`;

                    return (
                      <View key={procKey} style={styles.activeOrderCard}>
                        <View style={styles.activeOrderMainCol}>
                          <View style={styles.activeOrderHeaderRow}>
                            <View style={styles.activeOrderTitleGroup}>
                              <Icon name="medical" size={theme.sizes.iconSm} color={theme.colors.primary} />
                              <ThemedText variant="bodyBold" color={theme.colors.text}>
                                {proc.name}
                              </ThemedText>
                              {proc.code ? <Badge label={proc.code} variant="neutral" size="sm" /> : null}
                            </View>
                            <View style={styles.activeOrderBadgesRow}>
                              {proc.toothNumber ? (
                                <Badge
                                  label={`Tooth #${proc.toothNumber}${proc.toothSurface ? ` (${proc.toothSurface})` : ''}`}
                                  variant="info"
                                  size="sm"
                                />
                              ) : null}
                              {isSent ? (
                                <Badge
                                  label={`Sent to ${resolvedRoom} • ${proc.sentAt || proc.handedOffAt || 'Sent'}`}
                                  variant="success"
                                  icon="checkCircle"
                                  size="sm"
                                />
                              ) : (
                                <Badge
                                  label={`Draft • Room: ${resolvedRoom}`}
                                  variant="warning"
                                  size="sm"
                                />
                              )}
                              {(proc.standardPrice ?? 0) > 0 ? (
                                <Badge label={`₱${(proc.standardPrice ?? 0).toLocaleString()}`} variant="neutral" size="sm" />
                              ) : null}
                            </View>
                          </View>

                          {/* Inline Room Switcher (Draft State when multiple rooms exist) */}
                          {!isSigned && !isSent && availableRooms.length > 1 ? (
                            <View style={styles.inlineRoomSwitcherRow}>
                              <ThemedText variant="caption" color={theme.colors.textMuted}>
                                Target Room:
                              </ThemedText>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.roomChipsRow}
                              >
                                {availableRooms.map((tr) => {
                                  const isCurrentRoom = (proc.targetRoomId ? proc.targetRoomId === tr.id : tr.id === selectedTreatmentRoomId);
                                  return (
                                    <Pressable
                                      key={tr.id}
                                      style={[
                                        styles.roomPill,
                                        isCurrentRoom && styles.roomPillActive,
                                      ]}
                                      onPress={() => {
                                        setOrderedProcedures((prev) =>
                                          prev.map((item) =>
                                            item === proc
                                              ? {
                                                  ...item,
                                                  targetRoomId: tr.id,
                                                  targetRoomName: tr.name,
                                                  roomId: tr.id,
                                                  roomName: tr.name,
                                                }
                                              : item
                                          )
                                        );
                                      }}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Assign ${proc.name} to ${tr.name}`}
                                      accessibilityState={{ selected: isCurrentRoom }}
                                      testID={`procedure-room-option-${tr.id}-${procKey}`}
                                    >
                                      <ThemedText
                                        variant="captionBold"
                                        color={isCurrentRoom ? theme.colors.primaryDark : theme.colors.textSecondary}
                                      >
                                        {tr.name}
                                      </ThemedText>
                                    </Pressable>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          ) : null}

                          {/* Instructions callout and per-procedure send */}
                          <View style={styles.procedureCardActionsRow}>
                            <View style={styles.instructionCalloutRow}>
                              <View style={styles.instructionCalloutLeft}>
                                <Icon name="file" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                                <ThemedText variant="caption" color={proc.instructions ? theme.colors.textSecondary : theme.colors.textMuted} style={styles.flexOne}>
                                  {proc.instructions ? `Instructions: ${proc.instructions}` : 'No procedure instructions or site details entered.'}
                                </ThemedText>
                              </View>
                              {!isSigned ? (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  icon="edit"
                                  title={proc.instructions ? 'Edit Notes' : 'Add Notes'}
                                  accessibilityLabel={`Edit instructions for ${proc.name}`}
                                  onPress={() => handleOpenEditInstructions(proc, 'procedure')}
                                />
                              ) : null}
                            </View>
                            {!isSigned && !isSent ? (
                              <Button
                                title={`Send to ${resolvedRoom}`}
                                icon="syringe"
                                variant="primary"
                                size="sm"
                                disabled={isHandoffSending}
                                onPress={() => handleHandoffToTreatmentRoom(proc.name, proc.toothNumber)}
                                testID={`send-procedure-${procKey}`}
                              />
                            ) : null}
                          </View>
                        </View>
                        {!isSigned ? (
                          <Button
                            variant="dangerGhost"
                            size="xs"
                            icon="close"
                            iconOnly
                            accessibilityLabel={`Remove ${proc.name}`}
                            onPress={() => handleRemoveProcedure(proc.name, proc.toothNumber)}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {/* Nurse Handoff Routing */}
              {orderedProcedures.length > 0 && !isSigned ? (
                <View style={styles.procedureHandoffCard}>
                  <View style={styles.procedureHandoffHeader}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      NURSE HANDOFF ROUTING
                    </ThemedText>
                    {treatmentRooms.length > 1 ? (
                      <View style={styles.chipsRow}>
                        {treatmentRooms.map((tr) => (
                          <ToggleChip
                            key={tr.id}
                            label={tr.name}
                            selected={selectedTreatmentRoomId === tr.id}
                            onPress={() => setSelectedTreatmentRoomId(tr.id)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                  {(() => {
                    const unhandedOff = orderedProcedures.filter((p) => !p.isHandedOff && p.status !== 'sent_to_room');
                    const targetRoomName =
                      (treatmentRooms.find((r) => r.id === selectedTreatmentRoomId) ?? treatmentRooms[0])?.name ||
                      'Treatment Room';
                    const allHandedOff = unhandedOff.length === 0;

                    return (
                      <View style={styles.procedureHandoffActionRow}>
                        <Button
                          title={
                            allHandedOff
                              ? 'All Procedures Handed Off'
                              : `Send Draft Procedures to Room (${unhandedOff.length})`
                          }
                          variant={allHandedOff ? 'secondary' : 'primary'}
                          icon={allHandedOff ? 'check' : 'syringe'}
                          size="md"
                          disabled={allHandedOff || isHandoffSending}
                          loading={isHandoffSending}
                          onPress={handleHandoffAllProcedures}
                          testID="consultation-batch-handoff-btn"
                        />
                      </View>
                    );
                  })()}
                </View>
              ) : null}
            </Card>

            {/* P - Plan / Plan Management */}
            <Card>
              <CardHeader
                title={isYakapEligible ? 'Plan Management' : 'Plan'}
                subtitle={
                  isYakapEligible
                    ? 'Counseling, routine screenings, care orders, medical advice, and follow-up schedule'
                    : 'Clinical treatment, diagnostic ordering rationale, and physician notes'
                }
              />
              {isYakapEligible ? (
                <View style={styles.planManagementStack}>
                  <PlanManagementCard
                    embedded
                    value={planManagement}
                    onChange={setPlanManagement}
                    disabled={isSigned}
                    patientAgeYears={patientRecord?.age ?? patientChart?.demographics?.age ?? null}
                    patientSex={patientRecord?.sex ?? patientChart?.demographics?.sex ?? null}
                    orderedLabsCount={orderedLabs.length}
                    completedLabResultsCount={
                      labOrders.filter(
                        (o) => o.status === 'Completed' || o.status === 'CompletedWithExternalReport'
                      ).length
                    }
                    prescriptionsCount={prescriptions.length}
                    hasIssuedReferral={Boolean(issuedReferral)}
                    onOpenOrderDiagnostics={() => {
                      setOrderSearchInitialCategory('Diagnostic');
                      setOrderSearchModalVisible(true);
                    }}
                    onOpenAddMedication={() => {
                      setShowAddRx(true);
                      handleJumpToSection('medicines');
                    }}
                    onOpenIssueReferral={handleOpenIssueReferral}
                  />
                  <View style={styles.planNotesDivider}>
                    <Input
                      label="Clinical treatment notes"
                      multiline
                      placeholder="Treatment plan, requested tests, dietary advice"
                      accessibilityLabel="Plan"
                      value={plan}
                      onChangeText={setPlan}
                      editable={!isSigned}
                      inputStyle={styles.textArea}
                    />
                  </View>
                </View>
              ) : (
                <Input
                  multiline
                  placeholder="Treatment plan, requested tests, dietary advice"
                  accessibilityLabel="Plan"
                  value={plan}
                  onChangeText={setPlan}
                  editable={!isSigned}
                  inputStyle={styles.textArea}
                />
              )}
            </Card>

            {/* Electronic prescriptions */}
            <View onLayout={(e) => { sectionOffsets.current['medicines'] = e.nativeEvent.layout.y; }}>
              <Card>
                <CardHeader
                title={`Electronic prescriptions (${prescriptions.length})`}
                icon="pill"
                rightAction={
                  <View style={styles.rowWrap}>
                    {prescriptions.length > 0 ? (
                      <Button
                        title={isSigned ? 'View e-prescription' : 'Preview draft slip'}
                        icon="file"
                        variant="outline"
                        size="sm"
                        loading={loadingSlip}
                        onPress={handleOpenPrescriptionSlip}
                      />
                    ) : null}
                    {!isSigned ? (
                      <Button
                        title="Add medication"
                        icon="plus"
                        variant="secondary"
                        size="sm"
                        onPress={() => setShowAddRx(!showAddRx)}
                      />
                    ) : null}
                  </View>
                }
              />

              {showAddRx ? (
                <View style={styles.rxForm}>
                  <ThemedText variant="h3">New medication order</ThemedText>

                  {isYakapEligible ? (
                    <View style={styles.stack}>
                      <Input
                        leftIcon="search"
                        label="PhilHealth medicine"
                        placeholder="Search the PhilHealth medicine catalog (e.g. amlodipine)"
                        value={rxCatalogQuery}
                        onChangeText={setRxCatalogQuery}
                      />
                      {rxCatalogSearch.error ? (
                        <ThemedText variant="caption" color={theme.colors.warningText}>
                          The PhilHealth catalog is unreachable. You can still type the medicine below.
                        </ThemedText>
                      ) : null}
                      {rxCatalogSearch.results.length > 0 ? (
                        <View style={styles.icdDropdown}>
                          {rxCatalogSearch.results.map((item) => (
                            <Pressable key={item.code} style={styles.icdItem} onPress={() => handleSelectPhilHealthMedicine(item)}>
                              <ThemedText variant="small" style={styles.flex}>
                                {item.description}
                              </ThemedText>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      {newRxDrugCode ? (
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          PhilHealth formulary item selected
                        </ThemedText>
                      ) : null}
                    </View>
                  ) : null}
                  {medicineCatalog.length > 0 ? (
                    <View style={styles.stack}>
                      <ThemedText variant="small" color={theme.colors.textMuted}>
                        Clinic formulary and fee schedule
                      </ThemedText>
                      <View style={styles.chipsRow}>
                        {medicineCatalog.map((item) => (
                          <ToggleChip
                            key={item.id}
                            tone="success"
                            label={`${item.name} (₱${item.standardPrice.toFixed(0)})`}
                            selected={
                              selectedCatalogMedId === item.id ||
                              newRxGeneric.toLowerCase() === item.name.toLowerCase() ||
                              Boolean(item.philHealthCode && newRxDrugCode === item.philHealthCode)
                            }
                            onPress={() => handleSelectCatalogMedicine(item)}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  <Input
                    label="Generic name"
                    placeholder="e.g. Paracetamol, Amoxicillin"
                    value={newRxGeneric}
                    onChangeText={setNewRxGeneric}
                  />
                  <View style={styles.fieldRow}>
                    <Input
                      label="Dosage"
                      placeholder="e.g. 500mg"
                      value={newRxDosage}
                      onChangeText={setNewRxDosage}
                      containerStyle={styles.fieldGrow}
                    />
                    <Input
                      label="Quantity"
                      placeholder="e.g. 30"
                      keyboardType="numeric"
                      value={newRxQuantity}
                      onChangeText={setNewRxQuantity}
                      containerStyle={styles.fieldNarrow}
                    />
                    <Input
                      label="Dispense (pcs)"
                      labelTooltip="Optional starter pieces handed out directly from clinic stock during this consultation (must not exceed Quantity). Leave blank or 0 if filled externally; clinic-dispensed pieces are logged to the Clinic Dispensing Ledger upon encounter sign-off without requiring pharmacy inventory."
                      labelTooltipAlign="right"
                      placeholder="0"
                      keyboardType="numeric"
                      value={newRxClinicDispensedQty}
                      onChangeText={setNewRxClinicDispensedQty}
                      error={validateRxClinicDispensedQuantity(newRxQuantity, newRxClinicDispensedQty) ?? undefined}
                      containerStyle={styles.fieldDispense}
                    />
                  </View>
                  <Input
                    label="Directions (sig)"
                    placeholder="e.g. 1 tab TID after meals for 7 days"
                    value={newRxSig}
                    onChangeText={setNewRxSig}
                  />
                  <CheckRow
                    checked={newRxDangerous}
                    onPress={() => setNewRxDangerous(!newRxDangerous)}
                    label="Dangerous drug (PDEA S2 regulated, requires an S2 license)"
                  />
                  <View style={styles.actionRow}>
                    <Button title="Cancel" variant="outline" size="sm" onPress={() => setShowAddRx(false)} />
                    <Button title="Add prescription" size="sm" onPress={handleAddPrescription} />
                  </View>
                </View>
              ) : null}

              {prescriptions.length === 0 && !showAddRx ? (
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  No medications prescribed yet.
                </ThemedText>
              ) : null}

              {prescriptions.length > 0 ? (
                <View style={styles.stack}>
                  {prescriptions.map((rx) => (
                    <View key={rx.id} style={styles.rxCard} testID="rx-medication-item">
                      <View style={styles.flex}>
                        <ThemedText variant="bodyBold">
                          {rx.genericName}{' '}
                          <ThemedText variant="body" color={theme.colors.textSecondary}>
                            {rx.dosage}
                          </ThemedText>
                        </ThemedText>
                        <ThemedText variant="small" color={theme.colors.textSecondary}>
                          Sig: {rx.sig}
                        </ThemedText>
                        <ThemedText variant="small" color={theme.colors.textMuted}>
                          Dispense: #{rx.quantity} {formatDispenseFormLabel(rx.form, rx.quantity)}
                        </ThemedText>
                        <View style={styles.rowWrap}>
                          {!isSigned ? (
                            <Badge label="Draft" variant="warning" size="sm" icon="clock" />
                          ) : null}
                          <Badge
                            label={`ROS: ${getRosShortLabel(rx.rosCategory || rosCategory)}`}
                            variant="neutral"
                            size="sm"
                          />
                          {(rx.clinicDispensedQuantity ?? 0) > 0 ? (
                            <Badge
                              label={
                                isSigned
                                  ? `Clinic stock dispensed: ${rx.clinicDispensedQuantity} of ${rx.quantity} pcs`
                                  : `Clinic stock (on sign-off): ${rx.clinicDispensedQuantity} of ${rx.quantity} pcs`
                              }
                              variant={isSigned ? 'success' : 'warning'}
                              size="sm"
                              icon="pill"
                            />
                          ) : null}
                          {rx.philHealthDrugCode ? (
                            <Badge label="PhilHealth Formulary" variant="info" size="sm" />
                          ) : null}
                          {rx.isDangerousDrug ? <Badge label="PDEA S2 dangerous drug" variant="emergency" size="sm" /> : null}
                        </View>
                      </View>
                      {!isSigned ? (
                        <Button
                          variant="dangerGhost"
                          size="xs"
                          icon="close"
                          iconOnly
                          accessibilityLabel={`Remove ${rx.genericName}`}
                          onPress={() => handleRemovePrescription(rx.id)}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Clinical decision support */}
              {prescriptions.length > 0 ? (
                <Card variant="subtle">
                  <View style={styles.rowBetween}>
                    <View style={styles.row}>
                      <Icon name="shield" size={theme.sizes.iconMd} color={theme.colors.primary} />
                      <ThemedText variant="h3">Drug safety checks</ThemedText>
                    </View>
                    {evaluatingCds ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Button
                        title="Re-screen"
                        icon="refresh"
                        variant="ghost"
                        size="sm"
                        onPress={() => runCdsScreening(prescriptions)}
                      />
                    )}
                  </View>

                  {cdsUsedLocalRules ? (
                    <ThemedText variant="caption" color={theme.colors.warningText}>
                      The server safety check is unavailable, so only basic checks on this device were applied.
                    </ThemedText>
                  ) : null}

                  {cdsAlerts.length === 0 && !evaluatingCds ? (
                    <View style={styles.cdsPassed}>
                      <Icon name="checkCircle" size={theme.sizes.iconMd} color={theme.colors.success} />
                      <ThemedText variant="small" color={theme.colors.successText} style={styles.flex}>
                        No drug-allergy conflicts, harmful interactions or organ-dosing warnings were found.
                      </ThemedText>
                    </View>
                  ) : (
                    <View style={styles.stack}>
                      {cdsAlerts.map((alert, index) => {
                        const tone = severityTone(alert.severity);
                        const category = alert.category || alert.type;
                        const message = alert.message || alert.title;
                        const recommendation = alert.clinicalRecommendation || alert.recommendation;
                        return (
                          <View
                            key={alert.ruleId || alert.alertId || `cds-${index}`}
                            style={[styles.cdsAlert, { backgroundColor: tone.bg, borderColor: tone.border }]}
                          >
                            <View style={styles.rowBetween}>
                              <View style={[styles.row, styles.flex]}>
                                <Badge label={alert.severity} variant={tone.variant} size="sm" />
                                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                                  {humanize(category)}
                                </ThemedText>
                              </View>
                              <ThemedText variant="smallBold">{alert.offendingDrug}</ThemedText>
                            </View>
                            <ThemedText variant="body">{message}</ThemedText>
                            {recommendation ? (
                              <ThemedText variant="small" color={theme.colors.textSecondary}>
                                Recommendation: {recommendation}
                              </ThemedText>
                            ) : null}
                          </View>
                        );
                      })}

                      {hasCriticalCdsAlert ? (
                        <View style={styles.overrideBox}>
                          <ThemedText variant="h3" color={theme.colors.emergencyText}>
                            Clinical override required to prescribe
                          </ThemedText>
                          <ThemedText variant="small" color={theme.colors.textSecondary}>
                            A severe contraindication was flagged. Document your justification to continue:
                          </ThemedText>
                          <Input
                            multiline
                            placeholder="Clinical rationale (e.g. desensitization protocol, no alternative available, monitored)"
                            accessibilityLabel="Override justification"
                            value={cdsOverrideReason}
                            onChangeText={setCdsOverrideReason}
                            editable={!isSigned}
                          />
                          <CheckRow
                            checked={overrideConfirmed}
                            disabled={isSigned}
                            onPress={() => setOverrideConfirmed(!overrideConfirmed)}
                            label="I certify that the clinical benefit outweighs the severe risk and I have counseled the patient."
                          />
                        </View>
                      ) : null}
                    </View>
                  )}
                </Card>
              ) : null}
            </Card>
            </View>

            {/* Patient-Facing Home Instructions */}
            <View onLayout={(e) => { sectionOffsets.current['home-instructions'] = e.nativeEvent.layout.y; }}>
              <Card style={styles.homeInstructionsCard}>
                <CardHeader
                  title="Home Instructions"
                  subtitle="Patient-facing guidance, precautions, rest, and discharge instructions"
                  icon="file"
                  rightAction={<Badge label="Visible to Patient" variant="success" size="sm" />}
                />
                <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.xs }}>
                  These instructions will be displayed directly in the patient&apos;s portal/app and printed on their visit summary.
                </ThemedText>

                {/* Quick Instruction Presets */}
                {!isSigned ? (
                  <View style={styles.presetsSection}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ marginBottom: 4 }}>
                      Quick presets:
                    </ThemedText>
                    <View style={styles.chipsRow}>
                      {HOME_INSTRUCTION_PRESETS.map((preset) => {
                        const isActive = homeInstructions.includes(preset.text);
                        return (
                          <Pressable
                            key={preset.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isActive }}
                            accessibilityLabel={`${preset.label} preset`}
                            style={({ pressed }) => [
                              styles.presetChip,
                              isActive && styles.presetChipActive,
                              pressed && styles.pressed,
                            ]}
                            onPress={() => {
                              setHomeInstructions((prev) => toggleHomeInstructionPreset(prev, preset.text));
                            }}
                          >
                            <Icon
                              name={isActive ? 'check' : 'plus'}
                              size={theme.sizes.iconSm}
                              color={isActive ? theme.colors.onPrimary : theme.colors.primaryDark}
                            />
                            <ThemedText
                              variant="smallBold"
                              color={isActive ? theme.colors.onPrimary : theme.colors.primaryDark}
                              style={styles.presetChipText}
                            >
                              {preset.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <Input
                  multiline
                  placeholder="Specific instructions for home care, red flag warnings, activity limits, return schedule..."
                  accessibilityLabel="Home Instructions"
                  value={homeInstructions}
                  onChangeText={setHomeInstructions}
                  editable={!isSigned}
                  inputStyle={styles.textArea}
                />
              </Card>
            </View>

            {/* Attending physician credentials (Feature 18) */}
            <View onLayout={(e) => { sectionOffsets.current['doctor-pan'] = sectionOffsets.current['doctor-prc'] = sectionOffsets.current['doctor-s2'] = e.nativeEvent.layout.y; }}>
            <Card>
              <CardHeader
                title="Attending physician"
                icon="patientVerified"
                subtitle={
                  signerName
                    ? `Signing as ${signerName}`
                    : "Choose 'Working as' in the sidebar or header to sign and issue documents"
                }
                rightAction={!signerName ? <Badge label="No one selected" variant="warning" /> : undefined}
              />
              <View style={styles.fieldRow}>
                <Input
                  label="PRC license #"
                  value={doctorPrc}
                  onChangeText={setDoctorPrc}
                  editable={!isSigned}
                  containerStyle={styles.fieldGrow}
                  helperText={doctorPrc.trim() || signerStaff?.prcLicenseNumber?.trim() ? 'PRC [Verified]' : 'PRC [Missing]'}
                />
                <Input
                  label="PTR #"
                  value={doctorPtr}
                  onChangeText={setDoctorPtr}
                  editable={!isSigned}
                  containerStyle={styles.fieldGrow}
                  helperText={doctorPtr.trim() || signerStaff?.ptrNumber?.trim() ? 'PTR [Recorded]' : 'PTR [Optional]'}
                />
                <Input
                  label="PDEA S2 license #"
                  value={doctorS2}
                  onChangeText={setDoctorS2}
                  editable={!isSigned}
                  containerStyle={styles.fieldGrow}
                  helperText={doctorS2.trim() || signerStaff?.s2LicenseNumber?.trim() ? 'S2 [Active]' : 'S2 [Needed for PDEA]'}
                />
                <Input
                  label="PhilHealth PAN"
                  value={doctorPan}
                  onChangeText={setDoctorPan}
                  editable={!isSigned}
                  containerStyle={styles.fieldGrow}
                  placeholder="Doctor PAN"
                  helperText={doctorPan.trim() || signerStaff?.philHealthPan?.trim() ? 'PAN [Verified]' : 'PAN [Missing]'}
                />
              </View>
              {signerStaff && !isSigned && (
                <View style={styles.updateProfileRow}>
                  <Button
                    title="Save to My Staff Profile"
                    variant="ghost"
                    size="sm"
                    icon="save"
                    onPress={async () => {
                      await clinicService.updateMyProfile({
                        firstName: signerStaff.firstName,
                        lastName: signerStaff.lastName,
                        middleName: signerStaff.middleName,
                        title: signerStaff.title,
                        phoneNumber: signerStaff.phoneNumber,
                        specialty: signerStaff.specialty,
                        prcLicenseNumber: doctorPrc,
                        ptrNumber: doctorPtr,
                        s2LicenseNumber: doctorS2,
                        philHealthPan: doctorPan,
                      });
                      await reloadStaff();
                      notify.success('Updated credentials in your staff profile.');
                    }}
                  />
                </View>
              )}
            </Card>
            </View>

            {/* Clinical documents */}
            <Card>
              <CardHeader
                title="Clinical documents"
                icon="file"
                subtitle="Issue medical certificates and referral letters under your PRC and PTR numbers"
              />
              <View style={styles.actionRow}>
                <Button
                  title={
                    !isSigned && issuedMedCert
                      ? 'Edit draft medical certificate'
                      : 'Issue medical certificate'
                  }
                  icon="file"
                  variant="outline"
                  onPress={() => setMedCertModalVisible(true)}
                />
                <Button
                  title={
                    !isSigned && issuedReferral
                      ? 'Edit draft referral letter'
                      : 'Issue referral letter'
                  }
                  icon="file"
                  variant="outline"
                  onPress={handleOpenIssueReferral}
                />
              </View>

              {issuedMedCert ? (
                <View
                  style={[
                    styles.issuedRow,
                    isMedCertDraft ? styles.issuedRowDraft : styles.issuedRowSuccess,
                  ]}
                  testID="issued-med-cert-row"
                >
                  <View style={styles.flex}>
                    <View style={styles.rowWrap}>
                      <ThemedText
                        variant="bodyBold"
                        color={isMedCertDraft ? theme.colors.warningText : theme.colors.successText}
                      >
                        Medical certificate {issuedMedCert.certificateNumber}
                      </ThemedText>
                      {isMedCertDraft ? (
                        <>
                          <Badge label="Draft" variant="warning" size="sm" icon="clock" />
                          <Badge label="Pending encounter sign-off" variant="neutral" size="sm" />
                        </>
                      ) : (
                        <Badge label="Signed" variant="success" size="sm" icon="check" />
                      )}
                    </View>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      {humanize(issuedMedCert.fitnessStatus)}
                      {issuedMedCert.recommendedRestDays ? ` • ${issuedMedCert.recommendedRestDays} day(s) rest` : ''}
                      {isMedCertDraft ? ' • Remains draft until encounter is signed' : ''}
                    </ThemedText>
                  </View>
                  <Button
                    title={isMedCertDraft ? 'Preview draft' : 'View / print'}
                    icon={isMedCertDraft ? 'file' : 'print'}
                    variant={isMedCertDraft ? 'outline' : 'success'}
                    size="sm"
                    onPress={() => {
                      setPreviewType('MEDCERT');
                      setPreviewDocModal(true);
                    }}
                  />
                </View>
              ) : null}

              {issuedReferral ? (
                <View
                  style={[
                    styles.issuedRow,
                    isReferralDraft ? styles.issuedRowDraft : styles.issuedRowPrimary,
                  ]}
                  testID="issued-referral-row"
                >
                  <View style={styles.flex}>
                    <View style={styles.rowWrap}>
                      <ThemedText
                        variant="bodyBold"
                        color={isReferralDraft ? theme.colors.warningText : theme.colors.primaryDark}
                      >
                        Referral {issuedReferral.referralNumber}
                      </ThemedText>
                      {isReferralDraft ? (
                        <>
                          <Badge label="Draft" variant="warning" size="sm" icon="clock" />
                          <Badge label="Pending encounter sign-off" variant="neutral" size="sm" />
                        </>
                      ) : (
                        <Badge label="Signed" variant="success" size="sm" icon="check" />
                      )}
                    </View>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      To {issuedReferral.referredToFacility} ({issuedReferral.referredDepartment}) •{' '}
                      {issuedReferral.urgency}
                      {isReferralDraft ? ' • Remains draft until encounter is signed' : ''}
                    </ThemedText>
                  </View>
                  <Button
                    title={isReferralDraft ? 'Preview draft' : 'View / print'}
                    icon={isReferralDraft ? 'file' : 'print'}
                    variant={isReferralDraft ? 'outline' : 'primary'}
                    size="sm"
                    onPress={() => {
                      setPreviewType('REFERRAL');
                      setPreviewDocModal(true);
                    }}
                  />
                </View>
              ) : null}
            </Card>

            {/* PhilHealth Yakap Claim Readiness Card (Feature 17) */}
            {isYakapEligible ? (
              <YakapClaimReadinessCard
                serverReadiness={serverReadiness}
                localEvaluation={localEvaluation}
                isValidating={isValidatingReadiness}
                consultationId={signedConsultationId}
                onJumpToSection={handleJumpToSection}
                onRevalidate={loadYakapReadiness}
              />
            ) : null}

            {/* Signing */}
            {isSigned ? (
              <Card style={styles.signedCard}>
                <View style={styles.row}>
                  <Icon name="checkCircle" size={theme.sizes.iconLg} color={theme.colors.success} />
                  <View style={styles.flex}>
                    <ThemedText variant="h3" color={theme.colors.successText}>
                      Encounter signed and locked
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Signed by {signerName}
                      {doctorPrc ? ` (PRC ${doctorPrc})` : ''}
                      {signedAt ? ` at ${signedAt}` : ''}.
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  {prescriptions.length > 0 ? (
                    <>
                      <Button
                        title="View e-prescription"
                        icon="file"
                        loading={loadingSlip}
                        onPress={handleOpenPrescriptionSlip}
                      />
                      <Button
                        title="Record external dispense"
                        icon="pill"
                        variant="outline"
                        onPress={() => setExternalDispenseModalVisible(true)}
                      />
                    </>
                  ) : null}
                  <Button
                    title="Start follow-up encounter"
                    icon="plus"
                    variant="outline"
                    onPress={handleStartFollowUpEncounter}
                  />
                </View>
              </Card>
            ) : (
              <View style={styles.stack}>
                {draftSaveStatus !== 'idle' ? (
                  draftSaveStatus === 'error' ? (
                    <Pressable
                      onPress={handleRetryDraftSave}
                      style={[styles.preSignDraftStatusRow, styles.preSignDraftStatusError]}
                      testID="pre-sign-draft-status-indicator"
                      accessibilityRole="button"
                      accessibilityLabel="Retry saving consultation draft"
                    >
                      <Icon
                        name="alertCircle"
                        size={theme.sizes.iconSm}
                        color={theme.colors.emergency}
                      />
                      <ThemedText variant="caption" color={theme.colors.emergencyText}>
                        Draft save failed · Tap to retry
                      </ThemedText>
                    </Pressable>
                  ) : (
                    <View
                      style={[
                        styles.preSignDraftStatusRow,
                        draftSaveStatus === 'saving'
                          ? styles.preSignDraftStatusSaving
                          : styles.preSignDraftStatusSaved,
                      ]}
                      testID="pre-sign-draft-status-indicator"
                      accessibilityLiveRegion="polite"
                    >
                      <Icon
                        name={draftSaveStatus === 'saving' ? 'clock' : 'checkCircle'}
                        size={theme.sizes.iconSm}
                        color={
                          draftSaveStatus === 'saving'
                            ? theme.colors.textSecondary
                            : theme.colors.success
                        }
                      />
                      <ThemedText
                        variant="caption"
                        color={
                          draftSaveStatus === 'saving'
                            ? theme.colors.textSecondary
                            : theme.colors.successText
                        }
                      >
                        {draftSaveStatus === 'saving'
                          ? 'Saving draft...'
                          : draftSavedAtLabel
                            ? `Saved as draft · ${draftSavedAtLabel}`
                            : 'Saved as draft'}
                      </ThemedText>
                    </View>
                  )
                ) : null}
                <Button
                  title={
                    hasPendingInClinicProcedures
                      ? `Signing locked (${pendingProcedureReason ?? 'In Procedure Bay'})`
                      : isYakapEligible && !isYakapReady
                      ? `Signing locked (${(serverReadiness || localEvaluation).missingFields.length} requirements pending)`
                      : 'Sign & sync encounter'
                  }
                  icon={hasPendingInClinicProcedures || (isYakapEligible && !isYakapReady) ? 'lock' : 'check'}
                  size="lg"
                  variant={hasPendingInClinicProcedures || (isYakapEligible && !isYakapReady) ? 'outline' : 'primary'}
                  loading={isSigning}
                  disabled={isSigning || isAbandoningDraft || hasPendingInClinicProcedures || (isYakapEligible && !isYakapReady)}
                  onPress={handleInitiateSignAndReviewChargeSlip}
                />
                {signedConsultationId ||
                prescriptions.length > 0 ||
                orderedLabs.length > 0 ||
                orderedProcedures.length > 0 ||
                selectedDiagnoses.length > 0 ||
                Boolean(issuedMedCert) ||
                Boolean(issuedReferral) ||
                Boolean(subjective.trim()) ||
                Boolean(assessment.trim()) ? (
                  <Button
                    title="Discard unsigned draft"
                    icon="trash"
                    size="sm"
                    variant="dangerOutline"
                    loading={isAbandoningDraft}
                    disabled={isSigning || isAbandoningDraft}
                    onPress={handleAbandonUnsignedEncounter}
                  />
                ) : null}
              </View>
            )}
    </View>
  );

  const activeSpineProblems = useMemo(() => {
    const baseProblems = (patientChart?.problems || []).filter((p) => p.status === 'Active');
    if (selectedDiagnoses.length === 0) {
      return patientChart?.problems ?? null;
    }
    const seenCodes = new Set(
      baseProblems.map((p) => (p.icd10Code || '').trim().toUpperCase()).filter(Boolean)
    );
    const liveAdditions = selectedDiagnoses
      .filter((d) => {
        const code = (d.icd10Code || '').trim().toUpperCase();
        if (!code || seenCodes.has(code)) return false;
        seenCodes.add(code);
        return true;
      })
      .map((d, idx) => ({
        id: `live-dx-${d.icd10Code}-${idx}`,
        clinicId: selectedPatient?.clinicId || '',
        patientId: selectedPatient?.patientId || '',
        icd10Code: d.icd10Code,
        problemTitle: d.description,
        status: 'Active' as const,
        severity: 'Moderate' as const,
        isChronicNcd: false,
        recordedByDoctorId: signer?.id || '',
        recordedByDoctorName: signerStaff ? formatStaffName(signerStaff) : signer?.name || '',
        createdAt: '',
      }));
    return [...baseProblems, ...liveAdditions];
  }, [
    patientChart?.problems,
    selectedDiagnoses,
    selectedPatient?.clinicId,
    selectedPatient?.patientId,
    signer?.id,
    signer?.name,
    signerStaff,
  ]);

  const activeSpinePrescriptions = useMemo(() => {
    const historicalConsultations = patientChart?.consultations || [];
    const priorEncounter = historicalConsultations.find(
      (c) =>
        (!signedConsultationId || c.id !== signedConsultationId) &&
        (!selectedPatient?.id || c.queueItemId !== selectedPatient.id)
    );
    const historicalRx = priorEncounter?.prescriptions || [];
    if (prescriptions.length === 0 && !signedConsultationId) {
      return historicalConsultations[0]?.prescriptions || [];
    }
    const combined: any[] = [...prescriptions];
    const seenKeys = new Set(
      prescriptions.map(
        (rx) => `${(rx.genericName || '').trim().toLowerCase()}|${(rx.dosage || '').trim().toLowerCase()}`
      )
    );
    for (const hRx of historicalRx) {
      const key = `${(hRx.genericName || '').trim().toLowerCase()}|${(hRx.dosage || '').trim().toLowerCase()}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        combined.push(hRx);
      }
    }
    return combined;
  }, [prescriptions, patientChart?.consultations, signedConsultationId, selectedPatient?.id]);

  return (
    <ResponsiveLayout headerTitle="Consultations">
      <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Patient queue */}
        <View style={styles.queueSection}>
          {/* Queue View Fast Filters & Actions */}
          <View style={styles.queueToolbarRow}>
            <SegmentedControl
              value={queueViewFilter}
              onChange={handleQueueViewFilterChange}
              style={styles.queueSegmentedScroll}
              options={[
                { value: 'WaitingForDoctor', label: 'Waiting for Doctor' },
                { value: 'MyRoom', label: 'My Room' },
                { value: 'PendingProcedure', label: 'Pending Procedure' },
                { value: 'Completed', label: 'Completed' },
                { value: 'All', label: 'All Queue' },
              ]}
            />
            <View style={styles.queueHeaderActions}>
              <Button
                title={
                  nextEligiblePatient
                    ? (isDesktopWorkstation ? `Call next (${nextEligiblePatient.queueNumber})` : `Call ${nextEligiblePatient.queueNumber}`)
                    : (isDesktopWorkstation ? 'Call next patient' : 'Call next')
                }
                icon="bell"
                variant="primary"
                size="sm"
                disabled={!nextEligiblePatient || isCallingNext}
                loading={isCallingNext}
                onPress={() => handleOpenCallModal()}
              />
              <Button
                icon="refresh"
                iconOnly
                accessibilityLabel="Refresh queue"
                variant="ghost"
                size="sm"
                loading={queueLoading}
                onPress={loadQueue}
              />
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stationFilterScroll}>
            <Pressable
              accessibilityRole="button"
              onPress={() => handleStationFilterChange('ALL')}
              style={[
                styles.stationFilterPill,
                selectedStationFilter === 'ALL' && styles.stationFilterPillActive,
              ]}
            >
              <ThemedText
                variant="captionBold"
                color={selectedStationFilter === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                {allPillLabel}
              </ThemedText>
            </Pressable>
            {visibleRooms.map((room) => {
              const isSelected = selectedStationFilter === room.name;
              const isMyAssignedRoom = (current?.assignedRoomIds?.includes(room.id)) || current?.assignedRoomId === room.id;
              return (
                <Pressable
                  key={room.id}
                  accessibilityRole="button"
                  onPress={() => handleStationFilterChange(room.name)}
                  style={[
                    styles.stationFilterPill,
                    isSelected && styles.stationFilterPillActive,
                  ]}
                >
                  <ThemedText
                    variant="captionBold"
                    color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                  >
                    {isMyAssignedRoom ? `${room.name} (Mine)` : room.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          {queueLoading && displayedPatients.length === 0 ? (
            <SkeletonList rows={2} rowHeight={theme.sizes.controlMd} />
          ) : queueError ? (
            <ErrorState title="Unable to load the patient queue" message={queueError} onRetry={loadQueue} />
          ) : displayedPatients.length === 0 ? (
            <EmptyState
              icon="patients"
              title="No patients matching filter"
              description="No patients in the active queue match the selected station or status criteria."
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientRow}>
              {displayedPatients.map((p) => {
                const isSelected = selectedPatient?.id === p.id;
                const isEmergency = p.priority === 'Emergency';
                const isUrgent = p.priority === 'Urgent';
                const effectiveQueueStatus: QueueStatus =
                  p.status === 'PendingProcedure' &&
                  p.id === selectedPatient?.id &&
                  !hasPendingInClinicProcedures &&
                  latestExecutedProcedure?.status === 'Completed'
                    ? 'ReEvaluation'
                    : p.status;

                const roomTag =
                  p.roomOrStation && !(effectiveQueueStatus === 'ReEvaluation' && p.roomOrStation === 'Treatment Room')
                    ? ` · ${p.roomOrStation}`
                    : '';

                const getStatusInfo = (status: QueueStatus): { label: string; variant: BadgeVariant } | null => {
                  switch (status) {
                    case 'Triaged':
                      return { label: 'Ready', variant: 'success' };
                    case 'InConsultation':
                      return { label: 'In Consult', variant: 'purple' };
                    case 'PendingProcedure':
                      return { label: 'Procedure Bay', variant: 'warning' };
                    case 'ReEvaluation':
                      return { label: 'Re-Eval Ready', variant: 'emergency' };
                    case 'Completed':
                      return { label: 'Completed', variant: 'neutral' };
                    default:
                      return null;
                  }
                };

                const statusInfo = getStatusInfo(effectiveQueueStatus);

                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Patient ${p.queueNumber}, ${p.patientName}, Status: ${p.status}`}
                    onPress={() => handleSelectPatient(p)}
                    style={[
                      styles.queuePatientChip,
                      isSelected && styles.queuePatientChipSelected,
                      isEmergency && styles.queuePatientChipEmergency,
                      isUrgent && !isEmergency && styles.queuePatientChipUrgent,
                    ]}
                  >
                    <ThemedText
                      variant="captionBold"
                      color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                    >
                      {p.isDirectVisit || p.queueNumber?.startsWith('DV-') || p.queueNumber === 'DIRECT'
                        ? p.queueNumber === 'DIRECT'
                          ? 'Direct • Draft'
                          : `Direct • ${p.queueNumber}`
                        : p.queueNumber}
                    </ThemedText>
                    <ThemedText
                      variant="caption"
                      numberOfLines={1}
                      color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                    >
                      {p.patientName}
                    </ThemedText>
                    {roomTag ? (
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        {roomTag}
                      </ThemedText>
                    ) : null}
                    {isEmergency ? (
                      <Badge label="STAT" variant="emergency" size="sm" />
                    ) : isUrgent ? (
                      <Badge label="Urgent" variant="urgent" size="sm" />
                    ) : null}
                    {statusInfo ? (
                      <Badge label={statusInfo.label} variant={statusInfo.variant} size="sm" />
                    ) : null}
                    {allowChipLevelCalling && ['Triaged', 'ReEvaluation', 'Waiting'].includes(p.status) ? (
                      <Button
                        variant="primary"
                        size="xs"
                        icon="bell"
                        title="Call"
                        accessibilityLabel={`Call ${p.patientName} to room`}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleOpenCallModal(p);
                        }}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {!selectedPatient && patients.length > 0 ? (
          <EmptyState
            icon="consultations"
            title="Select a patient"
            description="Choose a patient from the queue above to start the consultation."
          />
        ) : null}

        {selectedPatient ? (
          <>
            {/* Selected patient (PatientSummarySpine Workstation Header) */}
            <View
              onLayout={(e) => {
                sectionOffsets.current['patient-pin'] = e.nativeEvent.layout.y;
                sectionOffsets.current['vitals'] = e.nativeEvent.layout.y;
              }}
            >
              <PatientSummarySpine
                variant="workstation"
                patient={patientRecord || {
                  id: selectedPatient.patientId,
                  clinicId: selectedPatient.clinicId,
                  tenantId: selectedPatient.tenantId,
                  patientCode: '',
                  fullName: selectedPatient.patientName,
                  firstName: selectedPatient.patientName.split(' ')[0] || '',
                  lastName: selectedPatient.patientName.split(' ').slice(1).join(' ') || '',
                  age: 0,
                  contactNumber: '',
                  dateOfBirth: '',
                  sex: '',
                  createdAt: '',
                }}
                chart={patientChart}
                vitals={vitals}
                problems={activeSpineProblems}
                activePrescriptions={activeSpinePrescriptions}
                queueTicket={selectedPatient.queueNumber}
                queuePriority={selectedPatient.priority}
                chiefComplaint={selectedPatient.chiefComplaint}
                activeAtc={isYakapEligible ? (philHealthAtc.trim() || null) : null}
                loading={contextLoading}
                onPressRefresh={() => loadPatientContext(selectedPatient)}
                onPressEdit={() => setEditPatientModalVisible(true)}
                onPressRecordVitals={
                  !isSigned && canRecordVitals ? handleOpenVitalsModal : undefined
                }
              />
            </View>

            {/* Procedure Bay In-Flight Alert Banner */}
            {hasPendingInClinicProcedures && !isSigned && (
              <Card style={styles.procedureBayBanner}>
                <View style={styles.rowBetween}>
                  <View style={styles.row}>
                    <Icon name="clock" size={theme.sizes.iconMd} color={theme.colors.warningText} />
                    <View style={{ flex: 1 }}>
                      <ThemedText variant="bodyBold" color={theme.colors.warningText}>
                        Patient is in Procedure Bay (Pending Execution)
                      </ThemedText>
                      <ThemedText variant="small" color={theme.colors.textSecondary}>
                        In-clinic procedures have been ordered and are pending execution at the treatment station. Encounter signing is locked until procedures are completed or cancelled.
                      </ThemedText>
                    </View>
                  </View>
                  <Badge label="Procedure Bay" variant="warning" size="sm" />
                </View>
                <View style={[styles.actionRow, { marginTop: 8 }]}>
                  <Button
                    title="Perform In-Clinic Procedure"
                    icon="syringe"
                    variant="primary"
                    size="sm"
                    onPress={() => handleSelectChartTab('procedures')}
                  />
                </View>
              </Card>
            )}

            {/* Doctor Re-Evaluation Alert Banner (Closed-Loop In-Clinic Procedures Feature 20) */}
            {(!hasPendingInClinicProcedures && (selectedPatient.status === 'ReEvaluation' || latestExecutedProcedure?.status === 'Completed')) ? (
              <Card style={styles.reEvalBanner}>
                <View style={styles.rowBetween}>
                  <View style={styles.row}>
                    <Icon name="activity" size={theme.sizes.iconMd} color={theme.colors.info} />
                    <View>
                      <ThemedText variant="bodyBold" color={theme.colors.infoText}>
                        In-Clinic Procedure Completed — Re-Evaluation Required
                      </ThemedText>
                      <ThemedText variant="small" color={theme.colors.textSecondary}>
                        {latestExecutedProcedure
                          ? `${latestExecutedProcedure.procedureName} executed by ${latestExecutedProcedure.performedByStaffName || 'Treatment Room Nurse'}`
                          : 'Treatment room nurse completed in-clinic procedure handoff'}
                      </ThemedText>
                    </View>
                  </View>
                  <Badge label="Re-Evaluation" variant="warning" size="sm" />
                </View>

                {latestExecutedProcedure ? (
                  <View style={styles.reEvalDetailsBox}>
                    <View style={styles.rowWrap}>
                      <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                        Pre-Procedure Vitals:
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.text}>
                        {formatProcedureVitals(latestExecutedProcedure.preProcedureVitalsJson)}
                      </ThemedText>
                    </View>
                    <View style={styles.rowWrap}>
                      <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                        Post-Procedure Vitals:
                      </ThemedText>
                      <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                        {formatProcedureVitals(latestExecutedProcedure.postProcedureVitalsJson)}
                      </ThemedText>
                    </View>
                    {latestExecutedProcedure.lotNumber ? (
                      <View style={styles.rowWrap}>
                        <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                          Med/Lot Batch:
                        </ThemedText>
                        <ThemedText variant="caption" color={theme.colors.text}>
                          {latestExecutedProcedure.medicationAdministered || ''} (Lot #{latestExecutedProcedure.lotNumber}{latestExecutedProcedure.expirationDate ? ` exp ${latestExecutedProcedure.expirationDate}` : ''})
                        </ThemedText>
                      </View>
                    ) : null}
                    {latestExecutedProcedure.clinicalNotes ? (
                      <ThemedText variant="small" color={theme.colors.textSecondary}>
                        Nurse notes: {latestExecutedProcedure.clinicalNotes}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.actionRow}>
                  <Button
                    title={
                      isPostProcedureVitalsImported
                        ? 'Imported into Objective'
                        : 'Import Post-Procedure Vitals into Objective'
                    }
                    icon={isPostProcedureVitalsImported ? 'check' : 'plus'}
                    variant={isPostProcedureVitalsImported ? 'outline' : 'primary'}
                    size="sm"
                    disabled={isPostProcedureVitalsImported}
                    onPress={() => handleImportPostProcedureVitals(latestExecutedProcedure)}
                  />
                </View>
              </Card>
            ) : null}

            {/* Responsive Workstation Layout (Desktop Dual-Pane >= 1024px vs Mobile Stacked) */}
            {isDesktopWorkstation ? (
              <View
                style={styles.splitScreenContainer}
                onLayout={(e) => {
                  soapPaneOffsetY.current = e.nativeEvent.layout.y;
                }}
              >
                {!isWorkspaceExpanded ? (
                  <View
                    style={[
                      styles.leftChartPane,
                      isChartExpanded && styles.leftChartPaneExpanded,
                    ]}
                  >
                    <ScrollView
                      ref={chartScrollViewRef}
                      style={[
                        styles.splitPaneScroll,
                        { maxHeight: desktopPaneHeight },
                        Platform.OS === 'web' && ({ overscrollBehavior: 'contain' } as any),
                      ]}
                      contentContainerStyle={styles.splitPaneScrollContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled"
                      directionalLockEnabled
                      scrollEventThrottle={16}
                      overScrollMode="never"
                      bounces={false}
                    >
                      {renderLongitudinalChartContent()}
                    </ScrollView>
                  </View>
                ) : null}
                {!isChartExpanded ? (
                  <View
                    style={[
                      styles.rightSoapPane,
                      isWorkspaceExpanded && styles.rightSoapPaneExpanded,
                    ]}
                  >
                    <ScrollView
                      ref={soapScrollViewRef}
                      style={[
                        styles.splitPaneScroll,
                        { maxHeight: desktopPaneHeight },
                        Platform.OS === 'web' && ({ overscrollBehavior: 'contain' } as any),
                      ]}
                      contentContainerStyle={styles.splitPaneScrollContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled"
                      directionalLockEnabled
                      scrollEventThrottle={16}
                      overScrollMode="never"
                      bounces={false}
                    >
                      {renderSoapDocumentationContent()}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            ) : (
              <View
                style={styles.mobileWorkstationContainer}
                onLayout={(e) => {
                  soapPaneOffsetY.current = e.nativeEvent.layout.y;
                }}
              >
                <View style={styles.mobileViewSwitcherContainer}>
                  <SegmentedControl
                    value={mobileWorkstationView}
                    onChange={(v) => setMobileWorkstationView(v as 'soap' | 'chart')}
                    options={[
                      { value: 'soap', label: 'Documentation (SOAP)' },
                      { value: 'chart', label: 'Patient Chart' },
                    ]}
                  />
                </View>
                {mobileWorkstationView === 'soap'
                  ? renderSoapDocumentationContent()
                  : renderLongitudinalChartContent()}
              </View>
            )}
          </>
        ) : null}

        {/* Attach External Physical Document Modal */}
        <AttachExternalDocumentModal
          visible={uploadDocModalVisible}
          patient={patientRecord || (selectedPatient as any)}
          patientId={selectedPatient?.patientId || patientRecord?.id}
          onClose={() => setUploadDocModalVisible(false)}
          onAttachmentUploaded={async () => {
            if (selectedPatient) {
              await refreshPatientChart();
            }
          }}
        />

        {/* Medical certificate modal */}
        <Modal
          visible={medCertModalVisible}
          onClose={() => setMedCertModalVisible(false)}
          title={isSigned ? 'Issue medical certificate' : 'Draft medical certificate'}
          subtitle={selectedPatient ? `Patient: ${selectedPatient.patientName}` : undefined}
          footer={
            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="outline" onPress={() => setMedCertModalVisible(false)} />
              <Button
                title={isSigned ? 'Lock & issue certificate' : 'Save draft certificate'}
                loading={issuingMedCert}
                onPress={handleIssueMedCert}
              />
            </View>
          }
        >
          {!isSigned ? (
            <View style={styles.draftDocNoticeBox}>
              <Badge label="Draft" variant="warning" size="sm" icon="clock" />
              <ThemedText variant="caption" color={theme.colors.warningText} style={styles.flex}>
                This medical certificate will remain in draft until the consultation encounter is signed.
              </ThemedText>
            </View>
          ) : null}
          <View style={styles.stack}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Fitness assessment
            </ThemedText>
            <View style={styles.chipsRow}>
              {FITNESS_OPTIONS.map((fit) => (
                <ToggleChip
                  key={fit.value}
                  label={fit.label}
                  showIcon={false}
                  selected={medCertFitness === fit.value}
                  onPress={() => setMedCertFitness(fit.value)}
                />
              ))}
            </View>
          </View>
          <Input
            label="Recommended rest days"
            placeholder="e.g. 3"
            value={medCertRestDays}
            onChangeText={setMedCertRestDays}
            keyboardType="numeric"
          />
          <Input
            label="Certificate purpose"
            placeholder="e.g. Employment, sick leave"
            value={medCertPurpose}
            onChangeText={setMedCertPurpose}
          />
          <Input
            label="Physician remarks / advice"
            placeholder="e.g. Advised hydration and follow-up if fever persists"
            value={medCertRemarks}
            onChangeText={setMedCertRemarks}
          />
        </Modal>

        {/* Referral letter modal */}
        <Modal
          visible={referralModalVisible}
          onClose={() => setReferralModalVisible(false)}
          title={isSigned ? 'Issue referral letter' : 'Draft referral letter'}
          subtitle={selectedPatient ? `Patient: ${selectedPatient.patientName}` : undefined}
          footer={
            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="outline" onPress={() => setReferralModalVisible(false)} />
              <Button
                title={isSigned ? 'Issue & seal referral' : 'Save draft referral'}
                loading={issuingReferral}
                onPress={handleIssueReferral}
              />
            </View>
          }
        >
          {!isSigned ? (
            <View style={styles.draftDocNoticeBox}>
              <Badge label="Draft" variant="warning" size="sm" icon="clock" />
              <ThemedText variant="caption" color={theme.colors.warningText} style={styles.flex}>
                This referral letter will remain in draft until the consultation encounter is signed.
              </ThemedText>
            </View>
          ) : null}
          <Input
            label="Receiving facility"
            required
            placeholder="Hospital or clinic name"
            value={refFacility}
            onChangeText={setRefFacility}
            error={refValidationAttempted && !refFacility.trim() ? 'Receiving facility is required' : undefined}
          />
          <Input
            label="Department / specialty"
            required
            placeholder="e.g. Cardiology, Surgery, Pulmonology"
            value={refDepartment}
            onChangeText={setRefDepartment}
            error={refValidationAttempted && !refDepartment.trim() ? 'Department / specialty is required' : undefined}
          />
          <View style={styles.stack}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Urgency
            </ThemedText>
            <View style={styles.chipsRow}>
              {REFERRAL_URGENCIES.map((urg) => (
                <ToggleChip
                  key={urg}
                  label={urg}
                  showIcon={false}
                  selected={refUrgency === urg}
                  onPress={() => setRefUrgency(urg)}
                />
              ))}
            </View>
          </View>
          <Input
            label="Reason for referral"
            required
            placeholder="e.g. Specialist workup for chest pain"
            value={refReason}
            onChangeText={setRefReason}
            error={refValidationAttempted && !refReason.trim() ? 'Reason for referral is required' : undefined}
          />
          <Input
            label="Provisional Diagnosis / Assessment"
            required
            placeholder="e.g. Clearance for sports / Congenital murmur workup"
            value={refDiagnosis}
            onChangeText={setRefDiagnosis}
            error={
              refValidationAttempted && !refDiagnosis.trim() && !primaryDiagnosisText()
                ? 'Provisional diagnosis is required'
                : undefined
            }
            helperText={
              primaryDiagnosisText() && refDiagnosis === primaryDiagnosisText()
                ? 'Pre-populated from consultation assessment. You can edit this for the referral.'
                : undefined
            }
          />
          <Input
            label="Clinical summary"
            required
            placeholder="Summary of examination, diagnostics and clinical findings"
            value={refSummary}
            onChangeText={setRefSummary}
            multiline
            error={
              refValidationAttempted && !refSummary.trim() && !subjective.trim()
                ? 'Clinical summary is required'
                : undefined
            }
            helperText={
              subjective.trim() && refSummary === subjective.trim()
                ? 'Pre-populated from consultation subjective notes. You can edit or expand.'
                : !subjective.trim() && !refSummary.trim()
                ? 'Required: No subjective notes found in current consultation.'
                : undefined
            }
          />
        </Modal>

        {/* Document print preview modal */}
        <Modal
          visible={previewDocModal}
          onClose={() => setPreviewDocModal(false)}
          title={
            previewType === 'MEDCERT'
              ? isMedCertDraft
                ? 'Medical certificate (Draft)'
                : 'Medical certificate'
              : previewType === 'REFERRAL'
              ? isReferralDraft
                ? 'Referral letter (Draft)'
                : 'Referral letter'
              : !isSigned
              ? 'Electronic prescription (Draft)'
              : 'Electronic prescription'
          }
          maxWidth={640}
          footer={
            <View style={styles.modalFooter}>
              {previewType === 'MEDCERT' && issuedMedCert ? (
                !isMedCertDraft ? (
                  <Button
                    title={docSigningMode === 'wet' ? 'Download official PDF (Wet)' : 'Download official PDF'}
                    icon="download"
                    variant="success"
                    onPress={() =>
                      downloadPdf(
                        clinicService.getMedicalCertificatePdfUrl(issuedMedCert.id, { wet: docSigningMode === 'wet' }),
                        'Could not open the medical certificate PDF. Please check your connection and try again.',
                      )
                    }
                  />
                ) : (
                  <Badge label="Sign consultation encounter to unlock official PDF" variant="warning" />
                )
              ) : null}
              {previewType === 'REFERRAL' && issuedReferral ? (
                !isReferralDraft ? (
                  <Button
                    title={docSigningMode === 'wet' ? 'Download official PDF (Wet)' : 'Download official PDF'}
                    icon="download"
                    variant="success"
                    onPress={() =>
                      downloadPdf(
                        clinicService.getReferralLetterPdfUrl(issuedReferral.id, { wet: docSigningMode === 'wet' }),
                        'Could not open the referral letter PDF. Please check your connection and try again.',
                      )
                    }
                  />
                ) : (
                  <Badge label="Sign consultation encounter to unlock official PDF" variant="warning" />
                )
              ) : null}
              {previewType === 'PRESCRIPTION' && (signedConsultationId || prescriptionSlip?.consultationId) ? (
                isSigned ? (
                  <Button
                    title={docSigningMode === 'wet' ? 'Download official PDF (Wet)' : 'Download official PDF'}
                    icon="download"
                    variant="success"
                    onPress={() =>
                      downloadPdf(
                        clinicService.getPrescriptionSlipPdfUrl(
                          signedConsultationId || prescriptionSlip!.consultationId,
                          { wet: docSigningMode === 'wet' },
                        ),
                        'Could not open the prescription slip PDF. Please check your connection and try again.',
                      )
                    }
                  />
                ) : (
                  <Badge label="Sign consultation encounter to unlock official PDF" variant="warning" />
                )
              ) : null}
              <Button title="Close preview" onPress={() => setPreviewDocModal(false)} />
            </View>
          }
        >
          {/* Document signing mode selector */}
          <View style={styles.docModeCard}>
            <View style={styles.docModeHeader}>
              <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                Signature & Print Mode
              </ThemedText>
              {isPreviewDocDraft ? (
                <Badge label="Draft — Unsigned" variant="warning" icon="clock" />
              ) : docSigningMode === 'wet' ? (
                <Badge label="Wet Signature (Pen)" variant="neutral" icon="pencil" />
              ) : (
                <Badge label="E-Signed PDF" variant="success" icon="check" />
              )}
            </View>

            <SegmentedControl
              options={DOC_SIGNING_OPTIONS}
              value={docSigningMode}
              onChange={handleDocSigningModeChange}
            />

            {hasDangerousDrug ? (
              <View style={styles.pdeaWarningBox} testID="pdea-warning-badge">
                <View style={styles.pdeaWarningHeader}>
                  <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                  <Badge label="PDEA S2 Regulated Substance" variant="warning" />
                </View>
                <ThemedText variant="captionBold" color={theme.colors.warningText}>
                  PDEA S2 Regulated Substance: Wet signature on physical prescription pad recommended/required under Philippine DOH-PDEA regulations.
                </ThemedText>
              </View>
            ) : null}
          </View>

          <View style={styles.paper}>
            {isPreviewDocDraft ? (
              <View style={styles.draftDocNoticeBox} testID="document-draft-banner">
                <Badge label="Draft" variant="warning" size="sm" icon="clock" />
                <ThemedText variant="captionBold" color={theme.colors.warningText} style={styles.flex}>
                  Draft preview — not valid until the consultation encounter is officially signed.
                </ThemedText>
              </View>
            ) : null}
            {/* Facility letterhead */}
            <View style={styles.paperHeader}>
              <ThemedText variant="h3" style={styles.center}>
                {facilityHeader}
              </ThemedText>
              {letterhead.subHeader ? (
                <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.center}>
                  {letterhead.subHeader}
                </ThemedText>
              ) : null}
              {letterhead.address ? (
                <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.center}>
                  {letterhead.address}
                </ThemedText>
              ) : null}
              {letterhead.contact ? (
                <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.center}>
                  {letterhead.contact}
                </ThemedText>
              ) : null}
              {accreditationNumber ? (
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.center}>
                  Accreditation No. {accreditationNumber}
                </ThemedText>
              ) : null}
              <ThemedText variant="bodyBold" color={theme.colors.primaryDark} style={styles.paperTitle}>
                {previewType === 'MEDCERT'
                  ? 'Medical certificate'
                  : previewType === 'REFERRAL'
                  ? 'Referral letter'
                  : 'Electronic prescription'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Document No.{' '}
                {previewType === 'MEDCERT'
                  ? issuedMedCert?.certificateNumber
                  : previewType === 'REFERRAL'
                  ? issuedReferral?.referralNumber
                  : (prescriptionSlip?.prescriptionNumber || 'Rx')}
              </ThemedText>
            </View>

            {previewType === 'MEDCERT' && issuedMedCert ? (
              <View style={styles.stack}>
                <ThemedText variant="body">To whom it may concern:</ThemedText>
                <ThemedText variant="body" color={theme.colors.textSecondary}>
                  This certifies that <ThemedText variant="bodyBold">{issuedMedCert.patientName}</ThemedText> was
                  clinically evaluated on {issuedMedCert.issueDate} with the following diagnosis:
                </ThemedText>
                <View style={styles.paperBox}>
                  <ThemedText variant="bodyBold">Diagnosis: {issuedMedCert.diagnosis}</ThemedText>
                  {issuedMedCert.clinicalFindings ? (
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Findings: {issuedMedCert.clinicalFindings}
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText variant="body" color={theme.colors.textSecondary}>
                  Fitness status:{' '}
                  <ThemedText variant="bodyBold" color={theme.colors.successText}>
                    {humanize(issuedMedCert.fitnessStatus)}
                  </ThemedText>
                </ThemedText>
                {issuedMedCert.recommendedRestDays ? (
                  <ThemedText variant="body" color={theme.colors.textSecondary}>
                    Recommended rest:{' '}
                    <ThemedText variant="bodyBold">{issuedMedCert.recommendedRestDays} day(s)</ThemedText>
                  </ThemedText>
                ) : null}
                {issuedMedCert.remarks || issuedMedCert.purpose ? (
                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    {[
                      issuedMedCert.remarks ? `Remarks: ${issuedMedCert.remarks}` : null,
                      issuedMedCert.purpose ? `Purpose: ${issuedMedCert.purpose}` : null,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}

            {previewType === 'REFERRAL' && issuedReferral ? (
              <View style={styles.stack}>
                <ThemedText variant="body" color={theme.colors.textSecondary}>
                  To: <ThemedText variant="bodyBold">{issuedReferral.referredToFacility}</ThemedText> (
                  {issuedReferral.referredDepartment})
                </ThemedText>
                <ThemedText variant="body" color={theme.colors.textSecondary}>
                  Patient: <ThemedText variant="bodyBold">{issuedReferral.patientName}</ThemedText> • Urgency:{' '}
                  <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
                    {issuedReferral.urgency}
                  </ThemedText>
                </ThemedText>
                <View style={styles.paperBox}>
                  <ThemedText variant="bodyBold">Reason: {issuedReferral.reasonForReferral}</ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    Clinical summary: {issuedReferral.clinicalSummary}
                  </ThemedText>
                  <ThemedText variant="small">Impression: {issuedReferral.provisionalDiagnosis}</ThemedText>
                </View>
              </View>
            ) : null}

            {previewType === 'PRESCRIPTION' ? (
              <View style={styles.stack}>
                <ThemedText variant="bodyBold">Prescribed medications:</ThemedText>
                {prescriptions.map((p, idx) => {
                  const dispensedInClinic = Math.min(p.quantity, Math.max(0, p.clinicDispensedQuantity ?? 0));
                  const hasClinicDispense = dispensedInClinic > 0;
                  const remainingForPurchase = Math.max(0, p.quantity - dispensedInClinic);
                  return (
                    <View key={p.id || idx} style={styles.paperBox}>
                      <View style={styles.rxPaperRow}>
                        <ThemedText variant="bodyBold">{p.genericName}</ThemedText>
                        <Badge label={`Qty: ${p.quantity}`} variant="neutral" />
                      </View>
                      <ThemedText variant="small" color={theme.colors.textSecondary}>
                        {p.dosage} · {p.form}
                      </ThemedText>
                      <ThemedText variant="captionBold" color={theme.colors.textMuted}>
                        Sig: {p.sig}
                      </ThemedText>
                      {hasClinicDispense ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                          <Badge label={`Clinic stock: ${dispensedInClinic} pcs`} variant="routine" size="xs" />
                          <Badge
                            label={
                              remainingForPurchase > 0
                                ? `External purchase: ${remainingForPurchase} pcs`
                                : 'Fulfilled in clinic'
                            }
                            variant={remainingForPurchase > 0 ? 'info' : 'success'}
                            size="xs"
                          />
                        </View>
                      ) : null}
                      {p.isDangerousDrug ? (
                        <Badge label="Dangerous drug (PDEA S2)" variant="emergency" />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Physician signature block */}
            <View style={styles.signature}>
              <ThemedText variant="bodyBold">{docSignature.name}</ThemedText>
              {docSignature.prc ? (
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  PRC Lic. No. {docSignature.prc}
                </ThemedText>
              ) : null}
              {docSignature.ptr ? (
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  PTR No. {docSignature.ptr}
                </ThemedText>
              ) : null}
              {isPreviewDocDraft ? (
                <ThemedText variant="captionBold" color={theme.colors.warningText}>
                  Draft — Pending physician encounter sign-off
                </ThemedText>
              ) : docSigningMode === 'wet' ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  [ Clean signature line for physical pen signing ]
                </ThemedText>
              ) : docSignature.signed ? (
                <ThemedText variant="captionBold" color={theme.colors.successText}>
                  Digitally signed and sealed
                </ThemedText>
              ) : null}
            </View>
            {letterhead.footer ? (
              <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.center}>
                {letterhead.footer}
              </ThemedText>
            ) : null}
          </View>
        </Modal>

        {/* Electronic prescription slip modal */}
        <PrescriptionSlipModal
          visible={prescriptionSlipModalVisible}
          onClose={() => setPrescriptionSlipModalVisible(false)}
          slip={prescriptionSlip}
          attendingDoctor={signerStaff}
          onOpenExternalDispense={() => {
            if (!signedConsultationId) {
              notify.info('Sign the encounter before recording an external dispense.');
              return;
            }
            setPrescriptionSlipModalVisible(false);
            setExternalDispenseModalVisible(true);
          }}
        />

        {/* Record external dispense modal */}
        <RecordExternalDispenseModal
          visible={externalDispenseModalVisible && Boolean(signedConsultationId)}
          onClose={() => setExternalDispenseModalVisible(false)}
          consultationId={signedConsultationId ?? ''}
          prescriptionNumber={prescriptionSlip?.prescriptionNumber}
          onSuccess={(updated) => {
            setPrescriptionSlip(updated);
            setBanner({
              text: `External dispensing by ${updated.dispensedPharmacyName} recorded successfully.`,
              isError: false,
            });
          }}
        />

        {/* Critical value readback modal */}
        <Modal
          visible={panicModalVisible}
          onClose={() => setPanicModalVisible(false)}
          title="Critical value readback"
          subtitle="Confirms receipt of life-threatening laboratory findings"
          maxWidth={520}
          footer={
            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="outline" onPress={() => setPanicModalVisible(false)} />
              <Button
                title="Sign & confirm readback"
                variant="danger"
                loading={isAcknowledgingPanic}
                onPress={handleAcknowledgePanic}
              />
            </View>
          }
        >
          {selectedPanicOrder
            ? (() => {
                const testName =
                  selectedPanicOrder.testName || selectedPanicOrder.items?.[0]?.testName || 'Diagnostic panel';
                const findings = formatCriticalFindings(selectedPanicOrder);
                return (
                  <View style={styles.paperBox}>
                    <ThemedText variant="small" color={theme.colors.textMuted}>
                      Patient:{' '}
                      <ThemedText variant="smallBold">{selectedPatient?.patientName}</ThemedText>
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textMuted}>
                      Test: <ThemedText variant="smallBold">{testName}</ThemedText>
                      {selectedPanicOrder.specimenType ? ` • Specimen: ${selectedPanicOrder.specimenType}` : ''}
                    </ThemedText>
                    <View style={styles.findingsBox}>
                      <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
                        {findings || 'Critical value flagged by the laboratory'}
                      </ThemedText>
                    </View>
                  </View>
                );
              })()
            : null}
          <Input label="Attending physician" required value={signerName} editable={false} placeholder="Choose 'Working as'" />
          <Input
            label="PRC license #"
            required
            value={doctorPrc}
            onChangeText={setDoctorPrc}
            placeholder="PRC license"
          />
          <Input
            label="Readback notes and immediate clinical actions"
            required
            multiline
            value={panicAckNotes}
            onChangeText={setPanicAckNotes}
            placeholder="e.g. Verbal readback confirmed with the laboratory. Repeat serum potassium ordered."
          />
        </Modal>

        {/* Call to room modal */}
        <Modal
          visible={!!callModalItem}
          title={`Call ${callModalItem?.patientName || ''}`}
          subtitle={`Assign examination room or station for Ticket ${callModalItem?.queueNumber || ''}`}
          maxWidth={480}
          onClose={() => setCallModalItem(null)}
          footer={
            <View style={styles.callModalActions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setCallModalItem(null)}
              />
              <Button
                title={`Call to ${selectedCallRoom}`}
                variant="primary"
                icon="bell"
                loading={isCallingNext}
                onPress={handleExecuteCall}
              />
            </View>
          }
        >
          <View style={styles.callModalContent}>
            <ThemedText variant="body" color={theme.colors.text}>
              Confirm or select the destination room for this encounter:
            </ThemedText>

            <View style={styles.roomOptionGroup}>
              {visibleRooms.map((room) => {
                const isSelected = selectedCallRoom === room.name;
                const isMine =
                  (current?.assignedRoomIds?.includes(room.id)) || current?.assignedRoomId === room.id;
                return (
                  <Pressable
                    key={room.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${room.name}`}
                    onPress={() => {
                      setSelectedCallRoom(room.name);
                      setSelectedCallRoomId(room.id);
                    }}
                    style={[styles.roomOptionCard, isSelected && styles.roomOptionCardActive]}
                  >
                    <Icon
                      name={isSelected ? 'checkCircle' : 'dot'}
                      size={18}
                      color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                    />
                    <ThemedText
                      variant="bodyBold"
                      color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                    >
                      {room.name}{isMine ? ' (Mine)' : ''}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Modal>

        {/* Edit Patient Demographics Modal */}
        <EditPatientModal
          visible={editPatientModalVisible}
          patient={patientRecord}
          onClose={() => setEditPatientModalVisible(false)}
          onSaved={(updated) => {
            setPatientRecord(updated);
            setSelectedPatient((prev) =>
              prev && prev.patientId === updated.id
                ? { ...prev, patientName: updated.fullName || prev.patientName }
                : prev
            );
            setPatients((prev) =>
              prev.map((item) =>
                item.patientId === updated.id
                  ? { ...item, patientName: updated.fullName || item.patientName }
                  : item
              )
            );
            setPatientChart((prev) =>
              prev ? reconcileChartWithPatient(prev, updated) : prev
            );
            refreshPatientChart(updated.id);
          }}
        />

        {/* Record Vitals Modal */}
        {selectedPatient && (
          <RecordVitalsModal
            visible={recordVitalsModalVisible}
            onClose={() => setRecordVitalsModalVisible(false)}
            patient={patientRecord}
            queueItemId={selectedPatient.id.startsWith('ephemeral-') ? null : selectedPatient.id}
            visitType={selectedPatient.visitType}
            initialDirectVisitStatus="InConsultation"
            allowDuplicateActive={isFollowUpEncounter}
            onMaterializeVisit={(directVisit) => {
              const prevId = selectedPatient.id;
              const materialized: PatientQueueItem = {
                ...selectedPatient,
                ...directVisit,
                isDirectVisit: true,
              };
              setSelectedPatient(materialized);
              setPatients((prev) =>
                (prev || []).map((p) => (p.id === prevId ? materialized : p))
              );
            }}
            currentStaffId={signer?.id}
            currentStaffName={signerStaff ? formatStaffName(signerStaff) : signer?.name}

            onSuccess={(recordedVitals) => {
              setVitals(recordedVitals);
              if (!signedConsultationId && recordedVitals.rosCategory && rosCategory === 'EssentiallyNormal') {
                setRosCategory(normalizeRosCategoryCode(recordedVitals.rosCategory));
              }
              setPatientChart((prev) =>
                prev
                  ? {
                      ...prev,
                      vitalsHistory: [
                        recordedVitals,
                        ...(prev.vitalsHistory || []).filter((v) => v.id !== recordedVitals.id),
                      ],
                    }
                  : prev
              );
              setRecordVitalsModalVisible(false);
            }}
          />
        )}

        {/* Edit Vitals Modal */}
        {selectedPatient && (
          <EditVitalsModal
            visible={editVitalsModalVisible}
            onClose={() => setEditVitalsModalVisible(false)}
            patient={patientRecord}
            queueItemId={selectedPatient.id}
            visitType={selectedPatient.visitType}
            initialVitals={latestDisplayedVitals}
            currentStaffId={signer?.id}
            currentStaffName={signerStaff ? formatStaffName(signerStaff) : signer?.name}
            onSuccess={(updatedVitals) => {
              setVitals(updatedVitals);
              if (!signedConsultationId && updatedVitals.rosCategory && rosCategory === 'EssentiallyNormal') {
                setRosCategory(normalizeRosCategoryCode(updatedVitals.rosCategory));
              }
              setPatientChart((prev) =>
                prev
                  ? {
                      ...prev,
                      vitalsHistory: [
                        updatedVitals,
                        ...(prev.vitalsHistory || []).filter((v) => v.id !== updatedVitals.id),
                      ],
                    }
                  : prev
              );
              setEditVitalsModalVisible(false);
            }}
          />
        )}

        {/* Order Catalog Search Modal */}
        <OrderCatalogSearchModal
          visible={orderSearchModalVisible}
          onClose={() => {
            setOrderSearchModalVisible(false);
            setOrderInitialToothNumber(undefined);
            setOrderInitialToothSurface(undefined);
          }}
          catalog={activeCatalog}
          rooms={treatmentRooms.length > 0 ? treatmentRooms : activeRooms}
          initialRoomId={selectedTreatmentRoomId}
          initialCategory={orderSearchInitialCategory}
          initialToothNumber={orderInitialToothNumber}
          initialToothSurface={orderInitialToothSurface}
          isYakapEligible={isYakapEligible}
          onSelectOrder={handleSelectCatalogOrder}
          alreadyOrderedNames={[...orderedLabs.map((l) => l.name), ...orderedProcedures.map((p) => p.name)]}
          alreadyOrderedCodes={[
            ...(orderedLabs.map((l) => l.code).filter(Boolean) as string[]),
            ...(orderedProcedures.map((p) => p.code).filter(Boolean) as string[]),
          ]}
          existingOrders={[
            ...orderedLabs.map((l) => ({
              name: l.name,
              code: l.code,
              fulfillmentMode: l.fulfillmentMode,
              instructions: l.instructions,
            })),
            ...orderedProcedures.map((p) => ({
              name: p.name,
              code: p.code,
              fulfillmentMode: 'in_house' as const,
              instructions: p.instructions,
              toothNumber: p.toothNumber,
              toothSurface: p.toothSurface,
              roomId: p.roomId || p.targetRoomId,
              roomName: p.roomName || p.targetRoomName,
              targetRoomId: p.targetRoomId || p.roomId,
              targetRoomName: p.targetRoomName || p.roomName,
            })),
          ]}
        />

        {/* In-Place Order Instructions Modal */}
        {editingOrderItem ? (
          <Modal
            visible={Boolean(editingOrderItem)}
            onClose={() => setEditingOrderItem(null)}
            title={`Edit Instructions: ${editingOrderItem.name}`}
            subtitle={`Set clinical instructions and notes for ${editingOrderItem.type === 'lab' ? 'diagnostic test' : 'in-clinic procedure'}`}
            maxWidth={560}
            footer={
              <View style={styles.modalFooter}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setEditingOrderItem(null)}
                />
                <Button
                  title="Save Instructions"
                  variant="primary"
                  icon="check"
                  onPress={() => handleSaveOrderInstructions(editingInstructionText)}
                  testID="save-order-instructions-btn"
                />
              </View>
            }
            testID="edit-order-instructions-modal"
          >
            <View style={styles.editInstructionsModalContent}>
              <View style={styles.editInstructionsHeader}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  {editingOrderItem.name}
                </ThemedText>
                <Badge label={editingOrderItem.category} variant="neutral" size="sm" />
                {(editingOrderItem.standardPrice ?? 0) > 0 ? (
                  <Badge label={`₱${(editingOrderItem.standardPrice ?? 0).toLocaleString()}`} variant="neutral" size="sm" />
                ) : null}
              </View>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Quick Preset Chips:
              </ThemedText>
              <View style={styles.chipsWrap}>
                {(editingOrderItem.type === 'lab'
                  ? ['10-12 hr fasting', '8 hr fasting', 'Random / Non-fasting', 'Morning mid-stream urine', 'STAT']
                  : ['STAT', 'Routine', 'Pre/post vitals required', 'Wound care / sterile technique', 'Informed consent verified']
                ).map((chip) => {
                  const isChipSelected = editingInstructionText.includes(chip);
                  return (
                    <Pressable
                      key={chip}
                      style={[styles.instructionChip, isChipSelected && styles.instructionChipActive]}
                      onPress={() => {
                        setEditingInstructionText((prev) => {
                          const trimmed = prev.trim();
                          if (!trimmed) return chip;
                          const parts = trimmed.split(';').map((p) => p.trim());
                          if (parts.includes(chip)) {
                            return parts.filter((p) => p !== chip).join('; ');
                          }
                          return `${trimmed}; ${chip}`;
                        });
                      }}
                      accessibilityRole="button"
                    >
                      <ThemedText
                        variant="captionBold"
                        color={isChipSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                      >
                        {chip}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <Input
                placeholder="Clinical instructions, site route, fasting requirements, or doctor notes..."
                multiline
                numberOfLines={3}
                value={editingInstructionText}
                onChangeText={setEditingInstructionText}
                accessibilityLabel="Clinical instructions"
                testID="edit-order-instructions-input"
              />
            </View>
          </Modal>
        ) : null}

        {/* Clinical Charge Slip Preview Modal (Read-Only) */}
        <Modal
          visible={reviewChargeSlipModalVisible}
          onClose={() => setReviewChargeSlipModalVisible(false)}
          title="Clinical Charge Slip Preview"
          subtitle={selectedPatient ? `Patient: ${selectedPatient.patientName} (${selectedPatient.queueNumber})` : undefined}
          maxWidth={620}
        >
          <View style={styles.soaModalContent}>
            {/* Billable Items List */}
            <ThemedText variant="smallBold" color={theme.colors.textSecondary} style={styles.soaSectionTitle}>
              CLINICAL CHARGES ({chargeSlipItems.length})
            </ThemedText>

            {chargeSlipItems.length === 0 ? (
              <View style={styles.soaEmptyItemsBox}>
                <Icon name="info" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  No billable consultation fee or procedures detected. If this is a free follow-up, you may proceed with signing.
                </ThemedText>
              </View>
            ) : (
              <View style={styles.soaItemsTable}>
                <View style={styles.soaTableHeaderRow}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ flex: 3 }}>
                    Service / Description
                  </ThemedText>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ flex: 1.5, textAlign: 'center' }}>
                    Qty
                  </ThemedText>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ flex: 2, textAlign: 'right' }}>
                    Unit Price
                  </ThemedText>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ flex: 2, textAlign: 'right' }}>
                    Amount
                  </ThemedText>
                </View>

                {chargeSlipItems.map((item, index) => (
                  <View key={`${item.description}-${index}`} style={styles.soaTableRow}>
                    <View style={{ flex: 3 }}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        {item.description}
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {item.category} {item.itemCode ? `• ${item.itemCode}` : ''} {item.doctorName ? `• ${item.doctorName}` : ''}
                      </ThemedText>
                    </View>

                    {/* Read-Only Quantity */}
                    <View style={{ flex: 1.5, alignItems: 'center', justifyContent: 'center' }}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        {item.quantity}
                      </ThemedText>
                    </View>

                    {/* Read-Only Unit Price */}
                    <View style={{ flex: 2, alignItems: 'flex-end', justifyContent: 'center' }}>
                      <ThemedText variant="body" color={theme.colors.textSecondary}>
                        ₱{item.unitPrice.toFixed(2)}
                      </ThemedText>
                    </View>

                    {/* Read-Only Total Amount */}
                    <View style={{ flex: 2, alignItems: 'flex-end', justifyContent: 'center' }}>
                      <ThemedText variant="bodyBold" color={theme.colors.text}>
                        ₱{(item.unitPrice * item.quantity).toFixed(2)}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Financial Summary Totals Card */}
            <View style={styles.soaTotalsCard}>
              <View style={styles.soaTotalRow}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Total Clinical Charges
                </ThemedText>
                <ThemedText variant="title" color={theme.colors.primary}>
                  ₱{chargeSlipGross.toFixed(2)}
                </ThemedText>
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Review clinical charges and procedures rendered during this encounter. This read-only charge slip will be posted to the Cashier for compilation into the Statement of Account (SOA), statutory discount application (Senior Citizen / PWD / PhilHealth Konsulta), and payment collection.
              </ThemedText>
            </View>

            {/* Modal Actions */}
            <View style={styles.soaActionsRow}>
              <View />
              <View style={styles.soaActionsRight}>
                <Button
                  title="Back to SOAP"
                  variant="ghost"
                  size="md"
                  onPress={() => setReviewChargeSlipModalVisible(false)}
                />
                <Button
                  title="Sign Encounter & Post Charge Slip"
                  icon="check"
                  variant="primary"
                  size="md"
                  loading={isSigning}
                  disabled={isSigning}
                  onPress={handleConfirmAndSignEncounter}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Post-Encounter Action Dialog */}
        <Modal
          visible={postEncounterModalVisible}
          onClose={() => setPostEncounterModalVisible(false)}
          title="Encounter Completed"
          subtitle={selectedPatient ? `Patient: ${selectedPatient.patientName} (${selectedPatient.queueNumber})` : undefined}
          maxWidth={500}
        >
          <View style={styles.postEncounterContainer}>
            {/* Status notification */}
            <View style={styles.postEncounterSuccessCard}>
              <View style={styles.postEncounterSuccessIconRow}>
                <View style={styles.postEncounterIconWrap}>
                  <Icon name="checkCircle" size={theme.sizes.iconLg} color={theme.colors.success} />
                </View>
                <View style={styles.postEncounterSuccessText}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Clinical Encounter Signed & Synchronized
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Doctor signed clinical chart and posted charge slip to Cashier.
                  </ThemedText>
                </View>
              </View>

              {chargeSlipGross > 0 ? (
                <View style={styles.postEncounterInvoiceBadge}>
                  <Icon name="billing" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                  <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                    Clinical Charge Slip: ₱{chargeSlipGross.toFixed(2)} (Posted to Cashier)
                  </ThemedText>
                </View>
              ) : null}
            </View>

            {/* Next in Queue Section */}
            {nextEligiblePatient ? (
              <View style={styles.postEncounterNextQueueCard}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  NEXT PATIENT IN QUEUE
                </ThemedText>
                <View style={styles.postEncounterNextPatientRow}>
                  <View style={styles.postEncounterQueueBadge}>
                    <ThemedText variant="h3" color={theme.colors.primary}>
                      {nextEligiblePatient.queueNumber}
                    </ThemedText>
                  </View>
                  <View style={styles.postEncounterNextPatientInfo}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {nextEligiblePatient.patientName}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {nextEligiblePatient.chiefComplaint || 'Consultation'} • {nextEligiblePatient.priority}
                    </ThemedText>
                  </View>
                </View>
                <Button
                  title={`Call Next Patient (${nextEligiblePatient.queueNumber})`}
                  icon="phone"
                  variant="primary"
                  size="lg"
                  onPress={() => {
                    setPostEncounterModalVisible(false);
                    handleOpenCallModal(nextEligiblePatient);
                  }}
                />
              </View>
            ) : (
              <View style={styles.postEncounterEmptyQueueCard}>
                <Icon name="checkCircle" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  No other patients are currently waiting in this queue.
                </ThemedText>
              </View>
            )}

            {/* Workflow Navigation Options */}
            <View style={styles.postEncounterOptionsRow}>
              {prescriptions.length > 0 && (
                <Button
                  title="Print Rx Slip"
                  icon="print"
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setPostEncounterModalVisible(false);
                    handleOpenPrescriptionSlip();
                  }}
                />
              )}
              <Button
                title="Go to Billing Screen"
                icon="billing"
                variant="outline"
                size="sm"
                onPress={() => {
                  setPostEncounterModalVisible(false);
                  if (selectedPatient) {
                    navigation.navigate('Billing', {
                      patientId: selectedPatient.patientId,
                      patientName: selectedPatient.patientName,
                    });
                  }
                }}
              />
              <Button
                title="Close"
                variant="ghost"
                size="sm"
                onPress={() => setPostEncounterModalVisible(false)}
              />
            </View>
          </View>
        </Modal>
      </ScrollView>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  quickAddSection: {
    gap: theme.spacing.xs,
  },
  orderedListStack: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  activeOrderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  activeOrderMainCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  activeOrderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  activeOrderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  activeOrderBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  instructionCalloutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  instructionCalloutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.xs,
  },
  flexOne: {
    flex: 1,
  },
  procedureCardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  inlineRoomSwitcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  roomChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  roomPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
  },
  roomPillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  procedureHandoffCard: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  procedureHandoffHeader: {
    gap: theme.spacing.xs,
  },
  procedureHandoffActionRow: {
    marginTop: theme.spacing.xs,
  },
  editInstructionsModalContent: {
    gap: theme.spacing.md,
  },
  editInstructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  instructionChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
  },
  instructionChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  orderedLabsList: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  orderedSectionTitle: {
    marginBottom: theme.spacing.xs,
  },
  orderedLabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  orderedLabMainCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  orderedLabHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  orderedLabNotes: {
    fontStyle: 'italic',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  queueToolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  queueSegmentedScroll: {
    maxWidth: '100%',
  },
  queueHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  callModalContent: {
    gap: theme.spacing.md,
  },
  roomOptionGroup: {
    gap: theme.spacing.xs,
  },
  roomOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  roomOptionCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  callModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  stack: {
    gap: theme.spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: theme.sizes.controlSm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  checkBox: {
    width: theme.sizes.iconMd,
    height: theme.sizes.iconMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.surface,
  },
  checkBoxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  queueSection: {
    gap: theme.spacing.sm,
  },
  patientRow: {
    gap: theme.spacing.sm,
  },
  vitalsBox: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.md,
  },
  vitalItem: {
    minWidth: 72,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
  panicBanner: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.emergencySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
    borderRadius: theme.radii.lg,
  },
  panicBannerAcknowledged: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.successBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radii.lg,
  },
  bannerCardError: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
  textArea: {
    minHeight: theme.sizes.controlLg + theme.sizes.controlLg,
    textAlignVertical: 'top',
  },
  diagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
  },
  diagDesc: {
    maxWidth: 240,
  },
  icdDropdown: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
  },
  icdNotice: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  icdItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  icdItemCode: {
    minWidth: 64,
  },
  icdFooter: {
    alignItems: 'flex-end',
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceMuted,
  },
  labCard: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
  labCardCritical: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
  findingsBox: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.emergencyBg,
    borderRadius: theme.radii.sm,
  },
  rxForm: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  fieldGrow: {
    flex: 1,
    minWidth: 160,
  },
  fieldNarrow: {
    width: 120,
  },
  fieldDispense: {
    width: 150,
  },
  rxCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
  cdsPassed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.successBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radii.md,
  },
  cdsAlert: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
  },
  overrideBox: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
    borderRadius: theme.radii.md,
  },
  issuedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
  },
  issuedRowSuccess: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  issuedRowPrimary: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  issuedRowDraft: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  draftDocNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
    backgroundColor: theme.colors.warningBg,
  },
  signedCard: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  modalFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  paper: {
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
  },
  paperHeader: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderDark,
  },
  paperTitle: {
    marginTop: theme.spacing.sm,
  },
  paperBox: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
  },
  signature: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
  },
  stationFilterScroll: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  stationFilterPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  stationFilterPillActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  statusFilterScroll: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  statusFilterPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  statusFilterPillActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  queuePatientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
  queuePatientChipSelected: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryDark,
  },
  queuePatientChipEmergency: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.emergency,
  },
  queuePatientChipUrgent: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.urgent,
  },
  procedureBayBanner: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  reEvalBanner: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  reEvalDetailsBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  splitScreenContainer: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    alignItems: 'flex-start',
    width: '100%',
  },
  leftChartPane: {
    flex: 0.42,
    minWidth: 360,
    gap: theme.spacing.md,
  },
  leftChartPaneExpanded: {
    flex: 1,
    width: '100%',
  },
  chartHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexShrink: 0,
  },
  objectiveHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  rightSoapPane: {
    flex: 0.58,
    minWidth: 440,
    gap: theme.spacing.md,
  },
  rightSoapPaneExpanded: {
    flex: 1,
    width: '100%',
  },
  splitPaneScroll: {
    flex: 1,
    width: '100%',
  },
  splitPaneScrollContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  soapContentColumn: {
    gap: theme.spacing.md,
    width: '100%',
  },
  mobileWorkstationContainer: {
    gap: theme.spacing.md,
    width: '100%',
  },
  mobileViewSwitcherContainer: {
    marginBottom: theme.spacing.xs,
  },
  longitudinalChartContainer: {
    gap: theme.spacing.md,
    width: '100%',
  },
  chartTabsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  chartTabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  chartTabButtonActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    ...theme.shadows.brandSubtle,
  },
  credentialBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  updateProfileRow: {
    marginTop: theme.spacing.xs,
    alignItems: 'flex-start',
  },
  procedureHandoffRow: {
    marginTop: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  homeInstructionsCard: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  presetsSection: {
    marginVertical: theme.spacing.xs,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: theme.sizes.controlSm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.full,
  },
  presetChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  presetChipText: {
    fontWeight: '600',
  },
  postEncounterContainer: {
    gap: theme.spacing.md,
  },
  postEncounterSuccessCard: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  postEncounterSuccessIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  postEncounterIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postEncounterSuccessText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  postEncounterInvoiceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radii.sm,
  },
  postEncounterNextQueueCard: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    gap: theme.spacing.sm,
  },
  postEncounterNextPatientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  postEncounterQueueBadge: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postEncounterNextPatientInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  postEncounterEmptyQueueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
  },
  postEncounterOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  docModeCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  docModeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rxPaperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pdeaWarningBox: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  pdeaWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  soaModalContent: {
    gap: theme.spacing.md,
  },
  soaHeaderNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  soaHeaderNoticeText: {
    flex: 1,
    gap: 2,
  },
  soaSectionTitle: {
    marginTop: theme.spacing.xs,
  },
  soaEmptyItemsBox: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  soaItemsTable: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  soaTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  soaTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  soaQtyStepper: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  soaQtyText: {
    minWidth: 20,
    textAlign: 'center',
  },
  soaPriceInputWrap: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.xs,
    height: 32,
    justifyContent: 'flex-end',
  },
  soaPriceInput: {
    flex: 1,
    textAlign: 'right',
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text,
    paddingVertical: 0,
  },
  soaRowTotal: {
    flex: 2,
    textAlign: 'right',
  },
  soaTotalsCard: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  soaTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  soaNetTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.xs,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
  },
  soaActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  soaActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  planManagementStack: {
    gap: theme.spacing.md,
  },
  planNotesDivider: {
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  preSignDraftStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
  },
  preSignDraftStatusSaving: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderLight,
  },
  preSignDraftStatusSaved: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  preSignDraftStatusError: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
});
