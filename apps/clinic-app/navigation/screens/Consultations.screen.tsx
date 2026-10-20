import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
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
  ExecutiveSummaryTab,
  EncountersTimelineTab,
  DiagnosticLabTab,
  NursingProceduresTab,
  StatutoryImmunizationsTab,
  HealthProfilesTab,
  ExternalDocumentVaultTab,
  AttachExternalDocumentModal,
  DentalChartTab,
} from '../../components/chart';
import type { DentalToothRecord } from '../../services/clinicService';
import EditPatientModal from '../../components/patient/EditPatientModal';
import { extractPhilHealthProfileData } from '../../components/patient/memberType';
import { formatLongAge } from '../../utils/age';
import { getSessionItem, setSessionItem, getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import {
  InlinePhysicalExamCard,
  DEFAULT_PHYSICAL_EXAM_NORMAL,
  PhysicalExamFindings,
  YakapClaimReadinessCard,
  StatutorySectionKey,
  RecordVitalsModal,
  OrderCatalogSearchModal,
  OrderCatalogItemPayload,
  InlineDentalChartCard,
  DentalToothState,
} from '../../components/consultation';
import { normalizeTeethToMultiRecord } from '../../components/dental';
import { usePhilHealthCatalog, usePhilHealthCatalogSearch } from '@utils/usePhilHealthCatalog';
import type { PhilHealthCatalogItem } from '@services/philHealthCatalogService';
import { useClinic } from '../../context/ClinicContext';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import { openDocument } from '../../services/documentOpener';
import {
  clinicService,
  computeScopedStations,
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
} from '../../services/clinicService';

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
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
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

export default function ConsultationsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { facilityName, accreditationNumber, letterhead, rooms = [], settings } = useClinic();
  const allowChipLevelCalling = Boolean(settings?.enableChipLevelQueueCalling);
  const { current, staff, reload: reloadStaff } = useStaff();

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
    | 'dental';
  const CHART_TAB_DESCRIPTIONS: Record<ChartReviewTab, string> = {
    summary: 'Executive clinical summary, problems, and vital trends',
    encounters: 'Timeline of historical clinical visits and SOAP documentation',
    diagnostics: 'Diagnostic laboratory orders, results, and specimen requisitions',
    procedures: 'Nursing procedures, treatments, and clinical interventions',
    immunizations: 'Statutory immunizations, schedules, and adverse events (AEFI)',
    profiles: 'Past medical history, surgical, social, and NCD risk profiles',
    vault: 'External document vault, outside imaging films, and clearances',
    dental: 'Odontogram findings, tooth condition, surfaces, and dental procedures',
  };
  const [activeChartTab, setActiveChartTab] = useState<ChartReviewTab>(() => {
    const saved = getSessionItem('clinicez_consultations_active_chart_tab') as ChartReviewTab | null;
    if (saved && ['summary', 'encounters', 'diagnostics', 'procedures', 'immunizations', 'profiles', 'vault', 'dental'].includes(saved)) {
      return saved;
    }
    return 'summary';
  });

  const handleSelectChartTab = (tab: ChartReviewTab) => {
    setActiveChartTab(tab);
    setSessionItem('clinicez_consultations_active_chart_tab', tab);
  };
  const [mobileWorkstationView, setMobileWorkstationView] = useState<'soap' | 'chart'>('soap');
  const [uploadDocModalVisible, setUploadDocModalVisible] = useState(false);
  const [postEncounterModalVisible, setPostEncounterModalVisible] = useState(false);
  const [createdInvoiceNumber, setCreatedInvoiceNumber] = useState<string | null>(null);
  const [createdInvoiceTotal, setCreatedInvoiceTotal] = useState<number | null>(null);

  // Multi-Provider Queue Room / Station & Status Filter States (Persistent per staff)
  const staffKey = current?.id ? `clinicez:consultations:${current.id}` : 'clinicez:consultations:default';

  const [queueViewFilter, setQueueViewFilter] = useState<QueueView>(() => {
    const saved = getDeviceItem(`${staffKey}:queueView`);
    return saved === 'WaitingForDoctor' || saved === 'MyRoom' || saved === 'PendingProcedure' || saved === 'Completed' || saved === 'All'
      ? saved
      : 'WaitingForDoctor';
  });
  const [selectedStationFilter, setSelectedStationFilter] = useState<string>(() => {
    return getDeviceItem(`${staffKey}:station`) || 'ALL';
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
    return displayedPatients.find((p) => eligibleStatuses.includes(p.status));
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

  const handleJumpToSection = (section: StatutorySectionKey) => {
    if (section === 'vitals') {
      setRecordVitalsModalVisible(true);
    }
    if (mobileWorkstationView !== 'soap') {
      setMobileWorkstationView('soap');
    }
    const rawY = sectionOffsets.current[section];
    if (rawY != null) {
      const isSpineSection = section === 'patient-pin' || section === 'vitals';
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

  const handleDentalChartChange = useCallback((nextChart: Record<number, any>) => {
    setDentalChart(nextChart as any);
    // Immediately synchronize left-pane patientChart.dentalTeeth
    setPatientChart((prev) => {
      if (!prev) return prev;
      const targetPatientId = selectedPatient?.patientId || patientRecord?.id || '';
      const multiMap = normalizeTeethToMultiRecord(nextChart as any);
      const syncedTeeth: DentalToothRecord[] = Object.values(multiMap).flat().map((rec) => ({
        ...rec,
        tenantId: rec.tenantId || settings?.tenantId || (patientRecord as any)?.tenantId || '',
        clinicId: rec.clinicId || settings?.clinicId || (patientRecord as any)?.clinicId || '',
        patientId: targetPatientId,
        notes: rec.notes || null,
        surface: rec.surface || null,
      }));
      return {
        ...prev,
        dentalTeeth: syncedTeeth,
      };
    });
  }, [selectedPatient?.patientId, patientRecord?.id, settings?.tenantId, settings?.clinicId]);
  const [editingOrderItem, setEditingOrderItem] = useState<EditingOrderItemState | null>(null);
  const [editingInstructionText, setEditingInstructionText] = useState<string>('');
  const [isHandoffSending, setIsHandoffSending] = useState<boolean>(false);
  const [orderSearchModalVisible, setOrderSearchModalVisible] = useState(false);
  const [orderSearchInitialCategory, setOrderSearchInitialCategory] = useState<'Diagnostic' | 'Procedure' | 'Dental' | 'All'>('All');
  const [editPatientModalVisible, setEditPatientModalVisible] = useState(false);
  const [recordVitalsModalVisible, setRecordVitalsModalVisible] = useState(false);

  // New Prescription Form State
  const [showAddRx, setShowAddRx] = useState(false);
  const [newRxGeneric, setNewRxGeneric] = useState('');
  const [newRxDosage, setNewRxDosage] = useState('');
  const [newRxForm, setNewRxForm] = useState('Tablet');
  const [newRxSig, setNewRxSig] = useState('');
  const [newRxQuantity, setNewRxQuantity] = useState('30');
  const [newRxDangerous, setNewRxDangerous] = useState(false);
  const [newRxDrugCode, setNewRxDrugCode] = useState<string>('');

  // PhilHealth Yakap Tagging & Statutory Mapping State
  const [isYakapEligible, setIsYakapEligible] = useState<boolean>(false);
  const [philHealthAtc, setPhilHealthAtc] = useState<string>('WALKEDIN');
  const [selectedSymptomCodes, setSelectedSymptomCodes] = useState<string[]>([]);
  const [symptomOtherDesc, setSymptomOtherDesc] = useState<string>('');
  const [symptomPainSite, setSymptomPainSite] = useState<string>('');

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
  const painSymptomCode = symptoms.find((s) => isCatalogTerm(s, 'pain'))?.code;
  const otherSymptomCode = symptoms.find((s) => isCatalogTerm(s, 'others'))?.code;
  const painSymptomSelected = Boolean(painSymptomCode && selectedSymptomCodes.includes(painSymptomCode));
  const otherSymptomSelected = Boolean(otherSymptomCode && selectedSymptomCodes.includes(otherSymptomCode));

  // Sign & Sync Status
  const [isSigning, setIsSigning] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [isFollowUpEncounter, setIsFollowUpEncounter] = useState(false);
  const [banner, setBanner] = useState<{ text: string; isError?: boolean } | null>(null);

  const handleToggleSymptom = (symptom: StatutorySymptom) => {
    if (isSigned) return;
    const exists = selectedSymptomCodes.includes(symptom.code);
    let updated: string[];
    if (exists) {
      updated = selectedSymptomCodes.filter((c) => c !== symptom.code);
    } else {
      updated = [...selectedSymptomCodes, symptom.code];
      // When selected, automatically seed/append into the free-text subjective narrative.
      if (!subjective.trim()) {
        setSubjective(`${symptom.name}, `);
      } else if (!subjective.toLowerCase().includes(symptom.name.toLowerCase())) {
        const separator = subjective.endsWith(',') || subjective.endsWith('.') ? ' ' : ', ';
        setSubjective((prev) => `${prev.trim()}${separator}${symptom.name}`);
      }
    }
    setSelectedSymptomCodes(updated);
  };

  // PhilHealth medicine lookup for a new medication order (thousands of rows, searched on the server).
  const [rxCatalogQuery, setRxCatalogQuery] = useState('');
  const rxCatalogSearch = usePhilHealthCatalogSearch('lib_medicine', isYakapEligible && showAddRx ? rxCatalogQuery : '', { take: 15 });

  const handleSelectPhilHealthMedicine = (item: PhilHealthCatalogItem) => {
    setNewRxGeneric(item.description);
    setNewRxDrugCode(item.code);
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
    setNewRxGeneric(item.name);
    if (item.philHealthCode) {
      setNewRxDrugCode(item.philHealthCode);
    }
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
  useEffect(() => {
    setDoctorPrc(signerPrc);
    setDoctorPtr(signerPtr);
    setDoctorS2(signerS2);
    setDoctorPan(signerPan);
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
    if (signedConsultationId) {
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
      patientGender: patientRecord.gender,
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
    const [cert, certErr] = await clinicService.issueMedicalCertificate({
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
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
    setIssuedMedCert(cert);
    setMedCertModalVisible(false);
    setPreviewType('MEDCERT');
    setPreviewDocModal(true);
  };

  const handleIssueReferral = async () => {
    if (!selectedPatient) return;
    const doctor = requireSigner();
    if (!doctor) return;
    if (!refFacility.trim() || !refDepartment.trim()) {
      Alert.alert('Incomplete referral', 'Enter the receiving facility and department / specialty.');
      return;
    }
    const diagnosis = primaryDiagnosisText();
    const summary = refSummary.trim() || subjective.trim();
    if (!diagnosis || !summary || !refReason.trim()) {
      Alert.alert(
        'Incomplete referral',
        'Enter the reason for referral, a clinical summary (or subjective notes) and an assessment before issuing.',
      );
      return;
    }
    setIssuingReferral(true);
    const [ref, refErr] = await clinicService.issueReferralLetter({
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
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
    setIssuedReferral(ref);
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
    setContextLoading(true);
    const [triageRes, recordRes, labRes, chartRes, dentalRes] = await Promise.all([
      clinicService.getTriage(p.id),
      clinicService.getPatientById(p.patientId),
      clinicService.getLabOrders(p.patientId),
      clinicService.getPatientChart(p.patientId),
      clinicService.getPatientDentalChart(p.patientId),
    ]);
    if (activePatientId.current !== p.id) return;

    const [dentalData] = dentalRes;
    if (dentalData?.teeth && dentalData.teeth.length > 0) {
      setDentalChart(normalizeTeethToMultiRecord(dentalData.teeth));
    } else {
      setDentalChart({});
    }

    const [triageData, triageErr] = triageRes;
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

    const [chartData] = chartRes;
    if (chartData) {
      setPatientChart(chartData);
      const existingEncounter = chartData.consultations?.find((c) => c.queueItemId === p.id);
      if (existingEncounter) {
        setSignedConsultationId(existingEncounter.id);
        setIsSigned(Boolean(existingEncounter.isSigned));
        setSignedAt(
          existingEncounter.signedAt
            ? new Date(existingEncounter.signedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : null,
        );
        if (existingEncounter.subjective) setSubjective(existingEncounter.subjective);
        if (existingEncounter.objective) setObjective(existingEncounter.objective);
        if (existingEncounter.assessment) setAssessment(existingEncounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncounter.plan);
        if (existingEncounter.homeInstructions) setHomeInstructions(existingEncounter.homeInstructions);
        if (existingEncounter.diagnoses?.length) {
          setSelectedDiagnoses(
            existingEncounter.diagnoses.map((d) => ({
              icd10Code: d.icd10Code,
              description: d.description,
              isPrimary: d.isPrimary,
            })),
          );
        }
        if (existingEncounter.prescriptions?.length) {
          setPrescriptions(
            existingEncounter.prescriptions.map((rx) => ({
              id: rx.id,
              genericName: rx.genericName,
              dosage: rx.dosage,
              form: rx.form,
              sig: rx.sig,
              quantity: rx.quantity,
              durationDays: rx.durationDays,
              isDangerousDrug: rx.isDangerousDrug,
              philHealthDrugCode: rx.philHealthDrugCode,
            })),
          );
        }
        if (existingEncounter.isYakapEligible != null) {
          setIsYakapEligible(existingEncounter.isYakapEligible);
        }
        if (existingEncounter.philHealthAtc) {
          setPhilHealthAtc(existingEncounter.philHealthAtc);
        }
        if (existingEncounter.philHealthSignSympCode) {
          setSelectedSymptomCodes(
            existingEncounter.philHealthSignSympCode
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }
        if (existingEncounter.philHealthOtherComplaint) {
          setSymptomOtherDesc(existingEncounter.philHealthOtherComplaint);
        }
        if (existingEncounter.philHealthPainSite) {
          setSymptomPainSite(existingEncounter.philHealthPainSite);
        }
        if (existingEncounter.physicalExamFindingsJson) {
          try {
            const parsedPe = JSON.parse(existingEncounter.physicalExamFindingsJson);
            if (parsedPe && typeof parsedPe === 'object') {
              setPhysicalExamFindings((prev) => ({ ...prev, ...parsedPe }));
            }
          } catch {
            // Keep default PE findings on malformed JSON
          }
        }

        // Rehydrate orderedLabs from invoice diagnostic items (in-house) and lab orders (outside)
        const rehydratedLabs: LocalLabOrder[] = [];
        const existingInvoice = chartData.invoicesHistory?.find(
          (inv) =>
            (existingEncounter.id && inv.consultationId === existingEncounter.id) ||
            (p.id && inv.queueItemId === p.id)
        );

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

        const existingLabOrders = chartData.labOrdersHistory?.filter(
          (lo) =>
            (existingEncounter.id && lo.consultationId === existingEncounter.id) ||
            (p.id && (lo as any).queueItemId === p.id)
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

        // Rehydrate orderedProcedures from proceduresHistory and invoice line items
        const existingProcedures = chartData.proceduresHistory?.filter(
          (proc) =>
            (existingEncounter.id && proc.consultationId === existingEncounter.id) ||
            (p.id && proc.queueItemId === p.id)
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
                serviceItemId: matchedCatalog?.id,
                code: pr.procedureCode || matchedCatalog?.code,
                name: pr.procedureName,
                category: pr.category || matchedCatalog?.category || 'Procedure',
                standardPrice: matchedCatalog?.standardPrice ?? 0,
                instructions: pr.clinicalNotes || undefined,
                targetRoomId: pr.targetRoomId || undefined,
                targetRoomName: pr.targetRoomName || undefined,
                isHandedOff: true,
                handedOffAt: pr.scheduledAt
                  ? new Date(pr.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : undefined,
                toothNumber: pr.toothNumber ?? undefined,
                toothSurface: pr.toothSurface ?? undefined,
              });
            }
          }
        }

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

        setOrderedProcedures(rehydratedProcs);
      }
    } else {
      setPatientChart(null);
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
    setIsSigned(false);
    setSignedAt(null);
    setIsFollowUpEncounter(false);
    setBanner(null);
    setSubjective(p.chiefComplaint ? `Patient presents with: ${p.chiefComplaint}.` : '');
    setObjective('');
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
    setIsYakapEligible(false);
    setPhilHealthAtc('WALKEDIN');
    setPhysicalExamFindings({ ...DEFAULT_PHYSICAL_EXAM_NORMAL });
    setCreatedInvoiceNumber(null);
    setCreatedInvoiceTotal(null);
    setPostEncounterModalVisible(false);
  };

  const handleStartFollowUpEncounter = () => {
    if (!selectedPatient) return;
    setIsSigned(false);
    setSignedAt(null);
    setSignedConsultationId(null);
    setIsFollowUpEncounter(true);
    setBanner(null);
    setSubjective(selectedPatient.chiefComplaint ? `Follow-up: ${selectedPatient.chiefComplaint}.` : '');
    setObjective('');
    setAssessment('');
    setPlan('');
    setHomeInstructions('');
    setSelectedDiagnoses([]);
    setPrescriptions([]);
    setOrderedLabs([]);
    setOrderedProcedures([]);
    setSelectedSymptomCodes([]);
    setSymptomOtherDesc('');
    setSymptomPainSite('');
    setPrescriptionSlip(null);
  };

  const handleSelectPatient = (p: PatientQueueItem) => {
    if (p.id === selectedPatient?.id) return;
    setSelectedPatient(p);
    resetEncounter(p);
    loadPatientContext(p);
  };

  useEffect(() => {
    const params = route.params as { queueId?: string; queueItemId?: string; patientId?: string } | undefined;
    const targetQueueId = params?.queueId ?? params?.queueItemId;
    const key = `${targetQueueId ?? ''}|${params?.patientId ?? ''}`;
    if (key === '|' || appliedRouteKey.current === key) return;
    const target = targetQueueId
      ? patients.find((x) => x.id === targetQueueId)
      : patients.find((x) => x.patientId === params?.patientId);
    if (target) {
      appliedRouteKey.current = key;
      handleSelectPatient(target);
    }
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

  const runCdsScreening = async (currentPrescriptions: LocalPrescription[]) => {
    if (!selectedPatient) return;
    if (currentPrescriptions.length === 0) {
      setCdsAlerts([]);
      setCdsUsedLocalRules(false);
      setShowOverrideInput(false);
      setOverrideConfirmed(false);
      return;
    }
    const patId = selectedPatient.patientId;
    const allergies = patientRecord?.allergies ?? '';

    // Extract latest renal & electrolyte lab values from recent orders if available
    let latestCreatinine: number | undefined;
    let latestEgfr: number | undefined;
    let latestPotassium: number | undefined;

    for (const ord of labOrders) {
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
        } else {
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
    } else {
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

  const handleOpenLabPdf = (orderOrId: ClinicLabOrderRecord | string) => {
    const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId.id;
    const found = typeof orderOrId === 'string' ? labOrders.find((o) => o.id === orderOrId) : orderOrId;
    const url = clinicService.getLabReportPdfUrl(orderId);
    openDocument(url).then((opened) => {
      if (!opened) throw new Error('Could not open the document');
    }).catch(() => {
      Alert.alert(
        'Could not open the PDF report',
        [
          `Accession #${found?.orderNumber ?? orderId.slice(0, 8)}`,
          found?.verifiedByPathologist ? `Verified by: ${found.verifiedByPathologist}` : null,
          found?.pathologistImpression ? `Pathologist impression:\n${found.pathologistImpression}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
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

  const handleRemoveProcedure = (procName: string, toothNumber?: number) => {
    if (isSigned) return;
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
    const newRx: LocalPrescription = {
      id: `rx-${Date.now()}`,
      genericName: newRxGeneric.trim(),
      dosage: newRxDosage.trim(),
      form: newRxForm.trim() || 'Tablet',
      sig: newRxSig.trim(),
      quantity: parseInt(newRxQuantity, 10) || 30,
      isDangerousDrug: newRxDangerous,
      philHealthDrugCode: newRxDrugCode.trim() || undefined,
    };
    const updated = [...prescriptions, newRx];
    setPrescriptions(updated);
    runCdsScreening(updated);
    setNewRxGeneric('');
    setNewRxDosage('');
    setNewRxSig('');
    setNewRxQuantity('30');
    setNewRxDangerous(false);
    setNewRxDrugCode('');
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

    let consultationId = signedConsultationId;
    if (!consultationId) {
      const [consultation, createErr] = await clinicService.createConsultation({
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        doctorId: doctor.id,
        doctorName: doctor.name,
        queueItemId: isFollowUpEncounter ? undefined : selectedPatient.id,
        appointmentId: selectedPatient.appointmentId,
        subjective,
        objective,
        assessment,
        plan,
        homeInstructions: homeInstructions.trim() || undefined,
        isYakapEligible,
        philHealthSignSympCode: isYakapEligible ? selectedSymptomCodes.join(',') : undefined,
        philHealthOtherComplaint: isYakapEligible && otherSymptomSelected ? symptomOtherDesc || subjective : undefined,
        philHealthPainSite: isYakapEligible && painSymptomSelected ? symptomPainSite : undefined,
        doctorPhilHealthPan: isYakapEligible ? (doctorPan.trim() || signerStaff?.philHealthPan) : undefined,
        philHealthAtc: isYakapEligible ? (philHealthAtc.trim() || 'WALKEDIN') : undefined,
        generalSurveyId: isYakapEligible ? (physicalExamFindings.generalSurveyId || (physicalExamFindings.generalSurvey === 'Normal' ? '1' : '2')) : undefined,
        generalSurveyRemarks: isYakapEligible ? physicalExamFindings.generalSurveyRemarks : undefined,
        physicalExamFindingsJson: isYakapEligible ? JSON.stringify(physicalExamFindings) : undefined,
        diagnoses: selectedDiagnoses.map((d) => ({
          icd10Code: d.icd10Code,
          description: d.description,
          isPrimary: d.isPrimary,
        })),
        prescriptions: prescriptions.map((p) => ({
          genericName: p.genericName,
          dosage: p.dosage,
          form: p.form,
          sig: p.sig,
          quantity: p.quantity,
          isDangerousDrug: p.isDangerousDrug,
          philHealthDrugCode: p.philHealthDrugCode,
        })),
      });
      if (createErr || !consultation?.id) {
        setIsSigning(false);
        const msg = createErr?.message || 'The encounter could not be saved, so nothing was signed. Please try again.';
        setBanner({
          text: msg,
          isError: true,
        });
        notify.error(msg, { traceId: createErr?.traceId });
        return;
      }
      consultationId = consultation.id;
      setSignedConsultationId(consultation.id);
    } else {
      const [, updateErr] = await clinicService.updateConsultation(consultationId, {
        subjective,
        objective,
        assessment,
        plan,
        homeInstructions: homeInstructions.trim() || undefined,
        isYakapEligible,
        philHealthSignSympCode: isYakapEligible ? selectedSymptomCodes.join(',') : undefined,
        philHealthOtherComplaint: isYakapEligible && otherSymptomSelected ? symptomOtherDesc || subjective : undefined,
        philHealthPainSite: isYakapEligible && painSymptomSelected ? symptomPainSite : undefined,
        doctorPhilHealthPan: isYakapEligible ? (doctorPan.trim() || signerStaff?.philHealthPan) : undefined,
        philHealthAtc: isYakapEligible ? (philHealthAtc.trim() || 'WALKEDIN') : undefined,
        generalSurveyId: isYakapEligible ? (physicalExamFindings.generalSurveyId || (physicalExamFindings.generalSurvey === 'Normal' ? '1' : '2')) : undefined,
        generalSurveyRemarks: isYakapEligible ? physicalExamFindings.generalSurveyRemarks : undefined,
        physicalExamFindingsJson: isYakapEligible ? JSON.stringify(physicalExamFindings) : undefined,
        diagnoses: selectedDiagnoses.map((d) => ({
          icd10Code: d.icd10Code,
          description: d.description,
          isPrimary: d.isPrimary,
        })),
        prescriptions: prescriptions.map((p) => ({
          genericName: p.genericName,
          dosage: p.dosage,
          form: p.form,
          sig: p.sig,
          quantity: p.quantity,
          isDangerousDrug: p.isDangerousDrug,
          philHealthDrugCode: p.philHealthDrugCode,
        })),
      });
      if (updateErr) {
        setIsSigning(false);
        const msg = updateErr.message || 'The encounter could not be updated before signing. Please try again.';
        setBanner({
          text: msg,
          isError: true,
        });
        notify.error(msg, { traceId: updateErr.traceId });
        return;
      }
    }

    const [, signErr] = await clinicService.signConsultation(consultationId, {
      prcLicenseNumber: finalPrc,
      ptrNumber: doctorPtr.trim() || signerStaff?.ptrNumber,
      s2LicenseNumber: finalS2,
      doctorPhilHealthPan: finalPan,
      philHealthAtc: isYakapEligible ? (philHealthAtc.trim() || 'WALKEDIN') : undefined,
    });
    if (signErr) {
      setIsSigning(false);
      const msg = `The encounter was saved but could not be signed: ${signErr.message || 'unknown error'}. Press Sign again to retry.`;
      setBanner({
        text: msg,
        isError: true,
      });
      notify.error(msg, { traceId: signErr.traceId });
      return;
    }

    if (prescriptions.length > 0) {
      const [slip] = await clinicService.getPrescriptionSlip(consultationId);
      if (slip) {
        setPrescriptionSlip(slip);
      }
    }

    const followUpIssues: string[] = [];

    // Partition orderedLabs into Outside Laboratory orders vs In-House Clinic tests
    const outsideLabs = orderedLabs.filter((l) => l.fulfillmentMode === 'outside');
    const inHouseLabs = orderedLabs.filter((l) => l.fulfillmentMode === 'in_house');

    // Auto-create Diagnostic Lab Requisitions ONLY for outside labs
    if (outsideLabs.length > 0) {
      const [, labErr] = await clinicService.createLabOrder({
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        consultationId,
        orderedByDoctorId: doctor.id,
        orderedByDoctorName: doctor.name,
        clinicalDiagnosis: assessment,
        items: outsideLabs.map((l) => ({
          testName: l.name,
          category: l.category || (diagnosticCatalog.find((d) => d.name === l.name)?.category ?? 'Diagnostic'),
          instructions: l.instructions,
        })),
      });
      if (labErr) followUpIssues.push('laboratory requisition');
    }

    // Auto-order in-clinic procedures for the nursing station (only those not yet handed off)
    const targetTreatmentRoom =
      treatmentRooms.find((r) => r.id === selectedTreatmentRoomId) ?? treatmentRooms[0];
    for (const proc of orderedProcedures) {
      if (!proc.isHandedOff) {
        const procInfo = procedureCatalog.find(
          (p) => p.name.toLowerCase() === proc.name.toLowerCase() || (p.code && p.code === proc.code)
        );
        const [, procErr] = await clinicService.orderProcedure({
          patientId: selectedPatient.patientId,
          patientName: selectedPatient.patientName,
          queueItemId: selectedPatient.id,
          consultationId,
          procedureCode: proc.code || procInfo?.code,
          procedureName: proc.name,
          category: proc.category || procInfo?.category || 'Procedure',
          orderedByDoctorId: doctor.id,
          orderedByDoctorName: doctor.name,
          targetRoomId: proc.targetRoomId || targetTreatmentRoom?.id,
          targetRoomName: proc.targetRoomName || targetTreatmentRoom?.name,
          toothNumber: proc.toothNumber,
          toothSurface: proc.toothSurface,
          clinicalNotes: proc.instructions
            ? `${proc.instructions} (Assessment: ${assessment || 'Evaluation'})`
            : `Ordered during encounter for ${assessment || 'Evaluation'}`,
        });
        if (procErr) followUpIssues.push(`procedure order (${proc.name})`);
      }
    }

    // Atomic batch save dental chart on encounter signing when dental is enabled and teeth have been marked
    if (isDentalEnabled && Object.keys(dentalChart).length > 0) {
      const multiMap = normalizeTeethToMultiRecord(dentalChart as any);
      const teethPayload = Object.values(multiMap).flat().map((rec) => ({
        toothNumber: rec.toothNumber,
        status: rec.status,
        surface: rec.surface || undefined,
        notes: rec.notes || undefined,
      }));
      const [, dentalErr] = await clinicService.batchSaveDentalChart(selectedPatient.patientId, {
        consultationId,
        teeth: teethPayload,
      });
      if (dentalErr) followUpIssues.push('dental chart records');
    }

    // Auto-create draft billing invoice for the Cashier, priced from the clinic's fee schedule
    const billItems: CreateInvoiceRequest['lineItems'] = [];
    if (consultationFee) {
      billItems.push({
        serviceItemId: consultationFee.id,
        itemCode: consultationFee.code,
        description: consultationFee.name,
        category: consultationFee.category,
        unitPrice: consultationFee.standardPrice,
        quantity: 1,
      });
    }
    for (const proc of orderedProcedures) {
      const procInfo = procedureCatalog.find(
        (p) => p.name.toLowerCase() === proc.name.toLowerCase() || (p.code && p.code === proc.code)
      );
      billItems.push({
        serviceItemId: proc.serviceItemId || procInfo?.id,
        itemCode: proc.code || procInfo?.code,
        description: proc.name,
        category: proc.category || procInfo?.category || 'Procedure',
        unitPrice: proc.standardPrice || procInfo?.standardPrice || 0,
        quantity: 1,
      });
    }
    for (const inHouseLab of inHouseLabs) {
      const matchedDiag = diagnosticCatalog.find((d) => d.name.toLowerCase() === inHouseLab.name.toLowerCase());
      const philHealthCode = inHouseLab.philHealthCode || matchedDiag?.philHealthCode;
      const isCoveredByYakap = Boolean(isYakapEligible && philHealthCode);
      const unitPrice = isCoveredByYakap ? 0 : (inHouseLab.standardPrice ?? matchedDiag?.standardPrice ?? 0);
      const description = isCoveredByYakap
        ? `${inHouseLab.name} (PhilHealth Yakap - ₱0 Co-pay)`
        : inHouseLab.name;

      billItems.push({
        serviceItemId: inHouseLab.serviceItemId || matchedDiag?.id,
        itemCode: inHouseLab.code || matchedDiag?.code,
        description,
        category: inHouseLab.category || matchedDiag?.category || 'Diagnostic',
        unitPrice,
        quantity: 1,
      });
    }
    if (billItems.length > 0) {
      const [invoiceResult, invoiceErr] = await clinicService.createInvoice({
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        queueItemId: selectedPatient.id,
        consultationId,
        attendingDoctorId: doctor.id,
        attendingDoctorName: doctor.name,
        discountType: 'None',
        notes: 'Consultation & procedures bill forwarded to Cashier',
        lineItems: billItems,
      });
      if (invoiceErr) {
        followUpIssues.push('billing invoice');
      } else if (invoiceResult) {
        setCreatedInvoiceNumber(invoiceResult.invoiceNumber);
        setCreatedInvoiceTotal(invoiceResult.netAmount);
      }
    } else {
      followUpIssues.push('billing invoice (no consultation fee is set in the fee schedule)');
    }

    // Complete queue item
    const [, completeErr] = await clinicService.completeQueueItem(selectedPatient.id);
    if (completeErr) followUpIssues.push('queue status update');

    // Update local state immediately and refetch queue in background
    setSelectedPatient((prev) => (prev ? { ...prev, status: 'Completed' } : null));
    setPatients((prev) =>
      prev.map((p) => (p.id === selectedPatient.id ? { ...p, status: 'Completed' } : p))
    );
    loadQueue().catch(() => {});

    setIsSigning(false);
    setIsSigned(true);
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setSignedAt(nowStr);
    if (followUpIssues.length > 0) {
      const warnMsg = `Encounter signed by ${doctor.name} at ${nowStr}, but these steps did not complete: ${followUpIssues.join(', ')}. Please redo them from the relevant station.`;
      setBanner({
        text: warnMsg,
        isError: true,
      });
      notify.error(warnMsg);
    } else {
      const successMsg = `Encounter signed by ${doctor.name} (${finalPrc}) at ${nowStr}. Lab requisitions, nursing orders and the cashier invoice were forwarded.`;
      setBanner({
        text: successMsg,
        isError: false,
      });
      notify.success(successMsg);
    }
    setPostEncounterModalVisible(true);
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

  const philHealthEligibility = useMemo(() => {
    if (!patientRecord) {
      return { canToggle: false, reason: 'Patient record loading' };
    }
    const pin = (
      patientRecord.philHealthNumber ||
      (patientRecord as any).pin ||
      patientChart?.demographics?.philHealthNumber ||
      ''
    ).trim();
    if (!pin) {
      return { canToggle: false, reason: 'Missing PhilHealth PIN' };
    }
    const phProfile = extractPhilHealthProfileData(patientRecord.customFields, patientRecord);
    if (phProfile.memberType === 'DD') {
      if (!phProfile.principalFullName?.trim() || !phProfile.principalPin?.trim()) {
        return { canToggle: false, reason: 'Dependent missing sponsor details' };
      }
    }
    return { canToggle: true, reason: null };
  }, [patientRecord, patientChart?.demographics?.philHealthNumber]);

  const latestExecutedProcedure = useMemo(() => {
    const list = patientChart?.proceduresHistory || [];
    return list.find((p) => p.status === 'Completed') || list[0] || null;
  }, [patientChart?.proceduresHistory]);

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

  const handleImportPostProcedureVitals = (proc?: ClinicalProcedureRecord | null) => {
    if (!proc) return;
    const postStr = `\nPost-${proc.procedureName} Vitals: ${formatProcedureVitals(proc.postProcedureVitalsJson)}. Nurse Notes: ${proc.clinicalNotes || 'Tolerated well'}. Complications: ${proc.complications || 'None'}.`;
    setObjective((prev) => (prev ? `${prev.trim()}${postStr}` : postStr.trim()));
    notify.success('Imported post-procedure findings into Objective notes.');
  };

  const handleHandoffAllProcedures = async () => {
    if (!selectedPatient) return;
    const doctor = requireSigner();
    if (!doctor) return;

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
    const errors: string[] = [];
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
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        queueItemId: selectedPatient.id,
        consultationId: signedConsultationId || undefined,
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
              status: 'PendingProcedure',
              roomId: defaultTargetRoom?.id,
              roomOrStation: defaultResolvedName,
            }
          : null
      );
      notify.success(
        `${unhandedOff.length} in-clinic procedure${unhandedOff.length > 1 ? 's' : ''} handed off to ${defaultResolvedName}.`
      );
      loadQueue();
    }
  };

  const handleHandoffToTreatmentRoom = async (procedureName: string, toothNumber?: number) => {
    if (!selectedPatient) return;
    const doctor = requireSigner();
    if (!doctor) return;
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
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      queueItemId: selectedPatient.id,
      consultationId: signedConsultationId || undefined,
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
            }
          : item
      )
    );
    setSelectedPatient((prev) =>
      prev
        ? {
            ...prev,
            status: 'PendingProcedure',
            roomId: finalRoomId,
            roomOrStation: finalRoomName,
          }
        : null,
    );
    notify.success(`${procedureName} ordered. Patient routed to ${finalRoomName}.`);
    loadQueue();
  };

  const patientAgeString = patientRecord?.dateOfBirth
    ? formatLongAge(patientRecord.dateOfBirth)
    : (patientRecord ? `${patientRecord.age} yrs` : null);

  const patientMeta = selectedPatient
    ? [
        `Ticket ${selectedPatient.queueNumber}`,
        patientRecord ? `${patientAgeString ? `${patientAgeString}, ` : ''}${patientRecord.gender}` : null,
        selectedPatient.chiefComplaint ? `Chief complaint: ${selectedPatient.chiefComplaint}` : null,
      ]
        .filter(Boolean)
        .join(' • ')
    : '';
  const allergiesText = patientRecord?.allergies?.trim();

  const docSignature =
    previewType === 'MEDCERT'
      ? {
          name: issuedMedCert?.doctorName,
          prc: issuedMedCert?.prcLicenseNumber,
          ptr: issuedMedCert?.ptrNumber,
          signed: issuedMedCert?.isSigned,
        }
      : {
          name: issuedReferral?.referringDoctorName,
          prc: doctorPrc || undefined,
          ptr: doctorPtr || undefined,
          signed: issuedReferral?.isSigned,
        };

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
        title="Laboratory reports"
        icon="lab"
        subtitle="Verified findings from the laboratory information system"
      />
      {labError ? (
        <ErrorState
          compact
          title="Unable to load laboratory reports"
          message={labError}
          onRetry={() => selectedPatient && loadPatientContext(selectedPatient)}
        />
      ) : contextLoading && labOrders.length === 0 ? (
        <SkeletonList rows={2} />
      ) : labOrders.length === 0 ? (
        <ThemedText variant="small" color={theme.colors.textMuted}>
          No laboratory reports on file for this patient.
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
                        variant={isFinal ? 'success' : 'neutral'}
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
                    title="PDF report"
                    icon="file"
                    variant="outline"
                    size="sm"
                    onPress={() => handleOpenLabPdf(order.id)}
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
    const rejectionReason = !isApproved
      ? (userRejectionReason?.trim() || 'Document illegible or missing official physician signature/stamp.')
      : undefined;
    const [, verifyErr] = await clinicService.verifyRecordAttachment(attachmentId, isApproved, rejectionReason);
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
                verifiedByStaffName: signerName || 'Attending Physician',
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

  // Dedicated lightweight chart refresh that does not re-initialize encounter state or trigger skeleton states
  const refreshPatientChart = useCallback(async (explicitPatientId?: string) => {
    const patientId = explicitPatientId || selectedPatient?.patientId || patientRecord?.id;
    if (!patientId) return;
    const [chartData, chartErr] = await clinicService.getPatientChart(patientId);
    if (!chartErr && chartData) {
      if (!chartData.dentalTeeth || chartData.dentalTeeth.length === 0) {
        const [dentalData] = await clinicService.getPatientDentalChart(patientId);
        if (dentalData?.teeth && dentalData.teeth.length > 0) {
          chartData.dentalTeeth = dentalData.teeth;
          chartData.dentalChart = dentalData;
        }
      }
      setPatientChart(chartData);
      if (chartData.dentalTeeth && chartData.dentalTeeth.length > 0 && Object.keys(dentalChart).length === 0) {
        const multiMap = normalizeTeethToMultiRecord(chartData.dentalTeeth);
        setDentalChart(multiMap);
      }
    }
  }, [selectedPatient?.patientId, patientRecord?.id, dentalChart]);

  // Specialized refresh for Diagnostics tab that reloads chart + lab orders without touching encounter SOAP
  const refreshDiagnosticsTab = useCallback(async () => {
    const patientId = selectedPatient?.patientId || patientRecord?.id;
    if (!patientId) return;
    const [chartRes, labRes] = await Promise.all([
      clinicService.getPatientChart(patientId),
      clinicService.getLabOrders(patientId),
    ]);
    const [chartData] = chartRes;
    if (chartData) setPatientChart(chartData);
    const [labData, labErr] = labRes;
    if (!labErr && labData) setLabOrders(labData);
  }, [selectedPatient?.patientId, patientRecord?.id]);

  const renderLongitudinalChartContent = () => (
    <View style={styles.longitudinalChartContainer}>
      <Card>
        <CardHeader
          title="Patient Chart"
          subtitle={CHART_TAB_DESCRIPTIONS[activeChartTab] || 'Historical clinical chart & records'}
          icon="folder"
          truncateTitle
          truncateSubtitle
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartTabsRow}>
          {[
            { id: 'summary', label: 'Summary', icon: 'file' },
            { id: 'encounters', label: 'Encounters', icon: 'clock' },
            { id: 'diagnostics', label: 'Diagnostics', icon: 'lab' },
            { id: 'procedures', label: 'Procedures', icon: 'activity' },
            { id: 'immunizations', label: 'Immunizations', icon: 'shield' },
            { id: 'profiles', label: 'Profiles', icon: 'user' },
            { id: 'vault', label: 'Vault', icon: 'folder' },
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
        />
      )}
      {activeChartTab === 'procedures' && (
        <NursingProceduresTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          procedures={patientChart?.proceduresHistory || []}
          onRefreshChart={refreshPatientChart}
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
      {activeChartTab === 'dental' && (
        <DentalChartTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId || patientRecord?.id}
          chart={patientChart}
          onOrderProcedure={(toothNumber, surface) => {
            handleQuickOrderDentalProcedure(toothNumber, surface);
          }}
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

            {/* Dual-Mode Consultation Workstation Header */}
            {!isYakapEligible ? (
              /* Standard Clinical Encounter: 100% Free of PhilHealth Bureaucracy */
              <View onLayout={(e) => { sectionOffsets.current['atc'] = e.nativeEvent.layout.y; }}>
                <Card>
                  <View style={styles.dualModeSwitcher}>
                    <View style={styles.flex}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                        <Icon name="activity" size={theme.sizes.iconSm} color={theme.colors.primary} />
                        <ThemedText variant="bodyBold">Standard Clinical Encounter</ThemedText>
                        <Badge label="Cash / Private / HMO" variant="neutral" size="sm" />
                      </View>
                      <ThemedText variant="small" color={theme.colors.textMuted} style={{ marginTop: theme.spacing.xs }}>
                        Standard clinical documentation for private, cash, or HMO consultations.
                      </ThemedText>
                    </View>
                    {!isSigned ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                        {!philHealthEligibility.canToggle && philHealthEligibility.reason ? (
                          <Badge label={philHealthEligibility.reason} variant="warning" size="sm" icon="alert" />
                        ) : null}
                        <Button
                          title="Switch to PhilHealth Konsulta"
                          size="sm"
                          variant="outline"
                          icon="shield"
                          disabled={!philHealthEligibility.canToggle}
                          onPress={() => {
                            if (philHealthEligibility.canToggle) {
                              setIsYakapEligible(true);
                              if (!philHealthAtc.trim() || philHealthAtc === 'ATC-2026-KON01') {
                                setPhilHealthAtc('WALKEDIN');
                              }
                            }
                          }}
                        />
                      </View>
                    ) : null}
                  </View>
                </Card>
              </View>
            ) : (
              /* PhilHealth Konsulta Encounter: Guided Mode with Encounter ATC Header Banner */
              <View onLayout={(e) => { sectionOffsets.current['atc'] = e.nativeEvent.layout.y; }}>
                <Card style={styles.atcBannerCard}>
                  <View style={styles.atcHeaderRow}>
                    <View style={styles.atcTitleGroup}>
                      <Icon name="shield" size={theme.sizes.iconMd} color={theme.colors.primary} />
                      <View style={styles.flex}>
                        <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                          PhilHealth Yakap consultation
                        </ThemedText>
                        <ThemedText
                          variant="small"
                          color={theme.colors.primary}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          Encounter reference numbers are automatically generated and linked upon signing
                        </ThemedText>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                      {!isSigned ? (
                        <Button
                          title="Switch to Standard"
                          size="sm"
                          variant="ghost"
                          onPress={() => setIsYakapEligible(false)}
                        />
                      ) : null}
                    </View>
                  </View>

                  {/* Encounter ATC Header Banner Input */}
                  <View style={{ marginTop: theme.spacing.xs }}>
                    <Input
                      label="Authorization Transaction Code (ATC)"
                      placeholder="e.g. WALKEDIN or ATC-2026-99214"
                      value={philHealthAtc}
                      onChangeText={setPhilHealthAtc}
                      editable={!isSigned}
                    />
                  </View>
                </Card>
              </View>
            )}

            {/* Nurse Pre-Assessment & Triage Handoff Banner */}
            {Boolean(vitals?.preAssessmentNotes || vitals?.preAssessmentRemarks || vitals?.triageAcuityReason) ? (
              <Card style={styles.handoffBannerCard}>
                <View style={styles.handoffBannerHeader}>
                  <View style={styles.handoffTitleRow}>
                    <Icon name="consultations" size={16} color={theme.colors.primary} />
                    <ThemedText variant="smallBold" color={theme.colors.primaryDark}>
                      Nurse Pre-Assessment &amp; Triage Handoff
                    </ThemedText>
                  </View>
                  {vitals?.triageAcuityReason ? (
                    <Badge
                      label={`Triage: ${vitals.triageAcuityReason}`}
                      variant={
                        vitals.triageAcuityReason === 'Emergency'
                          ? 'emergency'
                          : vitals.triageAcuityReason === 'Urgent'
                          ? 'warning'
                          : 'routine'
                      }
                      size="sm"
                    />
                  ) : null}
                </View>
                {vitals?.preAssessmentRemarks ? (
                  <View style={styles.handoffRow}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Observations:
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.text} style={styles.flex}>
                      {vitals.preAssessmentRemarks}
                    </ThemedText>
                  </View>
                ) : null}
                {vitals?.preAssessmentNotes ? (
                  <View style={styles.handoffRow}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Triage Remarks:
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.text} style={styles.flex}>
                      {vitals.preAssessmentNotes}
                    </ThemedText>
                  </View>
                ) : null}
              </Card>
            ) : null}

            {/* S - Subjective */}
            <View onLayout={(e) => { sectionOffsets.current['symptoms'] = e.nativeEvent.layout.y; }}>
              <Card>
                <CardHeader
                  title="Subjective"
                  subtitle="Chief complaint and history of present illness"
                  rightAction={
                    isYakapEligible ? (
                      <Badge label="PhilHealth complaint required" variant="info" />
                    ) : (
                      <Badge label="Internal Clinical Chart" variant="neutral" size="sm" />
                    )
                  }
                />
                {isYakapEligible ? (
                  <View style={styles.stack}>
                    <ThemedText variant="small" color={theme.colors.textMuted}>
                      Select the PhilHealth complaint(s) for this visit. Each selection is added to the narrative below.
                    </ThemedText>
                    {symptomLibrary.loading && symptoms.length === 0 ? (
                      <SkeletonList rows={1} rowHeight={theme.sizes.controlMd} />
                    ) : symptomLibrary.error && symptoms.length === 0 ? (
                      <ErrorState compact title="Unable to load PhilHealth complaints" message={symptomLibrary.error.message} onRetry={symptomLibrary.reload} />
                    ) : null}
                    <View style={styles.chipsRow}>
                      {symptoms.map((symp) => (
                        <ToggleChip
                          key={symp.code}
                          label={symp.name}
                          selected={selectedSymptomCodes.includes(symp.code)}
                          disabled={isSigned}
                          onPress={() => handleToggleSymptom(symp)}
                        />
                      ))}
                    </View>
                    {painSymptomSelected ? (
                      <Input
                        label="Pain site (required by PhilHealth)"
                        placeholder="e.g. Epigastric area, right shoulder, lumbar spine"
                        value={symptomPainSite}
                        onChangeText={setSymptomPainSite}
                        editable={!isSigned}
                      />
                    ) : null}
                    {otherSymptomSelected ? (
                      <Input
                        label="Other complaint (required by PhilHealth)"
                        placeholder="Describe the complaint"
                        value={symptomOtherDesc}
                        onChangeText={setSymptomOtherDesc}
                        editable={!isSigned}
                      />
                    ) : null}
                  </View>
                ) : null}
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
            <View onLayout={(e) => {
              if (!isYakapEligible) {
                sectionOffsets.current['physical-exam'] = e.nativeEvent.layout.y;
              }
            }}>
              <Card>
                <CardHeader
                  title="Objective"
                  subtitle="Physical findings, auscultation and examination"
                  rightAction={
                    !isSigned ? (
                      <Button
                        title="Record Vitals"
                        icon="activity"
                        size="sm"
                        variant="outline"
                        onPress={() => setRecordVitalsModalVisible(true)}
                      />
                    ) : undefined
                  }
                />
                <Input
                  multiline
                  placeholder="Physical examination and clinical observations"
                  accessibilityLabel="Objective notes"
                  value={objective}
                  onChangeText={setObjective}
                  editable={!isSigned}
                  inputStyle={styles.textArea}
                />
              </Card>
            </View>

            {/* Inline Physical Examination (PhilHealth Konsulta 9-System Findings) */}
            {isYakapEligible && settings?.specialtyMode !== 'Dental' && (
              <View onLayout={(e) => { sectionOffsets.current['physical-exam'] = e.nativeEvent.layout.y; }}>
                <InlinePhysicalExamCard
                  findings={physicalExamFindings}
                  onChange={setPhysicalExamFindings}
                  disabled={isSigned}
                />
              </View>
            )}

            {/* Inline Dental Chart Card (Adult & Child Odontogram) */}
            {isDentalEnabled && (
              <View onLayout={(e) => { sectionOffsets.current['dental-chart'] = e.nativeEvent.layout.y; }}>
                <InlineDentalChartCard
                  chart={dentalChart}
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
                  rightAction={isYakapEligible ? <Badge label="ICD-10 linked to PhilHealth" variant="info" /> : undefined}
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

            {/* Laboratory orders */}
            <Card>
              <CardHeader
                title={`Laboratory orders (${orderedLabs.length})`}
                icon="lab"
                subtitle="Selected tests create a requisition for the laboratory when the encounter is signed"
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
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Edit instructions for ${lab.name}`}
                                onPress={() => handleOpenEditInstructions(lab, 'lab')}
                                hitSlop={theme.spacing.xs}
                                style={styles.editNotesInlineBtn}
                              >
                                <Icon name="edit" size={theme.sizes.iconSm} color={theme.colors.primary} />
                                <ThemedText variant="captionBold" color={theme.colors.primary}>
                                  {lab.instructions ? 'Edit Notes' : '+ Add Notes'}
                                </ThemedText>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                        {!isSigned ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${lab.name}`}
                            onPress={() => handleRemoveLab(lab.name)}
                            hitSlop={theme.spacing.sm}
                            style={styles.orderedDeleteBtn}
                          >
                            <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
                          </Pressable>
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
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Edit instructions for ${proc.name}`}
                                  onPress={() => handleOpenEditInstructions(proc, 'procedure')}
                                  hitSlop={theme.spacing.xs}
                                  style={styles.editNotesInlineBtn}
                                >
                                  <Icon name="edit" size={theme.sizes.iconSm} color={theme.colors.primary} />
                                  <ThemedText variant="captionBold" color={theme.colors.primary}>
                                    {proc.instructions ? 'Edit Notes' : 'Add Notes'}
                                  </ThemedText>
                                </Pressable>
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
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${proc.name}`}
                            onPress={() => handleRemoveProcedure(proc.name, proc.toothNumber)}
                            hitSlop={theme.spacing.sm}
                            style={styles.orderedDeleteBtn}
                          >
                            <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
                          </Pressable>
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

            {/* P - Plan */}
            <Card>
              <CardHeader
                title="Plan (Internal)"
                subtitle="Clinical treatment, diagnostic ordering rationale, and physician notes"
                rightAction={<Badge label="Internal Clinical Chart" variant="neutral" size="sm" />}
              />
              <Input
                multiline
                placeholder="Treatment plan, requested tests, dietary advice"
                accessibilityLabel="Plan"
                value={plan}
                onChangeText={setPlan}
                editable={!isSigned}
                inputStyle={styles.textArea}
              />
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
                        title={isSigned ? 'View e-prescription' : 'Preview slip'}
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
                    <View key={rx.id} style={styles.rxCard}>
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
                          Dispense: #{rx.quantity} {rx.form}s
                        </ThemedText>
                        {rx.philHealthDrugCode || rx.isDangerousDrug ? (
                          <View style={styles.rowWrap}>
                            {rx.philHealthDrugCode ? (
                              <Badge label="PhilHealth Formulary" variant="info" size="sm" />
                            ) : null}
                            {rx.isDangerousDrug ? <Badge label="PDEA S2 dangerous drug" variant="emergency" size="sm" /> : null}
                          </View>
                        ) : null}
                      </View>
                      {!isSigned ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${rx.genericName}`}
                          onPress={() => handleRemovePrescription(rx.id)}
                          hitSlop={theme.spacing.sm}
                        >
                          <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
                        </Pressable>
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
                      {[
                        'Hydration & Rest (8+ glasses water daily)',
                        'Low Salt & Low Fat Diet',
                        'Warning Signs: Return immediately if fever > 38.5°C or acute chest pain occurs',
                        'Strict Medication Compliance: Complete the full course as prescribed',
                        'Wound Care: Keep area clean, dry, and change dressing daily',
                      ].map((preset) => (
                        <Pressable
                          key={preset}
                          onPress={() => {
                            setHomeInstructions((prev) =>
                              prev.trim() ? `${prev.trim()}\n• ${preset}` : `• ${preset}`
                            );
                          }}
                          style={styles.presetChip}
                        >
                          <ThemedText variant="caption" color={theme.colors.primaryDark}>
                            + {preset.split(':')[0].split('(')[0].trim()}
                          </ThemedText>
                        </Pressable>
                      ))}
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
              <View style={styles.credentialBadgesRow}>
                <Badge
                  label={doctorPan.trim() || signerStaff?.philHealthPan?.trim() ? 'PAN [Verified]' : 'PAN [Missing]'}
                  variant={doctorPan.trim() || signerStaff?.philHealthPan?.trim() ? 'success' : 'warning'}
                  size="sm"
                />
                <Badge
                  label={doctorPrc.trim() || signerStaff?.prcLicenseNumber?.trim() ? 'PRC [Verified]' : 'PRC [Missing]'}
                  variant={doctorPrc.trim() || signerStaff?.prcLicenseNumber?.trim() ? 'success' : 'emergency'}
                  size="sm"
                />
                <Badge
                  label={doctorPtr.trim() || signerStaff?.ptrNumber?.trim() ? 'PTR [Recorded]' : 'PTR [Optional]'}
                  variant="neutral"
                  size="sm"
                />
                <Badge
                  label={doctorS2.trim() || signerStaff?.s2LicenseNumber?.trim() ? 'S2 [Active]' : 'S2 [Needed for PDEA]'}
                  variant={doctorS2.trim() || signerStaff?.s2LicenseNumber?.trim() ? 'neutral' : 'warning'}
                  size="sm"
                />
              </View>
              <View style={styles.fieldRow}>
                <Input
                  label="PRC license #"
                  value={doctorPrc}
                  onChangeText={setDoctorPrc}
                  editable={!isSigned}
                  containerStyle={styles.fieldGrow}
                />
                <Input
                  label="PTR #"
                  value={doctorPtr}
                  onChangeText={setDoctorPtr}
                  editable={!isSigned}
                  containerStyle={styles.fieldGrow}
                />
                <Input
                  label="PDEA S2 license #"
                  value={doctorS2}
                  onChangeText={setDoctorS2}
                  editable={!isSigned}
                  containerStyle={styles.fieldGrow}
                />
                <Input
                  label="PhilHealth PAN"
                  value={doctorPan}
                  onChangeText={setDoctorPan}
                  editable={!isSigned}
                  containerStyle={styles.fieldGrow}
                  placeholder="Doctor PAN"
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
                  title="Issue medical certificate"
                  icon="file"
                  variant="outline"
                  onPress={() => setMedCertModalVisible(true)}
                />
                <Button
                  title="Issue referral letter"
                  icon="file"
                  variant="outline"
                  onPress={() => setReferralModalVisible(true)}
                />
              </View>

              {issuedMedCert ? (
                <View style={[styles.issuedRow, styles.issuedRowSuccess]}>
                  <View style={styles.flex}>
                    <ThemedText variant="bodyBold" color={theme.colors.successText}>
                      Medical certificate {issuedMedCert.certificateNumber}
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      {humanize(issuedMedCert.fitnessStatus)}
                      {issuedMedCert.recommendedRestDays ? ` • ${issuedMedCert.recommendedRestDays} day(s) rest` : ''}
                    </ThemedText>
                  </View>
                  <Button
                    title="View / print"
                    icon="print"
                    variant="success"
                    size="sm"
                    onPress={() => {
                      setPreviewType('MEDCERT');
                      setPreviewDocModal(true);
                    }}
                  />
                </View>
              ) : null}

              {issuedReferral ? (
                <View style={[styles.issuedRow, styles.issuedRowPrimary]}>
                  <View style={styles.flex}>
                    <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                      Referral {issuedReferral.referralNumber}
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      To {issuedReferral.referredToFacility} ({issuedReferral.referredDepartment}) •{' '}
                      {issuedReferral.urgency}
                    </ThemedText>
                  </View>
                  <Button
                    title="View / print"
                    icon="print"
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
                  <Button
                    title="Forward / Checkout options"
                    icon="billing"
                    variant="success"
                    onPress={() => setPostEncounterModalVisible(true)}
                  />
                </View>
              </Card>
            ) : (
              <Button
                title={
                  isYakapEligible && !isYakapReady
                    ? `Signing locked (${(serverReadiness || localEvaluation).missingFields.length} requirements pending)`
                    : 'Sign & sync encounter'
                }
                icon={isYakapEligible && !isYakapReady ? 'lock' : 'check'}
                size="lg"
                variant={isYakapEligible && !isYakapReady ? 'outline' : 'primary'}
                loading={isSigning}
                disabled={isSigning || (isYakapEligible && !isYakapReady)}
                onPress={handleSignAndSync}
              />
            )}
    </View>
  );

  return (
    <ResponsiveLayout headerTitle="Consultations">
      <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Patient queue */}
        <View style={styles.queueSection}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <ThemedText variant="h3">Patient queue</ThemedText>
              <Badge label={`${displayedPatients.length}`} variant="neutral" size="sm" />
            </View>
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
                title="Refresh"
                icon="refresh"
                variant="ghost"
                size="sm"
                loading={queueLoading}
                onPress={loadQueue}
              />
            </View>
          </View>

          {/* Queue View Fast Filters & Station Pills */}
          <View style={{ gap: theme.spacing.sm }}>
            <SegmentedControl
              value={queueViewFilter}
              onChange={handleQueueViewFilterChange}
              options={[
                { value: 'WaitingForDoctor', label: 'Waiting for Doctor' },
                { value: 'MyRoom', label: 'My Room' },
                { value: 'PendingProcedure', label: 'Pending Procedure' },
                { value: 'Completed', label: 'Completed' },
                { value: 'All', label: 'All Queue' },
              ]}
            />
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
          </View>

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
                const roomTag = p.roomOrStation ? ` · ${p.roomOrStation}` : '';

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

                const statusInfo = getStatusInfo(p.status);

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
                      {p.queueNumber}
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
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Call ${p.patientName} to room`}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleOpenCallModal(p);
                        }}
                        style={styles.chipCallBtn}
                      >
                        <Icon name="bell" size={11} color={theme.colors.onPrimary} />
                        <ThemedText variant="captionBold" color={theme.colors.onPrimary} style={styles.chipCallBtnText}>
                          Call
                        </ThemedText>
                      </Pressable>
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
                  gender: '',
                  createdAt: '',
                }}
                chart={patientChart}
                vitals={vitals}
                queueTicket={selectedPatient.queueNumber}
                queuePriority={selectedPatient.priority}
                chiefComplaint={selectedPatient.chiefComplaint}
                activeAtc={philHealthAtc}
                loading={contextLoading}
                onPressRefresh={() => loadPatientContext(selectedPatient)}
                onPressEdit={() => setEditPatientModalVisible(true)}
                onPressRecordVitals={() => setRecordVitalsModalVisible(true)}
              />
            </View>

            {/* Doctor Re-Evaluation Alert Banner (Closed-Loop In-Clinic Procedures Feature 20) */}
            {(selectedPatient.status === 'ReEvaluation' || latestExecutedProcedure?.status === 'Completed') ? (
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
                    title="Import Post-Procedure Vitals into Objective"
                    icon="plus"
                    variant="primary"
                    size="sm"
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
                <View style={styles.leftChartPane}>
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
                <View style={styles.rightSoapPane}>
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
          title="Issue medical certificate"
          subtitle={selectedPatient ? `Patient: ${selectedPatient.patientName}` : undefined}
          footer={
            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="outline" onPress={() => setMedCertModalVisible(false)} />
              <Button title="Lock & issue certificate" loading={issuingMedCert} onPress={handleIssueMedCert} />
            </View>
          }
        >
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
          title="Issue referral letter"
          subtitle={selectedPatient ? `Patient: ${selectedPatient.patientName}` : undefined}
          footer={
            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="outline" onPress={() => setReferralModalVisible(false)} />
              <Button title="Issue & seal referral" loading={issuingReferral} onPress={handleIssueReferral} />
            </View>
          }
        >
          <Input
            label="Receiving facility"
            required
            placeholder="Hospital or clinic name"
            value={refFacility}
            onChangeText={setRefFacility}
          />
          <Input
            label="Department / specialty"
            required
            placeholder="e.g. Cardiology, Surgery, Pulmonology"
            value={refDepartment}
            onChangeText={setRefDepartment}
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
          />
          <Input
            label="Clinical summary"
            placeholder="Summary of examination, diagnostics and initial medications (defaults to the subjective notes)"
            value={refSummary}
            onChangeText={setRefSummary}
            multiline
          />
        </Modal>

        {/* Document print preview modal */}
        <Modal
          visible={previewDocModal}
          onClose={() => setPreviewDocModal(false)}
          title={
            previewType === 'MEDCERT'
              ? 'Medical certificate'
              : previewType === 'REFERRAL'
              ? 'Referral letter'
              : 'Electronic prescription'
          }
          maxWidth={640}
          footer={
            <View style={styles.modalFooter}>
              {previewType === 'MEDCERT' && issuedMedCert ? (
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
              ) : null}
              {previewType === 'REFERRAL' && issuedReferral ? (
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
              ) : null}
              {previewType === 'PRESCRIPTION' && (signedConsultationId || prescriptionSlip?.consultationId) ? (
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
              {docSigningMode === 'wet' ? (
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
                {prescriptions.map((p, idx) => (
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
                    {p.isDangerousDrug ? (
                      <Badge label="Dangerous drug (PDEA S2)" variant="emergency" />
                    ) : null}
                  </View>
                ))}
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
              {docSigningMode === 'wet' ? (
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
            if (selectedPatient) {
              loadPatientContext(selectedPatient);
            }
          }}
        />

        {/* Record Vitals Modal */}
        {selectedPatient && (
          <RecordVitalsModal
            visible={recordVitalsModalVisible}
            onClose={() => setRecordVitalsModalVisible(false)}
            patient={patientRecord}
            queueItemId={selectedPatient.id}
            currentStaffId={signer?.id}
            currentStaffName={signerStaff ? formatStaffName(signerStaff) : signer?.name}
            existingVitals={vitals}
            onSuccess={(recordedVitals) => {
              setVitals(recordedVitals);
              notify.success('Vitals recorded successfully.');
              setRecordVitalsModalVisible(false);
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
                    Clinical notes, prescriptions, and lab orders are securely saved.
                  </ThemedText>
                </View>
              </View>

              {createdInvoiceTotal !== null ? (
                <View style={styles.postEncounterInvoiceBadge}>
                  <Icon name="billing" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                  <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                    Invoice {createdInvoiceNumber || 'Created'}: ₱{createdInvoiceTotal.toFixed(2)} (Queued for Checkout)
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
  editNotesInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: theme.spacing.xs,
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
  orderedDeleteBtn: {
    padding: theme.spacing.xs,
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
  orderedLabDeleteBtn: {
    padding: theme.spacing.xs,
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
  queueHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  chipCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.primary,
    marginLeft: 4,
  },
  chipCallBtnText: {
    fontSize: theme.typography.caption.fontSize,
    lineHeight: theme.typography.caption.lineHeight,
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
  atcBannerCard: {
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  atcHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  atcTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  dualModeSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
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
  rightSoapPane: {
    flex: 0.58,
    minWidth: 440,
    gap: theme.spacing.md,
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
  handoffBannerCard: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    borderWidth: theme.sizes.borderWidth,
    borderLeftWidth: 4,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  handoffBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  handoffTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  handoffRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  homeInstructionsCard: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  presetsSection: {
    marginVertical: theme.spacing.xs,
  },
  presetChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
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
});
