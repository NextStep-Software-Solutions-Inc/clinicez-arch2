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
} from '../../components/chart';
import EditPatientModal from '../../components/patient/EditPatientModal';
import { formatLongAge } from '../../utils/age';
import { getSessionItem, setSessionItem, getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import {
  InlinePhysicalExamCard,
  DEFAULT_PHYSICAL_EXAM_NORMAL,
  PhysicalExamFindings,
  YakapClaimReadinessCard,
  StatutorySectionKey,
} from '../../components/consultation';
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
  type ChartReviewTab = 'summary' | 'encounters' | 'diagnostics' | 'procedures' | 'immunizations' | 'profiles' | 'vault';
  const CHART_TAB_DESCRIPTIONS: Record<ChartReviewTab, string> = {
    summary: 'Executive clinical summary, problems, and vital trends',
    encounters: 'Timeline of historical clinical visits and SOAP documentation',
    diagnostics: 'Diagnostic laboratory orders, results, and specimen requisitions',
    procedures: 'Nursing procedures, treatments, and clinical interventions',
    immunizations: 'Statutory immunizations, schedules, and adverse events (AEFI)',
    profiles: 'Past medical history, surgical, social, and NCD risk profiles',
    vault: 'External document vault, outside imaging films, and clearances',
  };
  const [activeChartTab, setActiveChartTab] = useState<ChartReviewTab>(() => {
    const saved = getSessionItem('clinicez_consultations_active_chart_tab') as ChartReviewTab | null;
    if (saved && ['summary', 'encounters', 'diagnostics', 'procedures', 'immunizations', 'profiles', 'vault'].includes(saved)) {
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

  // ICD-10 Search & Selection
  const [icdQuery, setIcdQuery] = useState('');
  const [icdResults, setIcdResults] = useState<Icd10Code[]>([]);
  const [icdNotice, setIcdNotice] = useState<string | null>(null);
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<LocalDiagnosis[]>([]);
  const [showIcdDropdown, setShowIcdDropdown] = useState(false);

  // Prescriptions
  const [prescriptions, setPrescriptions] = useState<LocalPrescription[]>([]);

  // Diagnostic Lab Orders & In-Clinic Procedures
  const [orderedLabs, setOrderedLabs] = useState<string[]>([]);
  const [orderedProcedures, setOrderedProcedures] = useState<string[]>([]);
  const [editPatientModalVisible, setEditPatientModalVisible] = useState(false);

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
  const [philHealthAtc, setPhilHealthAtc] = useState<string>('ATC-2026-KON01');
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
  const procedureCatalog = catalogByCategory('procedure', 'nursingservice');
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
  const [previewType, setPreviewType] = useState<'MEDCERT' | 'REFERRAL'>('MEDCERT');

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
      specialInstructions: plan || undefined,
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
    const [triageRes, recordRes, labRes, chartRes] = await Promise.all([
      clinicService.getTriage(p.id),
      clinicService.getPatientById(p.patientId),
      clinicService.getLabOrders(p.patientId),
      clinicService.getPatientChart(p.patientId),
    ]);
    if (activePatientId.current !== p.id) return;

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
      setIsYakapEligible(Boolean(record.philHealthNumber));
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
    setSelectedDiagnoses([]);
    setPrescriptions([]);
    setOrderedLabs([]);
    setOrderedProcedures([]);
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
    setPhilHealthAtc('ATC-2026-KON01');
    setPhysicalExamFindings({ ...DEFAULT_PHYSICAL_EXAM_NORMAL });
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

  const handleToggleLab = (labName: string) => {
    setOrderedLabs((prev) => (prev.includes(labName) ? prev.filter((l) => l !== labName) : [...prev, labName]));
  };

  const handleToggleProcedure = (procName: string) => {
    setOrderedProcedures((prev) => (prev.includes(procName) ? prev.filter((p) => p !== procName) : [...prev, procName]));
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
        isYakapEligible,
        philHealthSignSympCode: isYakapEligible ? selectedSymptomCodes.join(',') : undefined,
        philHealthOtherComplaint: isYakapEligible && otherSymptomSelected ? symptomOtherDesc || subjective : undefined,
        philHealthPainSite: isYakapEligible && painSymptomSelected ? symptomPainSite : undefined,
        doctorPhilHealthPan: isYakapEligible ? (doctorPan.trim() || signerStaff?.philHealthPan) : undefined,
        philHealthAtc: isYakapEligible ? (philHealthAtc.trim() || 'ATC-2026-KON01') : undefined,
        generalSurveyId: isYakapEligible ? (physicalExamFindings.generalSurvey === 'Normal' ? '1' : '2') : undefined,
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
        isYakapEligible,
        philHealthSignSympCode: isYakapEligible ? selectedSymptomCodes.join(',') : undefined,
        philHealthOtherComplaint: isYakapEligible && otherSymptomSelected ? symptomOtherDesc || subjective : undefined,
        philHealthPainSite: isYakapEligible && painSymptomSelected ? symptomPainSite : undefined,
        doctorPhilHealthPan: isYakapEligible ? (doctorPan.trim() || signerStaff?.philHealthPan) : undefined,
        philHealthAtc: isYakapEligible ? (philHealthAtc.trim() || 'ATC-2026-KON01') : undefined,
        generalSurveyId: isYakapEligible ? (physicalExamFindings.generalSurvey === 'Normal' ? '1' : '2') : undefined,
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
      philHealthAtc: isYakapEligible ? (philHealthAtc.trim() || 'ATC-2026-KON01') : undefined,
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

    // Auto-create Diagnostic Lab Requisitions if labs were ordered
    if (orderedLabs.length > 0) {
      const [, labErr] = await clinicService.createLabOrder({
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        consultationId,
        orderedByDoctorId: doctor.id,
        orderedByDoctorName: doctor.name,
        clinicalDiagnosis: assessment,
        items: orderedLabs.map((l) => ({
          testName: l,
          category: diagnosticCatalog.find((d) => d.name === l)?.category ?? 'Diagnostic',
        })),
      });
      if (labErr) followUpIssues.push('laboratory requisition');
    }

    // Auto-order in-clinic procedures for the nursing station
    const targetTreatmentRoom =
      treatmentRooms.find((r) => r.id === selectedTreatmentRoomId) ?? treatmentRooms[0];
    for (const procName of orderedProcedures) {
      const procInfo = procedureCatalog.find((p) => p.name === procName);
      const [, procErr] = await clinicService.orderProcedure({
        patientId: selectedPatient.patientId,
        patientName: selectedPatient.patientName,
        queueItemId: selectedPatient.id,
        consultationId,
        procedureCode: procInfo?.code,
        procedureName: procName,
        category: procInfo?.category ?? 'Procedure',
        orderedByDoctorId: doctor.id,
        orderedByDoctorName: doctor.name,
        targetRoomId: targetTreatmentRoom?.id,
        targetRoomName: targetTreatmentRoom?.name,
        clinicalNotes: `Ordered during encounter for ${assessment}`,
      });
      if (procErr) followUpIssues.push(`procedure order (${procName})`);
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
    for (const procName of orderedProcedures) {
      const procInfo = procedureCatalog.find((p) => p.name === procName);
      if (procInfo) {
        billItems.push({
          serviceItemId: procInfo.id,
          itemCode: procInfo.code,
          description: procInfo.name,
          category: procInfo.category,
          unitPrice: procInfo.standardPrice,
          quantity: 1,
        });
      }
    }
    if (billItems.length > 0) {
      const [, invoiceErr] = await clinicService.createInvoice({
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
      if (invoiceErr) followUpIssues.push('billing invoice');
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
  };

  const vitalItems = (
    vitals
      ? [
          vitals.systolicBp != null && vitals.diastolicBp != null
            ? { label: 'BP', value: `${vitals.systolicBp}/${vitals.diastolicBp}` }
            : null,
          vitals.heartRateBpm != null ? { label: 'HR', value: `${vitals.heartRateBpm} bpm` } : null,
          vitals.temperatureCelsius != null ? { label: 'Temp', value: `${vitals.temperatureCelsius}°C` } : null,
          vitals.oxygenSaturationPercent != null ? { label: 'SpO2', value: `${vitals.oxygenSaturationPercent}%` } : null,
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

    const vitalsComp = !!(
      vitals?.systolicBp &&
      vitals?.diastolicBp &&
      vitals?.heartRateBpm &&
      vitals?.temperatureCelsius &&
      vitals?.heightCm &&
      vitals?.weightKg
    );

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
    if (!vitalsComp) missing.push('Complete triage vitals required (BP, HR, Temp, Height, Weight).');
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

  const handleHandoffToTreatmentRoom = async (procedureName: string) => {
    if (!selectedPatient) return;
    const doctor = requireSigner();
    if (!doctor) return;
    const procInfo = procedureCatalog.find((p) => p.name === procedureName);
    const targetTreatmentRoom =
      treatmentRooms.find((r) => r.id === selectedTreatmentRoomId) ?? treatmentRooms[0];
    const resolvedTargetName = targetTreatmentRoom?.name || 'Treatment Room';

    const [proc, procErr] = await clinicService.orderProcedure({
      patientId: selectedPatient.patientId,
      patientName: selectedPatient.patientName,
      queueItemId: selectedPatient.id,
      consultationId: signedConsultationId || undefined,
      procedureCode: procInfo?.code,
      procedureName: procedureName,
      category: procInfo?.category ?? 'Procedure',
      orderedByDoctorId: doctor.id,
      orderedByDoctorName: doctor.name,
      targetRoomId: targetTreatmentRoom?.id,
      targetRoomName: resolvedTargetName,
      clinicalNotes: `Ordered for in-clinic execution: ${assessment || 'Evaluation'}`,
    });

    if (procErr) {
      notify.error(procErr.message || `Could not hand off procedure to ${resolvedTargetName}.`);
      return;
    }

    const finalRoomName = proc?.targetRoomName || resolvedTargetName;
    setSelectedPatient((prev) =>
      prev
        ? {
            ...prev,
            status: 'PendingProcedure',
            roomId: proc?.targetRoomId ?? targetTreatmentRoom?.id,
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

  const renderLongitudinalChartContent = () => (
    <View style={styles.longitudinalChartContainer}>
      <Card>
        <CardHeader
          title="Patient Medical Chart"
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
          onRefreshChart={() => selectedPatient && loadPatientContext(selectedPatient)}
        />
      )}
      {activeChartTab === 'encounters' && (
        <EncountersTimelineTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          consultations={patientChart?.consultations || []}
          onRefreshChart={() => selectedPatient && loadPatientContext(selectedPatient)}
        />
      )}
      {activeChartTab === 'diagnostics' && (
        <DiagnosticLabTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          labOrders={labOrders}
          onRefreshChart={() => selectedPatient && loadPatientContext(selectedPatient)}
        />
      )}
      {activeChartTab === 'procedures' && (
        <NursingProceduresTab
          patient={patientRecord}
          patientId={selectedPatient?.patientId}
          procedures={patientChart?.proceduresHistory || []}
          onRefreshChart={() => selectedPatient && loadPatientContext(selectedPatient)}
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
              await loadPatientContext(selectedPatient);
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
              await loadPatientContext(selectedPatient);
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
              await loadPatientContext(selectedPatient);
            }
          }}
          onRefreshChart={() => selectedPatient && loadPatientContext(selectedPatient)}
        />
      )}
      {activeChartTab === 'profiles' && (
        <HealthProfilesTab
          patient={patientRecord || ({} as any)}
          surgicalHistories={patientChart?.surgicalHistories || []}
          socialHistory={patientChart?.socialHistory}
          reproductiveHistory={patientChart?.reproductiveHistory}
          latestNcdAssessment={patientChart?.latestNcdAssessment}
          onRefreshChart={() => selectedPatient && loadPatientContext(selectedPatient)}
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
          onRefreshChart={() => selectedPatient && loadPatientContext(selectedPatient)}
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
                      <Button
                        title="Switch to PhilHealth Konsulta"
                        size="sm"
                        variant="outline"
                        icon="shield"
                        onPress={() => setIsYakapEligible(true)}
                      />
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
                          PhilHealth Konsulta Encounter Active
                        </ThemedText>
                        <ThemedText variant="small" color={theme.colors.primary}>
                          Encounter reference numbers are automatically generated and linked upon signing
                        </ThemedText>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                      <Badge label={isYakapReady ? 'Claim Ready' : 'Incomplete'} variant={isYakapReady ? 'success' : 'warning'} />
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
                      placeholder="e.g. ATC-2026-99214"
                      value={philHealthAtc}
                      onChangeText={setPhilHealthAtc}
                      editable={!isSigned}
                    />
                  </View>
                </Card>
              </View>
            )}

            {/* S - Subjective */}
            <View onLayout={(e) => { sectionOffsets.current['symptoms'] = e.nativeEvent.layout.y; }}>
              <Card>
                <CardHeader
                  title="Subjective"
                  subtitle="Chief complaint and history of present illness"
                  rightAction={
                    isYakapEligible ? <Badge label="PhilHealth complaint required" variant="info" /> : undefined
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
                <CardHeader title="Objective" subtitle="Physical findings, auscultation and examination" />
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
            {isYakapEligible && (
              <View onLayout={(e) => { sectionOffsets.current['physical-exam'] = e.nativeEvent.layout.y; }}>
                <InlinePhysicalExamCard
                  findings={physicalExamFindings}
                  onChange={setPhysicalExamFindings}
                  disabled={isSigned}
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
              />
              {catalogLoading && diagnosticCatalog.length === 0 ? (
                <SkeletonList rows={1} rowHeight={theme.sizes.controlMd} />
              ) : diagnosticCatalog.length === 0 ? (
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  No diagnostic tests are set up in the clinic fee schedule yet.
                </ThemedText>
              ) : (
                <View style={styles.chipsRow}>
                  {diagnosticCatalog.map((diag) => (
                    <ToggleChip
                      key={diag.id}
                      tone="success"
                      label={`${diag.name} (₱${diag.standardPrice.toFixed(0)})`}
                      meta={isYakapEligible && diag.philHealthCode ? 'PhilHealth Covered' : undefined}
                      selected={orderedLabs.includes(diag.name)}
                      disabled={isSigned}
                      onPress={() => handleToggleLab(diag.name)}
                    />
                  ))}
                </View>
              )}              {catalogError ? (
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
                <View style={styles.chipsRow}>
                  {procedureCatalog.map((proc) => (
                    <ToggleChip
                      key={proc.id}
                      label={`${proc.name} (₱${proc.standardPrice.toFixed(0)})`}
                      selected={orderedProcedures.includes(proc.name)}
                      disabled={isSigned}
                      onPress={() => handleToggleProcedure(proc.name)}
                    />
                  ))}
                </View>
              )}
              {orderedProcedures.length > 0 && !isSigned ? (
                <View style={styles.procedureHandoffRow}>
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
                  <Button
                    title={`Send to ${
                      (treatmentRooms.find((r) => r.id === selectedTreatmentRoomId) ?? treatmentRooms[0])?.name ||
                      'Treatment Room'
                    } (Nurse Handoff)`}
                    variant="primary"
                    icon="syringe"
                    size="sm"
                    onPress={() => {
                      const first = orderedProcedures[0];
                      if (first) handleHandoffToTreatmentRoom(first);
                    }}
                  />
                </View>
              ) : null}
            </Card>

            {/* P - Plan */}
            <Card>
              <CardHeader title="Plan" subtitle="Treatment, lifestyle counseling and follow-up" />
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
                    title="Forward to cashier"
                    icon="billing"
                    variant="success"
                    onPress={() => {
                      if (!selectedPatient) return;
                      navigation.navigate('Billing', {
                        patientId: selectedPatient.patientId,
                        patientName: selectedPatient.patientName,
                      });
                    }}
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
                      { value: 'chart', label: 'Patient Medical Chart (7 Tabs)' },
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
              await loadPatientContext(selectedPatient);
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
          title={previewType === 'MEDCERT' ? 'Medical certificate' : 'Referral letter'}
          maxWidth={640}
          footer={
            <View style={styles.modalFooter}>
              {previewType === 'MEDCERT' && issuedMedCert ? (
                <Button
                  title="Download official PDF"
                  icon="download"
                  variant="success"
                  onPress={() =>
                    downloadPdf(
                      clinicService.getMedicalCertificatePdfUrl(issuedMedCert.id),
                      'Could not open the medical certificate PDF. Please check your connection and try again.',
                    )
                  }
                />
              ) : null}
              {previewType === 'REFERRAL' && issuedReferral ? (
                <Button
                  title="Download official PDF"
                  icon="download"
                  variant="success"
                  onPress={() =>
                    downloadPdf(
                      clinicService.getReferralLetterPdfUrl(issuedReferral.id),
                      'Could not open the referral letter PDF. Please check your connection and try again.',
                    )
                  }
                />
              ) : null}
              <Button title="Close preview" onPress={() => setPreviewDocModal(false)} />
            </View>
          }
        >
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
                {previewType === 'MEDCERT' ? 'Medical certificate' : 'Referral letter'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Document No. {previewType === 'MEDCERT' ? issuedMedCert?.certificateNumber : issuedReferral?.referralNumber}
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
              {docSignature.signed ? (
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
      </ScrollView>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    width: '100%',
    maxWidth: theme.sizes.contentMaxWidth,
    alignSelf: 'center',
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
});
