import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { TextInput } from '@ui/Text';
import { Alert } from '@utils/feedback';
import { useNavigation, useFocusEffect, type StaticScreenProps } from '@react-navigation/native';
import { ThemedText, Badge, Button, Input, Card, Icon, IconSlot, EmptyState, ErrorState, SkeletonList, ValidatedDateInput, validateDateString, BloodTypeSelect, Modal } from '@ui';
import SegmentedControl, { type SegmentedOption } from '@ui/SegmentedControl';
import * as DocumentPicker from 'expo-document-picker';
import {
  PatientSummarySpine,
  PatientChartModal,
  CHART_TABS,
  type ChartTab,
  ExecutiveSummaryTab,
  EncountersTimelineTab,
  DiagnosticLabTab,
  NursingProceduresTab,
  StatutoryImmunizationsTab,
  HealthProfilesTab,
  ExternalDocumentVaultTab,
  ClinicalHistoryTab,
  LifestyleSocialTab,
  ReproductiveHealthTab,
  CardiometabolicRiskTab,
} from '../../components/chart';
import { useClinic } from '@context/ClinicContext';
import { useStaff, formatStaffName } from '@context/StaffContext';
import { openDocument } from '../../services/documentOpener';
import { notify } from '@utils/feedback';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { PERMISSIONS } from '@constants/permissions';
import { usePermission } from '@context/AuthContext';
import { LabOrderStageChip } from '../../components/interop/InteropBadges';
import PrescriptionSlipModal from '../../components/PrescriptionSlipModal';
import RecordExternalDispenseModal from '../../components/RecordExternalDispenseModal';
import PhilHealthProfileModal from '../../components/PhilHealthProfileModal';
import PhilHealthPinInput from '../../components/ui/PhilHealthPinInput';
import DebouncedDuplicateChecker from '../../components/patient/DebouncedDuplicateChecker';
import DuplicatePatientWarningModal from '../../components/patient/DuplicatePatientWarningModal';
import StructuredAllergyIntakeModal, {
  AllergyPillList,
  CreateAllergyRequest,
} from '../../components/patient/StructuredAllergyIntakeModal';
import StructuredMedicalHistoryModal, {
  MedicalHistoryPillList,
  MedicalHistoryItem,
  PHILHEALTH_QUICK_CONDITIONS,
  formatMedicalHistoriesSummary,
} from '../../components/patient/StructuredMedicalHistoryModal';
import ClinicalAlertsSection from '../../components/patient/ClinicalAlertsSection';
import YakapEnlistmentSection from '../../components/patient/YakapEnlistmentSection';
import EditPatientModal from '../../components/patient/EditPatientModal';
import PatientDirectoryCard, {
  PatientDirectoryTableHeader,
  type PatientDirectoryViewMode,
  hasKnownAllergies,
} from '../../components/patient/PatientDirectoryCard';
import QueueConflictModal from '../../components/queue/QueueConflictModal';
import QueueRoutingSelector from '../../components/queue/QueueRoutingSelector';
import { DynamicCustomFieldsRenderer, validateCustomFields, sanitizeCustomFieldsPayload } from '../../components/custom-fields';
import { formatLongAge } from '../../utils/age';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useVirtualList } from '../../utils/useVirtualList';
import { getSessionItem, setSessionItem } from '../../utils/deviceStorage';
import {
  type MemberType,
  type PrincipalRelationship,
  PHILHEALTH_RELATIONSHIPS,
  buildPhilHealthProfileData,
} from '../../components/patient/memberType';

import {
  clinicService,
  getManilaTodayStr,
  ClinicPatient,
  RegisterPatientPayload,
  PatientChart,
  LabOrderSlipData,
  ClinicLabOrderRecord,
  PrescriptionSlipData,
  ConsultationRecord,
  ClinicRecordAttachmentRecord,
  ClinicCustomFieldDefinition,
  DuplicateMatch,
  VisitType,
} from '../../services/clinicService';
import { offlineSyncService } from '../../services/offlineSyncService';
import { getSetting } from '../../services/runtimeConfig';
import { shouldQueueOffline } from '../../services/outboxPolicy';

const VISIT_TYPE_OPTIONS: Array<{ key: VisitType; label: string }> = [
  { key: 'Consultation', label: 'Consultation' },
  { key: 'VitalsCheckOnly', label: 'Vitals Check' },
  { key: 'RetailPurchase', label: 'Retail OTC' },
  { key: 'StandaloneProcedure', label: 'Procedure' },
  { key: 'LaboratorySpecimen', label: 'Specimen Drop-Off' },
  { key: 'AdministrativeDocument', label: 'Administrative' },
  { key: 'CashierSettlement', label: 'Cashier' },
];

const humanizeKey = (key: string) => {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

type PatientFilter = 'ALL' | 'ALERTS' | 'SENIOR_PWD' | 'STUDENTS' | 'EMPLOYEES';

export type PatientsScreenProps = StaticScreenProps<
  | {
      openPatientId?: string;
      patientId?: string;
      openRegister?: boolean;
      tab?: ChartTab | string;
      toothNumber?: number | string;
      tooth?: number | string;
    }
  | undefined
>;

export default function PatientsScreen({ route }: PatientsScreenProps) {
  const navigation = useNavigation<any>();
  const { isWorkstation, isDesktop } = useBreakpoint();
  const canImportPatient = usePermission(PERMISSIONS.patientsWrite);
  const routeParams = route?.params;
  const openPatientId = routeParams?.openPatientId || routeParams?.patientId;
  const openRegister = routeParams?.openRegister;
  const routeTab = routeParams?.tab as ChartTab | undefined;
  const rawRouteTooth = routeParams?.toothNumber ?? routeParams?.tooth;
  const routeToothNumber = useMemo(() => {
    if (rawRouteTooth === undefined || rawRouteTooth === null) return undefined;
    const parsed = typeof rawRouteTooth === 'number' ? rawRouteTooth : parseInt(String(rawRouteTooth), 10);
    return !isNaN(parsed) && parsed > 0 ? parsed : undefined;
  }, [rawRouteTooth]);
  const { letterhead, rooms = [] } = useClinic();
  const { currentName, staff: staffList, current: currentStaff } = useStaff();
  const [patients, setPatients] = useState<ClinicPatient[] | null>(null);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<PatientFilter>(() => {
    const saved = getSessionItem('clinicez_patients_filter_mode') as PatientFilter | null;
    if (saved && ['ALL', 'STUDENTS', 'EMPLOYEES', 'ALERTS', 'SENIOR_PWD'].includes(saved)) {
      return saved;
    }
    return 'ALL';
  });
  const [viewMode, setViewMode] = useState<PatientDirectoryViewMode>(() => {
    const saved = getSessionItem('clinicez_patients_view_mode') as PatientDirectoryViewMode | null;
    if (saved === 'cards' || saved === 'table') {
      return saved;
    }
    return 'cards';
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleFilterModeChange = (mode: PatientFilter) => {
    setFilterMode(mode);
    setSessionItem('clinicez_patients_filter_mode', mode);
  };

  const handleViewModeChange = (mode: PatientDirectoryViewMode) => {
    setViewMode(mode);
    setSessionItem('clinicez_patients_view_mode', mode);
  };

  const effectiveViewMode: PatientDirectoryViewMode = isWorkstation ? viewMode : 'cards';

  // Register Modal state
  const [registerVisible, setRegisterVisible] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [formClassification, setFormClassification] = useState<'General' | 'Student' | 'Employee'>('General');
  const [formStudentId, setFormStudentId] = useState('');
  const [formCollege, setFormCollege] = useState('');
  const [formProgram, setFormProgram] = useState('');
  const [formYearLevel, setFormYearLevel] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [tenantCustomFields, setTenantCustomFields] = useState<ClinicCustomFieldDefinition[]>([]);
  const [dynamicFieldValues, setDynamicFieldValues] = useState<Record<string, any>>({});
  const [dynamicFieldErrors, setDynamicFieldErrors] = useState<Record<string, string>>({});
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formMiddleName, setFormMiddleName] = useState('');
  const [formDob, setFormDob] = useState('');
  const [formGender, setFormGender] = useState('Male');
  const [formCivilStatus, setFormCivilStatus] = useState('Single');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhilHealth, setFormPhilHealth] = useState('');
  const [formSeniorId, setFormSeniorId] = useState('');
  const [formPwdId, setFormPwdId] = useState('');
  const [formBloodType, setFormBloodType] = useState('');
  const [formAllergies, setFormAllergies] = useState('');
  const [formChronicConditions, setFormChronicConditions] = useState('');
  const [formMedicalHistories, setFormMedicalHistories] = useState<MedicalHistoryItem[]>([]);
  const [medicalHistoryModalVisible, setMedicalHistoryModalVisible] = useState(false);
  const [formAlerts, setFormAlerts] = useState('');
  const [isPinValid, setIsPinValid] = useState<boolean | null>(null);
  const [formMemberType, setFormMemberType] = useState<MemberType>('MM');
  const [formPrincipalPin, setFormPrincipalPin] = useState('');
  const [formPrincipalFullName, setFormPrincipalFullName] = useState('');
  const [formPrincipalRelationship, setFormPrincipalRelationship] = useState<PrincipalRelationship>('C');
  const [formPrincipalDob, setFormPrincipalDob] = useState('');
  const [isPrincipalPinValid, setIsPrincipalPinValid] = useState<boolean | null>(null);
  const [structuredAllergies, setStructuredAllergies] = useState<CreateAllergyRequest[]>([]);
  const [allergyModalVisible, setAllergyModalVisible] = useState(false);
  const [formChiefComplaint, setFormChiefComplaint] = useState('');
  const [formTriagePriority, setFormTriagePriority] = useState<'Routine' | 'Urgent' | 'Emergency'>('Routine');
  const [formTriageDoctorId, setFormTriageDoctorId] = useState<string>('');
  const [formTriageRoomId, setFormTriageRoomId] = useState<string>('');
  const [formPatientCode, setFormPatientCode] = useState('');
  const [formFieldErrors, setFormFieldErrors] = useState<Record<string, string>>({});

  // Duplicate Patient Warning Modal Safeguard states
  const [duplicateWarningVisible, setDuplicateWarningVisible] = useState(false);
  const [detectedDuplicates, setDetectedDuplicates] = useState<DuplicateMatch[]>([]);
  const [pendingRegisterOptions, setPendingRegisterOptions] = useState<{ sendToTriage?: boolean } | null>(null);

  const toggleQuickCondition = (code: string, title: string) => {
    setFormMedicalHistories((prev) => {
      const exists = prev.some(
        (c) =>
          c.philHealthMdiseaseCode === code ||
          c.conditionTitle.trim().toLowerCase() === title.trim().toLowerCase()
      );
      if (exists) {
        return prev.filter(
          (c) =>
            c.philHealthMdiseaseCode !== code &&
            c.conditionTitle.trim().toLowerCase() !== title.trim().toLowerCase()
        );
      } else {
        return [...prev, { conditionTitle: title, philHealthMdiseaseCode: code }];
      }
    });
  };

  const quickCodesSet = useMemo(() => new Set(PHILHEALTH_QUICK_CONDITIONS.map((q) => q.code)), []);
  const quickTitlesSet = useMemo(() => new Set(PHILHEALTH_QUICK_CONDITIONS.map((q) => q.title.toLowerCase())), []);

  const additionalFormConditions = useMemo(() => {
    return formMedicalHistories.filter(
      (c) =>
        (!(c.philHealthMdiseaseCode && quickCodesSet.has(c.philHealthMdiseaseCode)) &&
         !quickTitlesSet.has(c.conditionTitle.trim().toLowerCase())) ||
        Boolean(c.clinicalNotes?.trim()) ||
        Boolean(c.icd10Code?.trim())
    );
  }, [formMedicalHistories, quickCodesSet, quickTitlesSet]);

  const clearFieldError = (field: string) => {
    setFormFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // Chart Modal state
  const [chartVisible, setChartVisible] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<ClinicPatient | null>(null);
  const [patientChart, setPatientChart] = useState<PatientChart | null>(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const getInitialChartTab = (): ChartTab => {
    if (routeTab && (CHART_TABS.some((t) => t.value === routeTab) || routeTab === 'dental')) {
      return routeTab;
    }
    if (routeToothNumber) {
      return 'dental';
    }
    if (typeof window !== 'undefined' && window.location?.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        const tabParam = sp.get('tab') as ChartTab;
        if (tabParam && (CHART_TABS.some((t) => t.value === tabParam) || tabParam === 'dental')) {
          return tabParam;
        }
      } catch {}
    }
    const saved = getSessionItem('clinicez_active_chart_tab') as ChartTab | null;
    if (saved && (CHART_TABS.some((t) => t.value === saved) || saved === 'dental')) {
      return saved;
    }
    return 'summary';
  };

  const getInitialFocusTooth = (): number | undefined => {
    if (routeToothNumber !== undefined) {
      return routeToothNumber;
    }
    if (typeof window !== 'undefined' && window.location?.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        const toothStr = sp.get('tooth') || sp.get('toothNumber');
        if (toothStr) {
          const num = parseInt(toothStr, 10);
          if (!isNaN(num) && num > 0) return num;
        }
      } catch {}
    }
    return undefined;
  };

  const [activeChartTab, setActiveChartTab] = useState<ChartTab>(getInitialChartTab);
  const [focusToothNumber, setFocusToothNumber] = useState<number | undefined>(getInitialFocusTooth);

  const handleChartTabChange = (tab: ChartTab) => {
    setActiveChartTab(tab);
    setSessionItem('clinicez_active_chart_tab', tab);
    if (typeof window !== 'undefined' && window.history?.replaceState && window.location) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }
  };

  // Queue Check-In Anti-Spam & Concurrency Guard states
  const isCheckingInRef = useRef(false);
  const isRegisteringRef = useRef(false);
  const isFirstFocusRef = useRef(true);
  const [checkingInPatientId, setCheckingInPatientId] = useState<string | null>(null);
  const [checkInModalPatient, setCheckInModalPatient] = useState<ClinicPatient | null>(null);
  const [checkInDoctorId, setCheckInDoctorId] = useState<string>('');
  const [checkInRoomId, setCheckInRoomId] = useState<string>('');
  const [checkInPriority, setCheckInPriority] = useState<'Routine' | 'Urgent' | 'Emergency'>('Routine');
  const [checkInVisitType, setCheckInVisitType] = useState<VisitType>('Consultation');
  const [checkInComplaint, setCheckInComplaint] = useState<string>('');
  const [conflictModal, setConflictModal] = useState<{
    visible: boolean;
    error?: any;
    patientName?: string;
  } | null>(null);

  const activeDoctors = useMemo(
    () => (staffList || []).filter((s) => s.role === 'Doctor' && s.isActive),
    [staffList],
  );
  const activeRooms = useMemo(
    () => (rooms || []).filter((r) => r.isActive),
    [rooms],
  );

  // Standalone PhilHealth Profile Modal state
  const [philHealthProfileModalVisible, setPhilHealthProfileModalVisible] = useState(false);
  const [selectedPatientForProfile, setSelectedPatientForProfile] = useState<ClinicPatient | null>(null);

  // Edit Patient Demographics state
  const [editPatientModalVisible, setEditPatientModalVisible] = useState(false);
  const [patientToEdit, setPatientToEdit] = useState<ClinicPatient | null>(null);

  // Lab Slip & External Results Interoperability state
  const [selectedSlip, setSelectedSlip] = useState<LabOrderSlipData | null>(null);
  const [slipModalVisible, setSlipModalVisible] = useState(false);
  const [attachModalVisible, setAttachModalVisible] = useState(false);
  const [targetOrderId, setTargetOrderId] = useState<string | null>(null);
  const [externalLabName, setExternalLabName] = useState('');
  const [externalFileType, setExternalFileType] = useState<'Photo' | 'PDF'>('PDF');
  const [externalNotes, setExternalNotes] = useState('');
  const [attaching, setAttaching] = useState(false);

  // External Physical Attachments & Verification (School Clinic & 80/20) state
  const [patientAttachments, setPatientAttachments] = useState<ClinicRecordAttachmentRecord[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadDocModalVisible, setUploadDocModalVisible] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docRecordType, setDocRecordType] = useState('OutsideChestXRay');
  const [docFileType, setDocFileType] = useState<'PDF' | 'Photo'>('PDF');
  const [docNotes, setDocNotes] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickedDocFile, setPickedDocFile] = useState<{
    name: string;
    size?: number;
    uri: string;
    mimeType?: string;
    file?: any;
  } | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [verifyingAttachmentId, setVerifyingAttachmentId] = useState<string | null>(null);

  // Prescription Slip & External Dispense (Path B) state
  const [selectedRxSlip, setSelectedRxSlip] = useState<PrescriptionSlipData | null>(null);
  const [rxSlipModalVisible, setRxSlipModalVisible] = useState(false);
  const [targetConsultationId, setTargetConsultationId] = useState<string | null>(null);
  const [targetPrescriptionNumber, setTargetPrescriptionNumber] = useState<string | undefined>(undefined);
  const [externalDispenseModalVisible, setExternalDispenseModalVisible] = useState(false);

  // Offline outbox states
  const [offlinePendingCount, setOfflinePendingCount] = useState(offlineSyncService.getPendingCount());
  const [offlineFailedCount, setOfflineFailedCount] = useState(offlineSyncService.getFailedCount());
  const [syncingOffline, setSyncingOffline] = useState(false);
  const PAGE_SIZE = 50;
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const isLoadingMoreRef = useRef<boolean>(false);

  // Virtualization & scroll tracking
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [listTopOffset, setListTopOffset] = useState(180);
  const lastScrollYRef = useRef(0);
  const viewportHeightRef = useRef(800);
  const scrollViewRef = useRef<ScrollView>(null);

  const fetchPatients = useCallback(async (termOverride?: string, filterOverride?: PatientFilter) => {
    const activeSearch = termOverride !== undefined ? termOverride : debouncedSearchTerm;
    const activeFilter = filterOverride !== undefined ? filterOverride : filterMode;
    const hasAlertsFilter = activeFilter === 'ALERTS' ? true : undefined;
    const serverFilterMode = (activeFilter === 'ALERTS' || activeFilter === 'SENIOR_PWD') ? activeFilter : undefined;

    setPage(1);
    setScrollY(0);
    lastScrollYRef.current = 0;
    const [data, err] = await clinicService.getPatients(
      activeSearch || undefined,
      hasAlertsFilter,
      1,
      PAGE_SIZE,
      serverFilterMode
    );
    if (err) {
      setPatientsError(err.message || 'Unable to load patients.');
      return;
    }
    setPatientsError(null);
    const items = data ?? [];
    setPatients(items);
    setHasMore(items.length === PAGE_SIZE);
  }, [debouncedSearchTerm, filterMode]);

  const loadMorePatients = useCallback(async () => {
    if (isLoadingMoreRef.current || loadingMore || loading || !hasMore) return;
    isLoadingMoreRef.current = true;
    setLoadingMore(true);

    const nextPage = page + 1;
    const activeSearch = debouncedSearchTerm;
    const hasAlertsFilter = filterMode === 'ALERTS' ? true : undefined;
    const serverFilterMode = (filterMode === 'ALERTS' || filterMode === 'SENIOR_PWD') ? filterMode : undefined;

    const [data, err] = await clinicService.getPatients(
      activeSearch || undefined,
      hasAlertsFilter,
      nextPage,
      PAGE_SIZE,
      serverFilterMode
    );

    setLoadingMore(false);
    isLoadingMoreRef.current = false;

    if (err) {
      return;
    }

    const newItems = data ?? [];
    if (newItems.length > 0) {
      setPatients((prev) => {
        if (!prev) return newItems;
        const existingIds = new Set(prev.map((p) => p.id));
        const deduped = newItems.filter((p) => !existingIds.has(p.id));
        return [...prev, ...deduped];
      });
      setPage(nextPage);
    }

    if (newItems.length < PAGE_SIZE) {
      setHasMore(false);
    }
  }, [page, hasMore, loadingMore, loading, debouncedSearchTerm, filterMode]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;

      // Update scroll position for virtualizer (throttled to 25px steps to avoid unnecessary re-renders)
      const currentY = Math.max(0, contentOffset.y);
      if (Math.abs(currentY - lastScrollYRef.current) >= 25 || currentY === 0) {
        lastScrollYRef.current = currentY;
        setScrollY(currentY);
      }
      if (layoutMeasurement.height > 0 && Math.abs(layoutMeasurement.height - viewportHeightRef.current) >= 50) {
        viewportHeightRef.current = layoutMeasurement.height;
        setViewportHeight(layoutMeasurement.height);
      }

      // Near-bottom detection for infinite scroll
      const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 350;
      if (isNearBottom && hasMore && !loadingMore && !loading) {
        loadMorePatients();
      }
    },
    [hasMore, loadingMore, loading, loadMorePatients]
  );

  useEffect(() => {
    setLoading(true);
    fetchPatients().finally(() => setLoading(false));
    clinicService.getCustomFields('ClinicPatient').then(([fields]) => {
      if (fields && fields.length > 0) {
        setTenantCustomFields(fields);
      }
    });

    const unsub = offlineSyncService.subscribe(() => {
      setOfflinePendingCount(offlineSyncService.getPendingCount());
      setOfflineFailedCount(offlineSyncService.getFailedCount());
    });
    return unsub;
  }, [fetchPatients]);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      fetchPatients();
    }, [fetchPatients])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPatients();
    setRefreshing(false);
  }, [fetchPatients]);

  const handleRegisterPatient = async (options?: { sendToTriage?: boolean; bypassDuplicateCheck?: boolean }) => {
    if (isRegisteringRef.current || savingPatient) return;
    isRegisteringRef.current = true;
    try {
      const sendToTriage = options?.sendToTriage ?? false;

    if (!formFirstName.trim() || !formLastName.trim() || !formPhone.trim() || !formDob.trim()) {
      Alert.alert('Missing details', 'First name, last name, date of birth and phone number are required.');
      return;
    }

    const dobValidation = validateDateString(formDob, { boundaryMode: 'pastOrToday' });
    if (!dobValidation.isValid) {
      Alert.alert('Invalid Date of Birth', dobValidation.errorMessage || 'Please enter a valid date of birth not in the future.');
      return;
    }

    // Defensive custom fields validation
    const staticValues = { gender: formGender, civilStatus: formCivilStatus, dateOfBirth: formDob };
    if (tenantCustomFields.length > 0) {
      const { isValid, errors } = validateCustomFields(tenantCustomFields, dynamicFieldValues, staticValues);
      if (!isValid) {
        setDynamicFieldErrors(errors);
        Alert.alert('Invalid Custom Fields', Object.values(errors).join('\n'));
        return;
      }
    }

    if (formMemberType === 'DD') {
      if (!formPrincipalFullName.trim()) {
        Alert.alert('Missing Details', 'Principal member full name is required for dependents.');
        return;
      }
      if (!formPrincipalRelationship) {
        Alert.alert('Missing Details', 'Relationship to principal member is required.');
        return;
      }
      if (formPrincipalPin.trim() && isPrincipalPinValid === false) {
        Alert.alert('Invalid PIN', 'Principal Member PIN failed Mod-11 verification.');
        return;
      }
      if (formPrincipalDob.trim()) {
        const pDobCheck = validateDateString(formPrincipalDob, { boundaryMode: 'pastOrToday' });
        if (!pDobCheck.isValid) {
          Alert.alert('Invalid Date of Birth', pDobCheck.errorMessage || 'Principal Date of Birth cannot be in the future.');
          return;
        }
      }
    }

    // Pre-flight duplicate check safeguard: surface warning modal if duplicate candidates detected
    if (!options?.bypassDuplicateCheck) {
      const [dupCheck] = await clinicService.checkPatientDuplicates({
        firstName: formFirstName.trim(),
        lastName: formLastName.trim(),
        dateOfBirth: formDob.trim(),
        contactNumber: formPhone.trim(),
        philHealthNumber: formPhilHealth.trim() || undefined,
      });

      if (dupCheck && dupCheck.hasDuplicates && dupCheck.matches.length > 0) {
        setDetectedDuplicates(dupCheck.matches);
        setPendingRegisterOptions(options ?? null);
        setDuplicateWarningVisible(true);
        return;
      }
    }

    setSavingPatient(true);

    const customFields: Record<string, any> = {};
    if (tenantCustomFields.length > 0) {
      const cleanCustom = sanitizeCustomFieldsPayload(tenantCustomFields, dynamicFieldValues, staticValues);
      Object.assign(customFields, cleanCustom);
    } else {
      if (formClassification === 'Student') {
        customFields['classification'] = 'Student';
        if (formStudentId.trim()) customFields['student_id'] = formStudentId.trim();
        if (formCollege.trim()) customFields['college'] = formCollege.trim();
        if (formProgram.trim()) customFields['program'] = formProgram.trim();
        if (formYearLevel.trim()) customFields['year_level'] = formYearLevel.trim();
      } else if (formClassification === 'Employee') {
        customFields['classification'] = 'Employee';
        if (formEmployeeId.trim()) customFields['employee_id'] = formEmployeeId.trim();
        if (formDepartment.trim()) customFields['department'] = formDepartment.trim();
      }
    }

    if (dynamicFieldValues['yakap_enlistments']) {
      customFields['yakap_enlistments'] = dynamicFieldValues['yakap_enlistments'];
    }

    customFields['member_type'] = formMemberType;
    if (formMemberType === 'DD') {
      customFields['principal_member_pin'] = formPrincipalPin.trim();
      customFields['principal_full_name'] = formPrincipalFullName.trim();
      customFields['principal_relationship'] = formPrincipalRelationship;
      if (formPrincipalDob.trim()) customFields['principal_dob'] = formPrincipalDob.trim();
    }

    customFields['philhealth_profile'] = buildPhilHealthProfileData({
      memberType: formMemberType,
      patientPin: formPhilHealth,
      patientFirstName: formFirstName,
      patientLastName: formLastName,
      patientMiddleName: formMiddleName,
      patientDob: formDob,
      principalPin: formPrincipalPin,
      principalFullName: formPrincipalFullName,
      principalRelationship: formPrincipalRelationship,
      principalDob: formPrincipalDob,
    });

    const allergiesSummary = structuredAllergies.length > 0
      ? structuredAllergies.map((a) => `${a.allergen} (${a.category}${a.isAnaphylactic ? ' - STAT' : ''})`).join(', ')
      : formAllergies.trim() || undefined;

    const payload: RegisterPatientPayload = {
      firstName: formFirstName.trim(),
      lastName: formLastName.trim(),
      middleName: formMiddleName.trim() || undefined,
      dateOfBirth: formDob.trim(),
      gender: formGender,
      civilStatus: formCivilStatus,
      contactNumber: formPhone.trim(),
      email: formEmail.trim() || undefined,
      philHealthNumber: formPhilHealth.trim() || undefined,
      seniorCitizenId: formSeniorId.trim() || undefined,
      pwdId: formPwdId.trim() || undefined,
      bloodType: formBloodType || undefined,
      allergies: allergiesSummary,
      chronicConditions: formMedicalHistories.length > 0
        ? formatMedicalHistoriesSummary(formMedicalHistories)
        : formChronicConditions.trim() || undefined,
      alerts: formAlerts.trim() || undefined,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      verificationStatus: 'Verified',
      structuredAllergies: structuredAllergies.length > 0 ? structuredAllergies : undefined,
      medicalHistories: formMedicalHistories.length > 0 ? formMedicalHistories : undefined,
      sendToTriage,
      priority: sendToTriage ? formTriagePriority : 'Routine',
      chiefComplaint: sendToTriage && formChiefComplaint.trim() ? formChiefComplaint.trim() : undefined,
      doctorId: sendToTriage && formTriageDoctorId ? formTriageDoctorId : undefined,
      doctorName:
        sendToTriage && formTriageDoctorId
          ? (() => {
              const d = activeDoctors.find((doc) => doc.id === formTriageDoctorId);
              return d ? formatStaffName(d) : undefined;
            })()
          : undefined,
      roomId: sendToTriage && formTriageRoomId ? formTriageRoomId : undefined,
      roomOrStation:
        sendToTriage && formTriageRoomId
          ? activeRooms.find((r) => r.id === formTriageRoomId)?.name
          : undefined,
      queueDate: sendToTriage ? getManilaTodayStr() : undefined,
      ...(formPatientCode.trim() ? ({ patientCode: formPatientCode.trim() } as any) : {}),
    };

    const [newPat, err] = await clinicService.registerPatient(payload);
    setSavingPatient(false);

    if (newPat) {
      setPatients((prev) => [newPat, ...(prev ?? [])]);
      setFormFieldErrors({});
      if (sendToTriage) {
        const ticketText = newPat.activeQueueTicket ? ` (${newPat.activeQueueTicket})` : '';
        notify.success(`${newPat.fullName} registered & queued for triage${ticketText}.`);
      } else {
        notify.success(`${newPat.fullName} registered (${newPat.patientCode}).`);
      }
    } else if (shouldQueueOffline(err?.status ?? 0)) {
      // Server unreachable: keep the registration on this device and sync it when the connection is back.
      const offlinePat = await offlineSyncService.enqueuePatient(payload);
      setPatients((prev) => [offlinePat, ...(prev ?? [])]);
      const triageNote = sendToTriage ? ' and will be placed in the triage queue upon sync' : '';
      Alert.alert(
        'Saved on this device',
        `${offlinePat.fullName} was saved locally because the server could not be reached. It will sync automatically${triageNote}.${err?.message ? `\n\n${err.message}` : ''}`
      );
    } else {
      // The server answered and refused: extract field errors and bind to form inputs
      const fieldErrorsMap: Record<string, string> = {};
      if (err) {
        if (typeof err.getFieldErrorsMap === 'function') {
          Object.assign(fieldErrorsMap, err.getFieldErrorsMap());
        }
        const pcErr = err.getFieldError?.('patientCode');
        if (pcErr) fieldErrorsMap.patientCode = pcErr;

        const fnErr = err.getFieldError?.('firstName');
        if (fnErr) fieldErrorsMap.firstName = fnErr;

        const lnErr = err.getFieldError?.('lastName');
        if (lnErr) fieldErrorsMap.lastName = lnErr;

        const mnErr = err.getFieldError?.('middleName');
        if (mnErr) fieldErrorsMap.middleName = mnErr;

        const dobErr = err.getFieldError?.('dateOfBirth') || err.getFieldError?.('dob');
        if (dobErr) fieldErrorsMap.dateOfBirth = dobErr;

        const phoneErr = err.getFieldError?.('contactNumber') || err.getFieldError?.('phone');
        if (phoneErr) fieldErrorsMap.contactNumber = phoneErr;

        const philErr = err.getFieldError?.('philHealthId') || err.getFieldError?.('philHealthPin') || err.getFieldError?.('philHealthNumber');
        if (philErr) {
          fieldErrorsMap.philHealthId = philErr;
          fieldErrorsMap.philHealthPin = philErr;
          fieldErrorsMap.philHealthNumber = philErr;
        }
      }
      setFormFieldErrors(fieldErrorsMap);

      const errorMessage = err?.message || 'The server rejected this registration.';
      notify.error(errorMessage, { traceId: err?.traceId });
      return;
    }

    setRegisterVisible(false);
    resetRegistrationForm();

    if (newPat) {
      const ticketNote =
        sendToTriage && newPat.activeQueueTicket
          ? ` and queued for triage (${newPat.activeQueueTicket})`
          : sendToTriage
            ? ' and queued for triage'
            : '';
      Alert.alert(
        'Patient Registered',
        `${newPat.fullName} (${newPat.patientCode}) has been registered${ticketNote}. What would you like to do next?`,
        [
          {
            text: 'Close',
            style: 'cancel',
          },
          {
            text: 'Register New Patient',
            style: 'cancel',
            onPress: () => {
              resetRegistrationForm();
              setRegisterVisible(true);
            },
          },
          {
            text: 'Open Chart',
            onPress: () => {
              handleOpenChart(newPat);
            },
          },
        ]
      );
    }
    } finally {
      isRegisteringRef.current = false;
    }
  };

  const resetRegistrationForm = () => {
    setDynamicFieldValues({});
    setDynamicFieldErrors({});
    setFormFieldErrors({});
    setFormPatientCode('');
    setFormClassification('General');
    setFormStudentId('');
    setFormCollege('');
    setFormProgram('');
    setFormYearLevel('');
    setFormEmployeeId('');
    setFormDepartment('');
    setFormFirstName('');
    setFormLastName('');
    setFormMiddleName('');
    setFormDob('');
    setFormGender('Male');
    setFormCivilStatus('Single');
    setFormPhone('');
    setFormEmail('');
    setFormPhilHealth('');
    setFormSeniorId('');
    setFormPwdId('');
    setFormBloodType('');
    setFormAllergies('');
    setFormChronicConditions('');
    setFormMedicalHistories([]);
    setMedicalHistoryModalVisible(false);
    setFormAlerts('');
    setStructuredAllergies([]);
    setIsPinValid(null);
    setFormChiefComplaint('');
    setFormTriagePriority('Routine');
    setFormTriageDoctorId('');
    setFormTriageRoomId('');
    setFormMemberType('MM');
    setFormPrincipalPin('');
    setFormPrincipalFullName('');
    setFormPrincipalRelationship('C');
    setFormPrincipalDob('');
    setIsPrincipalPinValid(null);
  };

  const handleUseExistingProfile = async (patientId: string) => {
    setDuplicateWarningVisible(false);
    setPendingRegisterOptions(null);
    setRegisterVisible(false);
    resetRegistrationForm();
    await handleViewExistingPatient(patientId);
  };

  const handleCreateProfileAnyway = async () => {
    setDuplicateWarningVisible(false);
    const options = pendingRegisterOptions;
    setPendingRegisterOptions(null);
    await handleRegisterPatient({
      sendToTriage: options?.sendToTriage ?? false,
      bypassDuplicateCheck: true,
    });
  };

  const handleCloseDuplicateWarning = () => {
    setDuplicateWarningVisible(false);
    setPendingRegisterOptions(null);
  };

  const handleViewExistingPatient = async (patientId: string) => {
    setRegisterVisible(false);
    const [patient, err] = await clinicService.getPatientById(patientId);
    if (patient) {
      handleOpenChart(patient);
    } else {
      Alert.alert('Error', err?.message || 'Could not load existing patient record.');
    }
  };

  const handleOpenChart = async (patient: ClinicPatient, tabToOpen?: ChartTab, toothToFocus?: number) => {
    setSelectedPatient(patient);
    const targetTab = tabToOpen ?? activeChartTab ?? getInitialChartTab();
    setActiveChartTab(targetTab);
    if (toothToFocus !== undefined) {
      setFocusToothNumber(toothToFocus);
    }
    setSessionItem('clinicez_active_patient_id', patient.id);
    setSessionItem('clinicez_active_chart_tab', targetTab);
    if (typeof window !== 'undefined' && window.history?.replaceState && window.location) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('patientId', patient.id);
        url.searchParams.set('tab', targetTab);
        if (toothToFocus !== undefined) {
          url.searchParams.set('toothNumber', String(toothToFocus));
        }
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }
    setChartVisible(true);
    setLoadingChart(true);
    setLoadingAttachments(true);
    setPatientChart(null);
    const [chartData, chartErr] = await clinicService.getPatientChart(patient.id);
    if (chartData) {
      if (!chartData.dentalTeeth || chartData.dentalTeeth.length === 0) {
        const [dentalData] = await clinicService.getPatientDentalChart(patient.id);
        if (dentalData?.teeth && dentalData.teeth.length > 0) {
          chartData.dentalTeeth = dentalData.teeth;
          chartData.dentalChart = dentalData;
        }
      }
      setPatientChart(chartData);
      setChartError(null);
      if (chartData.attachments && chartData.attachments.length > 0) {
        setPatientAttachments(chartData.attachments);
        setLoadingAttachments(false);
      }
    } else {
      setChartError(chartErr?.message || 'Unable to load the patient chart.');
    }
    setLoadingChart(false);

    // Fetch attachments fallback if not populated
    if (!chartData?.attachments) {
      const [attData] = await clinicService.getPatientRecordAttachments(patient.id);
      if (attData) {
        setPatientAttachments(attData);
      } else {
        setPatientAttachments([]);
      }
      setLoadingAttachments(false);
    }
  };

  const handleCloseChart = () => {
    setChartVisible(false);
    setSelectedPatient(null);
    setFocusToothNumber(undefined);
    setSessionItem('clinicez_active_patient_id', null);
    if (typeof window !== 'undefined' && window.history?.replaceState && window.location) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('patientId');
        url.searchParams.delete('tab');
        url.searchParams.delete('subTab');
        url.searchParams.delete('tooth');
        url.searchParams.delete('toothNumber');
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }
  };

  // Restore open chart session on mount if page was refreshed
  useEffect(() => {
    if (openPatientId) return; // Handled by openPatientId effect below
    let targetPatientId: string | null = null;
    if (typeof window !== 'undefined' && window.location?.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        targetPatientId = sp.get('patientId');
      } catch {}
    }
    if (!targetPatientId) {
      targetPatientId = getSessionItem('clinicez_active_patient_id');
    }
    if (!targetPatientId) return;

    let cancelled = false;
    (async () => {
      const [patient] = await clinicService.getPatientById(targetPatientId!);
      if (cancelled || !patient) return;
      const initialTab = getInitialChartTab();
      const initialTooth = getInitialFocusTooth();
      handleOpenChart(patient, initialTab, initialTooth);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arriving from "Scan patient QR", Global Search, or in-app deep link: open the patient's chart once.
  useEffect(() => {
    if (!openPatientId) return;
    let cancelled = false;
    (async () => {
      const [patient, err] = await clinicService.getPatientById(openPatientId);
      if (cancelled) return;
      navigation.setParams({
        openPatientId: undefined,
        patientId: undefined,
        tab: undefined,
        toothNumber: undefined,
        tooth: undefined,
      });
      if (patient) {
        setPatients((prev) => {
          if (!prev) return [patient];
          const index = prev.findIndex((p) => p.id === patient.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = { ...next[index], ...patient };
            return next;
          }
          return [patient, ...prev];
        });
        const targetTab = routeTab || (routeToothNumber ? 'dental' : undefined);
        handleOpenChart(patient, targetTab, routeToothNumber);
      } else {
        notify.error(err?.message || 'Could not open the imported patient.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPatientId, routeTab, routeToothNumber]);

  // Reactive tab/tooth switching when chart is already open for the active patient
  useEffect(() => {
    if (chartVisible && selectedPatient && !openPatientId) {
      if (routeTab) {
        setActiveChartTab(routeTab);
      }
      if (routeToothNumber !== undefined) {
        setFocusToothNumber(routeToothNumber);
        if (!routeTab) {
          setActiveChartTab('dental');
        }
      }
      if (routeTab || routeToothNumber !== undefined) {
        navigation.setParams({
          tab: undefined,
          toothNumber: undefined,
          tooth: undefined,
        });
      }
    }
  }, [chartVisible, selectedPatient, openPatientId, routeTab, routeToothNumber]);

  // Arriving from Dashboard "New patient": open the registration dialog automatically.
  useEffect(() => {
    if (!openRegister) return;
    navigation.setParams({ openRegister: undefined });
    resetRegistrationForm();
    setRegisterVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRegister]);

  const handleOpenPhilHealthProfile = (patient: ClinicPatient) => {
    setSelectedPatientForProfile(patient);
    setPhilHealthProfileModalVisible(true);
  };

  const handlePhilHealthProfileSaved = () => {
    fetchPatients();
    if (selectedPatient && chartVisible) {
      handleOpenChart(selectedPatient, activeChartTab);
    }
  };

  const handleOpenEditDemographics = (patient: ClinicPatient) => {
    setPatientToEdit(patient);
    setEditPatientModalVisible(true);
  };

  const handlePatientDemographicsSaved = (updated: ClinicPatient) => {
    setPatients((prev) =>
      prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : [updated]
    );
    if (selectedPatient?.id === updated.id) {
      setSelectedPatient(updated);
    }
  };

  const handleVerifyAttachment = async (
    attachmentId: string,
    isApproved: boolean,
    userRejectionReason?: string
  ) => {
    setVerifyingAttachmentId(attachmentId);
    const rejectionReason = !isApproved
      ? (userRejectionReason?.trim() || 'Document illegible or missing official physician signature/stamp.')
      : undefined;
    const [, verifyErr] = await clinicService.verifyRecordAttachment(attachmentId, isApproved, rejectionReason);
    setVerifyingAttachmentId(null);
    if (verifyErr) {
      notify.error(verifyErr.message || 'Could not update the document.');
      return;
    }

    setPatientAttachments((prev) =>
      prev.map((att) =>
        att.id === attachmentId
          ? {
              ...att,
              verificationStatus: isApproved ? 'Verified' : 'Rejected',
              rejectionReason,
              verifiedAt: new Date().toISOString(),
              verifiedByStaffName: currentName || undefined,
            }
          : att
      )
    );

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

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPickedDocFile({
        name: asset.name,
        size: asset.size,
        uri: asset.uri,
        mimeType: asset.mimeType || (asset.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        file: (asset as any).file,
      });
      if (!docTitle.trim()) {
        const cleanName = asset.name.replace(/\.[^/.]+$/, '');
        setDocTitle(cleanName);
      }
      if (asset.name.toLowerCase().endsWith('.pdf')) {
        setDocFileType('PDF');
      } else {
        setDocFileType('Photo');
      }
    } catch (err: any) {
      Alert.alert('File Selection Error', err?.message || 'Could not pick file.');
    }
  };

  const handleUploadDocument = async () => {
    if (!selectedPatient) return;
    if (!docTitle.trim()) {
      Alert.alert('Title required', 'Enter a document title.');
      return;
    }

    const docDateValidation = validateDateString(docDate, { boundaryMode: 'pastOrToday' });
    if (!docDateValidation.isValid) {
      Alert.alert('Invalid Document Date', docDateValidation.errorMessage || 'Please enter a valid document date not in the future.');
      return;
    }

    const strictlyFormattedDocDate = (docDateValidation.formattedDate || new Date().toISOString().split('T')[0]).split('T')[0];

    setUploadingDoc(true);

    if (pickedDocFile) {
      try {
        const formData = new FormData();
        formData.append('PatientId', selectedPatient.id);
        formData.append('RecordType', docRecordType);
        formData.append('Title', docTitle.trim());
        if (docNotes.trim()) formData.append('Notes', docNotes.trim());
        formData.append('DocumentDate', strictlyFormattedDocDate);

        if (pickedDocFile.file) {
          formData.append('File', pickedDocFile.file);
        } else {
          formData.append('File', {
            uri: pickedDocFile.uri,
            name: pickedDocFile.name,
            type: pickedDocFile.mimeType || 'application/octet-stream',
          } as any);
        }

        const [newAtt, err] = await clinicService.uploadRecordAttachmentFile(formData);
        setUploadingDoc(false);

        if (newAtt) {
          setPatientAttachments((prev) => [newAtt, ...prev]);
          setUploadDocModalVisible(false);
          setPickedDocFile(null);
          setDocTitle('');
          setDocNotes('');
          setDocDate(new Date().toISOString().split('T')[0]);
          notify.success('Document attached to the patient record.');
          return;
        } else if (err) {
          notify.error(err.message || 'The server rejected this document upload.');
          return;
        }
      } catch (uploadErr: any) {
        setUploadingDoc(false);
        notify.error(uploadErr?.message || 'Failed to upload document file.');
        return;
      }
    }

    const payload = {
      patientId: selectedPatient.id,
      recordType: docRecordType,
      title: docTitle.trim(),
      fileName: `${docTitle.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}`,
      contentType: docFileType === 'PDF' ? 'application/pdf' : 'image/jpeg',
      fileSizeBytes: 1024 * 450,
      storageUri: `tenants/${selectedPatient.tenantId}/clinics/${selectedPatient.clinicId}/records/${Date.now()}.${docFileType === 'PDF' ? 'pdf' : 'jpg'}.cez`,
      documentDate: strictlyFormattedDocDate,
      notes: docNotes.trim() || undefined,
      uploadedByStaffName: currentName || undefined,
      encryptionAlgorithm: 'AES-256-GCM',
      encryptionKeyId: 'cmk-v1',
    };

    const [newAtt, err] = await clinicService.uploadRecordAttachment(payload);
    setUploadingDoc(false);

    if (newAtt) {
      setPatientAttachments((prev) => [newAtt, ...prev]);
      setUploadDocModalVisible(false);
      setPickedDocFile(null);
      setDocTitle('');
      setDocNotes('');
      setDocDate(new Date().toISOString().split('T')[0]);
      notify.success('Document attached to the patient record.');
    } else if (!shouldQueueOffline(err?.status ?? 0)) {
      notify.error(err?.message || 'The server rejected this document.');
    } else {
      const queuedAtt = await offlineSyncService.enqueueAttachment(payload, currentName || undefined);
      setPatientAttachments((prev) => [queuedAtt, ...prev]);
      setUploadDocModalVisible(false);
      setPickedDocFile(null);
      setDocTitle('');
      setDocNotes('');
      setDocDate(new Date().toISOString().split('T')[0]);
      Alert.alert('Saved on this device', 'The document is queued and will upload automatically once the connection is back.');
    }
  };

  const handleViewSlip = async (orderId: string) => {
    const [slip, slipErr] = await clinicService.getLabOrderSlip(orderId);
    if (slip) {
      setSelectedSlip(slip);
      setSlipModalVisible(true);
    } else {
      notify.error(slipErr?.message || 'Unable to load the lab requisition slip.');
    }
  };

  const handleOpenAttach = (orderId: string) => {
    setTargetOrderId(orderId);
    setAttachModalVisible(true);
  };

  const handleConfirmAttach = async () => {
    if (!targetOrderId) return;
    setAttaching(true);
    const [updated, err] = await clinicService.attachExternalLabResult(targetOrderId, {
      externalLabName,
      documentType: externalFileType,
      notes: externalNotes,
      documentUrl: [getSetting('EXPO_PUBLIC_STORAGE_PUBLIC_URL'), 'external-labs', 'lab-result.pdf'].filter(Boolean).join('/'),
      uploadedBy: currentName || undefined
    });
    setAttaching(false);
    setAttachModalVisible(false);

    if (err) {
      notify.error(err.message || 'Could not attach the laboratory result.');
    } else {
      notify.success('External laboratory result attached. Requisition marked as completed.');
    }
    if (selectedPatient) {
      handleOpenChart(selectedPatient);
    }
  };

  const handleViewPrescriptionSlip = async (consultation: ConsultationRecord) => {
    const [slip, slipErr] = await clinicService.getPrescriptionSlip(consultation.id);
    if (slip) {
      setSelectedRxSlip(slip);
      setRxSlipModalVisible(true);
    } else {
      notify.error(slipErr?.message || 'Unable to load the prescription slip.');
    }
  };

  const handleOpenExternalDispense = (consultation: ConsultationRecord) => {
    setTargetConsultationId(consultation.id);
    setTargetPrescriptionNumber(consultation.prescriptionNumber);
    setExternalDispenseModalVisible(true);
  };

  const handleExternalDispenseSuccess = (updatedSlip: PrescriptionSlipData) => {
    if (patientChart) {
      const updatedConsultations = patientChart.consultations.map(c => {
        if (c.id === updatedSlip.consultationId) {
          return {
            ...c,
            rxDispenseStatus: 'DispensedExternally' as const,
            rxDispensedPharmacyName: updatedSlip.dispensedPharmacyName,
            rxDispensedPharmacistName: updatedSlip.dispensedPharmacistName,
            rxDispensedPharmacistPrc: updatedSlip.dispensedPharmacistPrc,
            rxDispensedReceiptNumber: updatedSlip.dispensedReceiptNumber,
            rxDispensedAt: updatedSlip.dispensedAt,
            rxDispenseNotes: updatedSlip.dispenseNotes,
          };
        }
        return c;
      });
      setPatientChart({ ...patientChart, consultations: updatedConsultations });
    }
    setSelectedRxSlip(updatedSlip);
  };

  const handleQueueCheckIn = (patient: ClinicPatient) => {
    if (isCheckingInRef.current || checkingInPatientId) return;
    const isUrgent =
      patient.alerts?.toLowerCase().includes('fall') ||
      patient.alerts?.toLowerCase().includes('chest');
    const defaultDoc =
      currentStaff?.role === 'Doctor' && currentStaff.isActive ? currentStaff : null;
    const defaultDocRooms = defaultDoc?.assignedRoomIds ?? (defaultDoc?.assignedRoomId ? [defaultDoc.assignedRoomId] : []);
    setCheckInModalPatient(patient);
    setCheckInDoctorId(defaultDoc?.id ?? '');
    setCheckInRoomId(defaultDocRooms[0] ?? '');
    setCheckInPriority(isUrgent ? 'Urgent' : 'Routine');
    setCheckInVisitType('Consultation');
    setCheckInComplaint(
      patient.chronicConditions
        ? `Follow-up: ${patient.chronicConditions}`
        : 'General consultation',
    );
  };

  const handleSelectCheckInDoctor = (docId: string) => {
    setCheckInDoctorId(docId);
    if (!docId) {
      return;
    }
    const doc = activeDoctors.find((d) => d.id === docId);
    const docRooms = doc?.assignedRoomIds ?? (doc?.assignedRoomId ? [doc.assignedRoomId] : []);
    if (docRooms.length > 0) {
      setCheckInRoomId(docRooms[0]);
    }
  };

  const handleConfirmQueueCheckIn = async () => {
    if (!checkInModalPatient || isCheckingInRef.current || checkingInPatientId) return;
    const patient = checkInModalPatient;
    isCheckingInRef.current = true;
    setCheckingInPatientId(patient.id);

    const chosenDoctor = checkInDoctorId
      ? activeDoctors.find((d) => d.id === checkInDoctorId)
      : undefined;
    const chosenRoom = checkInRoomId
      ? activeRooms.find((r) => r.id === checkInRoomId)
      : undefined;

    try {
      const [, checkInErr] = await clinicService.checkInPatient({
        patientId: patient.id,
        patientName: patient.fullName,
        doctorId: chosenDoctor?.id,
        doctorName: chosenDoctor ? formatStaffName(chosenDoctor) : undefined,
        roomId: chosenRoom?.id,
        roomOrStation: chosenRoom?.name,
        priority: checkInPriority,
        visitType: checkInVisitType,
        chiefComplaint: checkInComplaint.trim() || 'General consultation',
        queueDate: getManilaTodayStr(),
      });
      if (checkInErr) {
        if (
          checkInErr.status === 409 ||
          checkInErr.errorCode === 'CONFLICT' ||
          checkInErr.errorCode === 'active_queue_ticket_exists'
        ) {
          setCheckInModalPatient(null);
          setConflictModal({
            visible: true,
            error: checkInErr,
            patientName: patient.fullName,
          });
          return;
        }
        notify.error(checkInErr.message || 'Could not add the patient to the queue.');
        return;
      }
      setCheckInModalPatient(null);
      navigation.navigate('Dashboard');
    } finally {
      isCheckingInRef.current = false;
      setCheckingInPatientId(null);
    }
  };

  const filterCounts = useMemo(() => {
    if (!patients) return null;
    let students = 0;
    let employees = 0;
    let alerts = 0;
    let seniorPwd = 0;
    for (const p of patients) {
      if (p.customFields?.classification === 'Student' || !!p.customFields?.student_id) {
        students++;
      }
      if (p.customFields?.classification === 'Employee' || !!p.customFields?.employee_id) {
        employees++;
      }
      if (hasKnownAllergies(p.allergies) || (p.alerts && p.alerts.trim().length > 0)) {
        alerts++;
      }
      if (!!p.seniorCitizenId || !!p.pwdId || p.age >= 60) {
        seniorPwd++;
      }
    }
    return {
      all: patients.length,
      students,
      employees,
      alerts,
      seniorPwd,
    };
  }, [patients]);

  const filteredPatients = (patients ?? []).filter((p) => {
    if (filterMode === 'ALERTS') {
      return hasKnownAllergies(p.allergies) || !!(p.alerts && p.alerts.trim().length > 0);
    }
    if (filterMode === 'SENIOR_PWD') {
      return !!p.seniorCitizenId || !!p.pwdId || p.age >= 60;
    }
    if (filterMode === 'STUDENTS') {
      return p.customFields?.classification === 'Student' || !!p.customFields?.student_id;
    }
    if (filterMode === 'EMPLOYEES') {
      return p.customFields?.classification === 'Employee' || !!p.customFields?.employee_id;
    }
    return true;
  });

  const isTable = effectiveViewMode === 'table';
  const itemHeight = isTable ? 64 : 270;
  const itemsPerRow = isTable ? 1 : isDesktop ? 2 : 1;

  const virtualWindow = useVirtualList({
    items: filteredPatients,
    itemHeight,
    viewportHeight,
    scrollY,
    listTopOffset,
    itemsPerRow,
    overscan: isTable ? 8 : 4,
  });

  const visibleCardRows = useMemo(() => {
    if (isTable) return [];
    const rows: Array<{ key: string; items: ClinicPatient[] }> = [];
    const slice = virtualWindow.visibleItems;
    const step = isDesktop ? 2 : 1;
    for (let i = 0; i < slice.length; i += step) {
      const pair = slice.slice(i, i + step);
      const globalRowIndex = Math.floor((virtualWindow.startIndex + i) / step);
      rows.push({
        key: `card-row-${globalRowIndex}-${pair[0].id}`,
        items: pair,
      });
    }
    return rows;
  }, [isTable, virtualWindow.visibleItems, virtualWindow.startIndex, isDesktop]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    handleFilterModeChange('ALL');
  };

  const handleSyncNow = async () => {
    setSyncingOffline(true);
    const report = await offlineSyncService.syncPendingOutbox({ force: true });
    setSyncingOffline(false);
    const synced = report.syncedPatients + report.syncedAttachments;
    const remaining = report.failedCount > 0 ? ` ${report.failedCount} still waiting.` : '';
    const rejected = report.deadCount > 0 ? ` ${report.deadCount} need attention.` : '';
    Alert.alert(
      synced > 0 ? 'Sync complete' : 'Nothing synced',
      `Synced ${report.syncedPatients} patient(s) and ${report.syncedAttachments} attachment(s).${remaining}${rejected}` +
        (report.errors.length > 0 ? `\n\n${report.errors.slice(0, 3).join('\n')}` : '')
    );
    fetchPatients();
  };

  const retryPatients = () => {
    setLoading(true);
    fetchPatients().finally(() => setLoading(false));
  };

  const showSkeleton = loading && !refreshing && patients === null;

  return (
    <ResponsiveLayout
      headerTitle="Patients"
      actions={[
        ...(canImportPatient
          ? [
              {
                id: 'scan',
                label: 'Scan patient QR',
                shortLabel: 'Scan QR',
                icon: 'scan' as const,
                variant: 'outline' as const,
                onPress: () => navigation.navigate('ShareImport'),
              },
            ]
          : []),
        {
          id: 'register',
          label: 'Register patient',
          shortLabel: 'Register',
          icon: 'plus' as const,
          variant: 'primary' as const,
          primary: true,
          onPress: () => setRegisterVisible(true),
        },
      ]}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
      {/* Offline outbox sync banner */}
      {offlinePendingCount > 0 && (
        <View style={styles.offlineBanner}>
          <Icon name="wifi" size={theme.sizes.iconMd} color={theme.colors.warningText} />
          <View style={styles.offlineBannerText}>
            <ThemedText variant="bodyBold" color={theme.colors.warningText}>
              {offlinePendingCount} item{offlinePendingCount > 1 ? 's' : ''} waiting to sync
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.warningText}>
              Registrations and documents saved on this device are uploaded once the connection is back.
            </ThemedText>
          </View>
          <Button
            title={syncingOffline ? 'Syncing…' : 'Sync now'}
            variant="outline"
            size="sm"
            icon="refresh"
            loading={syncingOffline}
            disabled={syncingOffline}
            onPress={handleSyncNow}
          />
        </View>
      )}

      {offlineFailedCount > 0 && (
        <View style={styles.offlineFailedBanner}>
          <Icon name="alert" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
          <View style={styles.offlineBannerText}>
            <ThemedText variant="bodyBold" color={theme.colors.emergencyText}>
              {offlineFailedCount} saved item{offlineFailedCount > 1 ? 's' : ''} could not be synced
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.emergencyText}>
              The server rejected them. Retry after fixing the cause, or discard them.
            </ThemedText>
          </View>
          <Button title="Retry" variant="outline" size="sm" icon="refresh" onPress={() => offlineSyncService.retryFailed()} />
          <Button title="Discard" variant="outline" size="sm" onPress={() => offlineSyncService.discardFailed()} />
        </View>
      )}

      {/* Search */}
      <Input
        value={searchTerm}
        onChangeText={setSearchTerm}
        onSubmitEditing={() => {
          setDebouncedSearchTerm(searchTerm);
          fetchPatients(searchTerm);
        }}
        placeholder="Search by name, patient code, phone or ID number"
        leftIcon="search"
        rightIcon={searchTerm ? 'close' : undefined}
        onRightIconPress={() => {
          setSearchTerm('');
          setDebouncedSearchTerm('');
        }}
        returnKeyType="search"
        containerStyle={styles.searchInput}
      />

      {/* Filters & Workstation View Switcher Toolbar */}
      <View style={styles.toolbarRow}>
        <SegmentedControl<PatientFilter>
          value={filterMode}
          onChange={handleFilterModeChange}
          options={[
            { value: 'ALL', label: 'All patients', count: filterCounts?.all },
            { value: 'STUDENTS', label: 'Students', count: filterCounts?.students },
            { value: 'EMPLOYEES', label: 'Employees', count: filterCounts?.employees },
            { value: 'ALERTS', label: 'Alerts & allergies', count: filterCounts?.alerts },
            { value: 'SENIOR_PWD', label: 'Senior & PWD', count: filterCounts?.seniorPwd },
          ]}
        />

        {isWorkstation ? (
          <View style={styles.toolbarRight}>
            {patients !== null ? (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {filteredPatients.length} loaded{hasMore ? ' • Scroll for more' : ''}
              </ThemedText>
            ) : null}
            <SegmentedControl<PatientDirectoryViewMode>
              value={viewMode}
              onChange={handleViewModeChange}
              options={[
                { value: 'cards', label: 'Cards' },
                { value: 'table', label: 'Compact Table' },
              ]}
            />
          </View>
        ) : null}
      </View>

      {showSkeleton ? (
        <Card>
          <View style={styles.skeletonWrap}>
            <SkeletonList rows={5} rowHeight={theme.sizes.controlLg + theme.spacing.lg} />
          </View>
        </Card>
      ) : patientsError && patients === null ? (
        <ErrorState title="Unable to load patients" message={patientsError} onRetry={retryPatients} />
      ) : filteredPatients.length === 0 ? (
        <Card>
          <EmptyState
            icon="patients"
            title={searchTerm || filterMode !== 'ALL' ? 'No patients match your search' : 'No patients registered yet'}
            description={
              searchTerm || filterMode !== 'ALL'
                ? 'Try a different name, code or filter.'
                : 'Register the first patient to start building the clinic registry.'
            }
            actionTitle={searchTerm || filterMode !== 'ALL' ? 'Clear search & filters' : 'Register patient'}
            onAction={searchTerm || filterMode !== 'ALL' ? handleResetFilters : () => setRegisterVisible(true)}
          />
        </Card>
      ) : effectiveViewMode === 'table' ? (
        <Card style={styles.tableCard}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tableScrollContent}
          >
            <View
              style={styles.tableInner}
              onLayout={(e) => {
                const layoutY = e.nativeEvent.layout.y;
                if (layoutY > 0 && Math.abs(layoutY - listTopOffset) > 10) {
                  setListTopOffset(layoutY);
                }
              }}
            >
              <PatientDirectoryTableHeader />
              {virtualWindow.paddingTop > 0 && (
                <View style={{ height: virtualWindow.paddingTop, width: '100%' }} />
              )}
              {virtualWindow.visibleItems.map((item) => (
                <PatientDirectoryCard
                  key={item.id}
                  patient={item}
                  mode="table"
                  checkingIn={checkingInPatientId === item.id}
                  disableCheckIn={!!checkingInPatientId}
                  onOpenChart={(p) => handleOpenChart(p)}
                  onEditDemographics={handleOpenEditDemographics}
                  onOpenPhilHealth={handleOpenPhilHealthProfile}
                  onBookAppointment={(p) =>
                    navigation.navigate('Appointments', {
                      patientId: p.id,
                      patientName: p.fullName,
                      patientCode: p.patientCode,
                    })
                  }
                  onAddToQueue={handleQueueCheckIn}
                />
              ))}
              {virtualWindow.paddingBottom > 0 && (
                <View style={{ height: virtualWindow.paddingBottom, width: '100%' }} />
              )}
            </View>
          </ScrollView>
        </Card>
      ) : (
        <View
          style={styles.virtualListContainer}
          onLayout={(e) => {
            const layoutY = e.nativeEvent.layout.y;
            if (layoutY > 0 && Math.abs(layoutY - listTopOffset) > 10) {
              setListTopOffset(layoutY);
            }
          }}
        >
          {virtualWindow.paddingTop > 0 && (
            <View style={{ height: virtualWindow.paddingTop, width: '100%' }} />
          )}
          {visibleCardRows.map((row) => (
            <View
              key={row.key}
              style={isDesktop ? styles.cardRowDesktop : styles.cardRowMobile}
            >
              {row.items.map((item) => (
                <PatientDirectoryCard
                  key={item.id}
                  patient={item}
                  mode="card"
                  isDesktopGrid={isDesktop}
                  checkingIn={checkingInPatientId === item.id}
                  disableCheckIn={!!checkingInPatientId}
                  onOpenChart={(p) => handleOpenChart(p)}
                  onEditDemographics={handleOpenEditDemographics}
                  onOpenPhilHealth={handleOpenPhilHealthProfile}
                  onBookAppointment={(p) =>
                    navigation.navigate('Appointments', {
                      patientId: p.id,
                      patientName: p.fullName,
                      patientCode: p.patientCode,
                    })
                  }
                  onAddToQueue={handleQueueCheckIn}
                />
              ))}
              {isDesktop && row.items.length === 1 && (
                <View style={styles.cardRowPlaceholder} />
              )}
            </View>
          ))}
          {virtualWindow.paddingBottom > 0 && (
            <View style={{ height: virtualWindow.paddingBottom, width: '100%' }} />
          )}
        </View>
      )}

      {/* Infinite Scroll Load More Footer */}
      {patients && patients.length > 0 && (
        <View style={styles.infiniteScrollFooter}>
          {loadingMore ? (
            <View style={styles.loadingMoreRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Loading more patients (50 at a time)...
              </ThemedText>
            </View>
          ) : hasMore ? (
            <Button
              title="Load more patients"
              variant="ghost"
              size="sm"
              icon="chevronDown"
              onPress={loadMorePatients}
            />
          ) : (
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.endOfListText}>
              All {filteredPatients.length} {filteredPatients.length === 1 ? 'patient' : 'patients'} loaded
            </ThemedText>
          )}
        </View>
      )}

      {/* Register Patient Modal */}
      <Modal raw visible={registerVisible} animationType="slide" transparent onClose={() => setRegisterVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Register Walk-In Patient</ThemedText>
              <Pressable onPress={() => setRegisterVisible(false)}>
                <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12 }}>
              {/* Debounced Duplicate Detection Banner */}
              <DebouncedDuplicateChecker
                firstName={formFirstName}
                lastName={formLastName}
                dateOfBirth={formDob}
                contactNumber={formPhone}
                philHealthNumber={formPhilHealth}
                onSelectDuplicate={handleViewExistingPatient}
                onSelectExistingPatient={handleViewExistingPatient}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Patient Code"
                    placeholder="Auto-generated if left blank"
                    value={formPatientCode}
                    onChangeText={(val) => {
                      setFormPatientCode(val);
                      clearFieldError('patientCode');
                    }}
                    error={formFieldErrors.patientCode}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="First Name"
                    required
                    placeholder="e.g. Maria"
                    value={formFirstName}
                    onChangeText={(val) => {
                      setFormFirstName(val);
                      clearFieldError('firstName');
                    }}
                    error={formFieldErrors.firstName}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Last Name"
                    required
                    placeholder="e.g. Santos"
                    value={formLastName}
                    onChangeText={(val) => {
                      setFormLastName(val);
                      clearFieldError('lastName');
                    }}
                    error={formFieldErrors.lastName}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Middle Name"
                    placeholder="e.g. Delos"
                    value={formMiddleName}
                    onChangeText={(val) => {
                      setFormMiddleName(val);
                      clearFieldError('middleName');
                    }}
                    error={formFieldErrors.middleName}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ValidatedDateInput
                    label="Date of Birth (YYYY-MM-DD)"
                    required
                    value={formDob}
                    onChangeText={(val) => {
                      setFormDob(val);
                      clearFieldError('dateOfBirth');
                      clearFieldError('dob');
                    }}
                    boundaryMode="pastOrToday"
                    placeholder="YYYY-MM-DD"
                    error={formFieldErrors.dateOfBirth || formFieldErrors.dob}
                  />
                </View>
              </View>

              {/* Sex / Gender Selector */}
              <View>
                <ThemedText style={styles.inputLabel}>Sex / Gender *</ThemedText>
                <View style={styles.categoryRow}>
                  {(['Male', 'Female', 'Other'] as const).map((gender) => (
                    <Pressable
                      key={gender}
                      style={[styles.categoryPill, formGender === gender && styles.categoryPillActive]}
                      onPress={() => setFormGender(gender)}
                    >
                      <ThemedText style={[styles.categoryPillText, formGender === gender && styles.categoryPillTextActive]}>
                        {gender}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Civil Status Selector */}
              <View>
                <ThemedText style={styles.inputLabel}>Civil Status</ThemedText>
                <View style={styles.categoryRow}>
                  {(['Single', 'Married', 'Widowed', 'Separated'] as const).map((status) => (
                    <Pressable
                      key={status}
                      style={[styles.categoryPill, formCivilStatus === status && styles.categoryPillActive]}
                      onPress={() => setFormCivilStatus(status)}
                    >
                      <ThemedText style={[styles.categoryPillText, formCivilStatus === status && styles.categoryPillTextActive]}>
                        {status}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Contact Phone"
                    required
                    placeholder="0917-123-4567"
                    value={formPhone}
                    onChangeText={(val) => {
                      setFormPhone(val);
                      clearFieldError('contactNumber');
                      clearFieldError('phone');
                    }}
                    error={formFieldErrors.contactNumber || formFieldErrors.phone}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <BloodTypeSelect
                    value={formBloodType}
                    onChange={setFormBloodType}
                  />
                </View>
              </View>

              {/* Embedded PhilHealth PIN Input with Auto-Mask & Mod-11 Check */}
              <PhilHealthPinInput
                label="PhilHealth PIN (RA 11223)"
                value={formPhilHealth}
                onChangeText={(val) => {
                  setFormPhilHealth(val);
                  clearFieldError('philHealthId');
                  clearFieldError('philHealthPin');
                  clearFieldError('philHealthNumber');
                }}
                onValidityChange={setIsPinValid}
                error={formFieldErrors.philHealthId || formFieldErrors.philHealthPin || formFieldErrors.philHealthNumber}
              />

              {/* PhilHealth Member Type Selector (MM vs DD) */}
              <View style={{ gap: 4 }}>
                <ThemedText style={styles.inputLabel}>PhilHealth Member Type *</ThemedText>
                <SegmentedControl
                  options={[
                    { value: 'MM', label: 'Member (MM)' },
                    { value: 'DD', label: 'Dependent (DD)' },
                  ]}
                  value={formMemberType}
                  onChange={(val) => setFormMemberType(val as MemberType)}
                />
              </View>

              {/* Conditional Principal Sponsor Details Card when DD */}
              {formMemberType === 'DD' && (
                <View style={styles.sponsorCard}>
                  <View style={styles.sponsorHeader}>
                    <Icon name="shield" size={14} color={theme.colors.primaryDark} />
                    <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                      Principal Sponsor Details
                    </ThemedText>
                    <Badge label="Required for Konsulta" variant="info" size="sm" />
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Required for PhilHealth Konsulta dependent registration and statutory encounter claims.
                  </ThemedText>

                  <Input
                    label="Principal Member Full Name *"
                    placeholder="e.g. Maria Santos"
                    value={formPrincipalFullName}
                    onChangeText={(val) => {
                      setFormPrincipalFullName(val);
                      clearFieldError('principalFullName');
                    }}
                    error={formFieldErrors.principalFullName}
                  />

                  <View style={{ gap: 4 }}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                      Relationship to Principal Member *
                    </ThemedText>
                    <View style={styles.relationshipGrid}>
                      {PHILHEALTH_RELATIONSHIPS.map((rel) => {
                        const isSelected = formPrincipalRelationship === rel.code;
                        return (
                          <Pressable
                            key={rel.code}
                            onPress={() => setFormPrincipalRelationship(rel.code)}
                            style={[
                              styles.relationshipChip,
                              isSelected && styles.relationshipChip_selected,
                            ]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                          >
                            <ThemedText
                              variant="captionBold"
                              color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                            >
                              {rel.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.formRow}>
                    <View style={{ flex: 1 }}>
                      <PhilHealthPinInput
                        label="Principal Member PIN (RA 11223)"
                        value={formPrincipalPin}
                        onChangeText={setFormPrincipalPin}
                        onValidityChange={setIsPrincipalPinValid}
                        error={formFieldErrors.principalMemberPin}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ValidatedDateInput
                        label="Principal Date of Birth"
                        value={formPrincipalDob}
                        onChangeText={setFormPrincipalDob}
                        boundaryMode="pastOrToday"
                        placeholder="YYYY-MM-DD"
                      />
                    </View>
                  </View>
                </View>
              )}

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Senior Citizen ID (RA 9994)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="SC-SP-2020-001"
                    placeholderTextColor={theme.colors.textMuted}
                    value={formSeniorId}
                    onChangeText={setFormSeniorId}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>PWD ID (RA 10754)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="PWD-BIN-2022-001"
                    placeholderTextColor={theme.colors.textMuted}
                    value={formPwdId}
                    onChangeText={setFormPwdId}
                  />
                </View>
              </View>

              {/* PhilHealth YAKAP Annual Enlistment Lifecycle Section */}
              <YakapEnlistmentSection
                customFields={dynamicFieldValues}
                onCustomFieldsChange={(next) => setDynamicFieldValues(next)}
              />

              {/* Institutional & Custom Metadata Section */}
              {tenantCustomFields.length > 0 && (
                <View style={{ marginBottom: theme.spacing.sm }}>
                  <ThemedText style={styles.inputLabel}>Institutional & Additional Details</ThemedText>
                  <DynamicCustomFieldsRenderer
                    fields={tenantCustomFields}
                    values={dynamicFieldValues}
                    onChange={(key, val) => {
                      setDynamicFieldValues((prev) => ({ ...prev, [key]: val }));
                      setDynamicFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                    }}
                    errors={dynamicFieldErrors}
                    staticValues={{
                      gender: formGender,
                      civilStatus: formCivilStatus,
                      dateOfBirth: formDob,
                    }}
                  />
                </View>
              )}

              {/* Embedded Structured Allergy Section */}
              <View style={styles.allergySectionCard}>
                <View style={styles.allergySectionHeader}>
                  <View style={styles.allergySectionTitleRow}>
                    <Icon name="emergency" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                    <ThemedText style={styles.inputLabel}>
                      Known Allergies & Anaphylaxis Alerts
                    </ThemedText>
                  </View>
                  <Button
                    title="+ Add Allergy"
                    variant="outline"
                    size="sm"
                    onPress={() => setAllergyModalVisible(true)}
                  />
                </View>

                <AllergyPillList
                  allergies={structuredAllergies}
                  onRemove={(index) => {
                    setStructuredAllergies((prev) => prev.filter((_, i) => i !== index));
                  }}
                />
              </View>

              {/* Section 1: Past Medical History & Chronic Conditions */}
              <View style={styles.formSectionBox}>
                <View style={styles.sectionHeaderBetween}>
                  <View style={styles.sectionHeaderLeft}>
                    <Icon name="medical" size={16} color={theme.colors.primary} />
                    <ThemedText style={styles.inputLabel}>
                      Past Medical History & Chronic Conditions
                    </ThemedText>
                  </View>
                  <Button
                    title="+ Add / Select Condition"
                    variant="outline"
                    size="sm"
                    onPress={() => setMedicalHistoryModalVisible(true)}
                  />
                </View>

                {/* Quick Chips Row */}
                <View style={styles.quickChipsRow}>
                  {PHILHEALTH_QUICK_CONDITIONS.map((qc) => {
                    const isSelected = formMedicalHistories.some(
                      (c) =>
                        c.philHealthMdiseaseCode === qc.code ||
                        c.conditionTitle.trim().toLowerCase() === qc.title.trim().toLowerCase()
                    );
                    return (
                      <Pressable
                        key={qc.code}
                        style={[styles.quickChip, isSelected && styles.quickChipActive]}
                        onPress={() => toggleQuickCondition(qc.code, qc.title)}
                      >
                        <ThemedText
                          variant={isSelected ? 'captionBold' : 'caption'}
                          color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                        >
                          {qc.label}
                        </ThemedText>
                        {isSelected ? (
                          <Icon name="check" size={12} color={theme.colors.primary} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                {additionalFormConditions.length > 0 && (
                  <View style={styles.additionalConditionsWrap}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ marginBottom: 6 }}>
                      Additional Documented Conditions:
                    </ThemedText>
                    <MedicalHistoryPillList
                      items={additionalFormConditions}
                      onRemove={(index) => {
                        const target = additionalFormConditions[index];
                        setFormMedicalHistories((prev) => prev.filter((item) => item !== target));
                      }}
                    />
                  </View>
                )}

                {formMedicalHistories.length === 0 && (
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                    No chronic conditions selected (Patient has no known chronic illnesses).
                  </ThemedText>
                )}
              </View>

              {/* Section 2: Dedicated Clinical & Safety Alerts */}
              <ClinicalAlertsSection
                alerts={formAlerts}
                onChangeAlerts={setFormAlerts}
              />

              {/* Walk-in Triage Routing Box */}
              <View style={styles.triageRoutingBox}>
                <ThemedText style={styles.triageRoutingTitle}>Walk-in Triage Routing (Optional)</ThemedText>
                <QueueRoutingSelector
                  selectedDoctorId={formTriageDoctorId}
                  onSelectDoctor={setFormTriageDoctorId}
                  selectedRoomId={formTriageRoomId}
                  onSelectRoom={setFormTriageRoomId}
                  activeDoctors={activeDoctors}
                  activeRooms={activeRooms}
                  formatStaffName={formatStaffName}
                />
                <ThemedText style={styles.inputLabel}>Chief Complaint / Triage Note</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Fever x 3 days, cough and sore throat"
                  placeholderTextColor={theme.colors.textMuted}
                  value={formChiefComplaint}
                  onChangeText={setFormChiefComplaint}
                />
              </View>

              {/* Dual Submission Action Buttons */}
              <View style={styles.dualActionRow}>
                {/* Secondary: Save & Register Patient */}
                <Pressable
                  style={[styles.secondaryRegisterBtn, savingPatient && styles.disabledBtn]}
                  onPress={() => handleRegisterPatient({ sendToTriage: false })}
                  disabled={savingPatient}
                >
                  <ThemedText style={styles.secondaryRegisterBtnText}>Save & Register Patient</ThemedText>
                </Pressable>

                {/* Primary Teal: Register & Send to Triage */}
                <Pressable
                  style={[styles.primaryTriageBtn, savingPatient && styles.disabledBtn]}
                  onPress={() => handleRegisterPatient({ sendToTriage: true })}
                  disabled={savingPatient}
                >
                  {savingPatient ? (
                    <ActivityIndicator color={theme.colors.onPrimary} />
                  ) : (
                    <View style={styles.triageBtnContent}>
                      <Icon name="arrowRight" size={theme.sizes.iconSm} color={theme.colors.onPrimary} />
                      <ThemedText style={styles.primaryTriageBtnText}>Register & Send to Triage</ThemedText>
                    </View>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Duplicate Patient Warning Modal Safeguard */}
      <DuplicatePatientWarningModal
        visible={duplicateWarningVisible}
        matches={detectedDuplicates}
        onUseExistingProfile={handleUseExistingProfile}
        onCreateNewProfileAnyway={handleCreateProfileAnyway}
        onClose={handleCloseDuplicateWarning}
        isRegistering={savingPatient}
      />

      {/* Structured Allergy Intake Sub-Modal */}
      <StructuredAllergyIntakeModal
        visible={allergyModalVisible}
        onClose={() => setAllergyModalVisible(false)}
        allergies={structuredAllergies}
        onChange={setStructuredAllergies}
      />

      {/* Structured Medical History Intake Sub-Modal */}
      <StructuredMedicalHistoryModal
        visible={medicalHistoryModalVisible}
        onClose={() => setMedicalHistoryModalVisible(false)}
        conditions={formMedicalHistories}
        onChange={setFormMedicalHistories}
      />

      {/* Patient Longitudinal Chart Workstation Modal */}
      <PatientChartModal
        visible={chartVisible}
        patient={selectedPatient}
        patientChart={patientChart}
        loadingChart={loadingChart}
        chartError={chartError}
        patientAttachments={patientAttachments}
        initialTab={activeChartTab}
        activeTab={activeChartTab}
        focusToothNumber={focusToothNumber}
        onTabChange={handleChartTabChange}
        onClose={handleCloseChart}
        onRefreshChart={() => selectedPatient && handleOpenChart(selectedPatient, activeChartTab)}
        onViewPrescriptionSlip={handleViewPrescriptionSlip}
        onOpenExternalDispense={handleOpenExternalDispense}
        onViewLabSlip={handleViewSlip}
        onAttachExternalResult={handleOpenAttach}
        onUploadDocument={() => setUploadDocModalVisible(true)}
        onVerifyAttachment={handleVerifyAttachment}
        onDownloadAttachment={handleDownloadAttachment}
        onAdministerVaccine={async (payload) => {
          if (!selectedPatient) return;
          const [, err] = await clinicService.administerVaccine(selectedPatient.id, payload);
          if (err) {
            notify.error(err.message || 'Could not record vaccine administration.');
            throw new Error(err.message || 'Could not record vaccine administration.');
          } else {
            notify.success('Vaccine administration recorded.');
            handleOpenChart(selectedPatient, activeChartTab);
          }
        }}
        onRecordHistoricalVaccine={async (payload) => {
          if (!selectedPatient) return;
          const [, err] = await clinicService.recordHistoricalImmunization(selectedPatient.id, payload);
          if (err) {
            notify.error(err.message || 'Could not record historical immunization.');
            throw new Error(err.message || 'Could not record historical immunization.');
          } else {
            notify.success('Historical immunization added.');
            handleOpenChart(selectedPatient, activeChartTab);
          }
        }}
        onRecordAefi={async (immId, payload) => {
          if (!selectedPatient) return;
          const [, err] = await clinicService.recordImmunizationAefi(selectedPatient.id, immId, payload);
          if (err) {
            notify.error(err.message || 'Could not record adverse reaction.');
            throw new Error(err.message || 'Could not record adverse reaction.');
          } else {
            notify.success('Adverse event (AEFI) recorded.');
            handleOpenChart(selectedPatient, activeChartTab);
          }
        }}
        onPatientUpdated={handlePatientDemographicsSaved}
      />

      {/* Edit Patient Demographics Modal */}
      <EditPatientModal
        visible={editPatientModalVisible}
        patient={patientToEdit}
        onClose={() => {
          setEditPatientModalVisible(false);
          setPatientToEdit(null);
        }}
        onSaved={handlePatientDemographicsSaved}
      />

      {/* Lab Order Slip Modal with Verifiable QR Code & Upload Token */}
      <Modal raw visible={slipModalVisible} transparent animationType="slide" onClose={() => setSlipModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 560 }]}>
            <View style={styles.slipHeader}>
              <ThemedText style={styles.slipClinicName}>{selectedSlip?.clinicName}</ThemedText>
              <ThemedText style={styles.slipClinicMeta}>{selectedSlip?.clinicAddress}</ThemedText>
              <ThemedText style={styles.slipClinicMeta}>{selectedSlip?.clinicContact}</ThemedText>
              <View style={styles.slipDivider} />
              <ThemedText style={styles.slipTitle}>OFFICIAL LABORATORY REQUISITION SLIP</ThemedText>
              <ThemedText style={styles.slipOrderNo}>Order: {selectedSlip?.orderNumber}</ThemedText>
            </View>

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12 }}>
              {/* Doctor & Patient Info */}
              <View style={styles.slipSectionBox}>
                <ThemedText style={styles.slipSectionHeading}>Attending Physician</ThemedText>
                <ThemedText style={styles.slipBodyText}>Doctor: {selectedSlip?.doctorName}</ThemedText>
                <ThemedText style={styles.slipBodyText}>PRC License: {selectedSlip?.doctorPrcLicense}</ThemedText>
              </View>

              <View style={styles.slipSectionBox}>
                <ThemedText style={styles.slipSectionHeading}>Patient Information</ThemedText>
                <ThemedText style={styles.slipBodyText}>Patient: {selectedSlip?.patientName}</ThemedText>
                <ThemedText style={styles.slipBodyText}>Age/Sex: {selectedSlip?.patientAge}y • {selectedSlip?.patientGender}</ThemedText>
                {selectedSlip?.philHealthNumber && (
                  <ThemedText style={styles.slipBodyText}>PhilHealth PIN: {selectedSlip.philHealthNumber}</ThemedText>
                )}
                {selectedSlip?.clinicalDiagnosis && (
                  <ThemedText style={styles.slipBodyText}>Diagnosis: {selectedSlip.clinicalDiagnosis}</ThemedText>
                )}
              </View>

              {/* Tests Requested */}
              <View style={styles.slipSectionBox}>
                <ThemedText style={styles.slipSectionHeading}>Requested Diagnostic Tests</ThemedText>
                {selectedSlip?.items?.map((item, i) => (
                  <View key={i} style={styles.slipTestRow}>
                    <ThemedText style={styles.slipTestName}>• {item.testName}</ThemedText>
                    <ThemedText style={styles.slipTestCat}>({item.category})</ThemedText>
                  </View>
                ))}
              </View>

              {/* Interoperability QR Code & Public Token Portal */}
              <View style={styles.slipQrBox}>
                <ThemedText style={styles.slipQrTitle}>Universal Patient Choice (Dual-Path)</ThemedText>
                <ThemedText style={styles.slipQrHelp}>
                  Present this digital slip to ANY laboratory (whether or not it uses Clinic EZ).
                </ThemedText>
                <View style={styles.qrPlaceholder}>
                  <ThemedText style={styles.qrCodeText}>[ VERIFIABLE QR CODE ]</ThemedText>
                  <ThemedText style={styles.qrPayloadText}>{selectedSlip?.qrPayload}</ThemedText>
                </View>
                <ThemedText style={styles.uploadUrlNotice}>
                  External Lab Upload Link: {selectedSlip?.publicUploadUrl}
                </ThemedText>
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              {selectedSlip?.orderId && (
                <Pressable
                  style={[styles.closeSlipBtn, { backgroundColor: theme.colors.successText }]}
                  onPress={async () => {
                    const url = clinicService.getLabOrderSlipPdfUrl(selectedSlip.orderId);
                    try {
                      if (!(await openDocument(url))) throw new Error('Could not open the document');
                    } catch {
                      Alert.alert('Download Error', 'Could not open requisition slip PDF. Please check connection and try again.');
                    }
                  }}
                >
                  <ThemedText style={styles.closeSlipBtnText}>Download Official Requisition PDF</ThemedText>
                </Pressable>
              )}
              <Pressable
                style={styles.closeSlipBtn}
                onPress={() => setSlipModalVisible(false)}
              >
                <ThemedText style={styles.closeSlipBtnText}>Close</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Attach External Lab Result Modal (Path B) */}
      <Modal raw visible={attachModalVisible} transparent animationType="slide" onClose={() => setAttachModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 480 }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Attach External Lab Result (Path B)</ThemedText>
              <Pressable onPress={() => setAttachModalVisible(false)} hitSlop={theme.spacing.sm}>
                <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
            <ThemedText style={styles.modalSub}>
              Attach test reports from outside diagnostic centers to complete the electronic health record.
            </ThemedText>

            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              <View>
                <ThemedText style={styles.inputLabel}>Diagnostic Laboratory Name *</ThemedText>
                <TextInput
                  style={styles.textInput}
                  value={externalLabName}
                  onChangeText={setExternalLabName}
                  placeholder="Laboratory name"
                />
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Document Format</ThemedText>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['PDF', 'Photo'] as const).map(fmt => (
                    <Pressable
                      key={fmt}
                      style={[
                        styles.formatChip,
                        externalFileType === fmt && styles.formatChipActive
                      ]}
                      onPress={() => setExternalFileType(fmt)}
                    >
                      <ThemedText style={[
                        styles.formatChipText,
                        externalFileType === fmt && styles.formatChipTextActive
                      ]}>
                        {fmt === 'PDF' ? 'Official PDF' : 'Scanned Photo'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Staff Review Notes</ThemedText>
                <TextInput
                  style={styles.textInput}
                  value={externalNotes}
                  onChangeText={setExternalNotes}
                  placeholder="Official stamp and physician signature verified."
                />
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
              <Pressable
                style={styles.cancelModalBtn}
                onPress={() => setAttachModalVisible(false)}
                disabled={attaching}
              >
                <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                style={styles.confirmAttachBtn}
                onPress={handleConfirmAttach}
                disabled={attaching}
              >
                {attaching ? (
                  <ActivityIndicator color={theme.colors.textInverted} />
                ) : (
                  <ThemedText style={styles.confirmAttachText}>Confirm & Mark Completed</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Electronic Prescription Slip Modal (Dual-Path) */}
      <PrescriptionSlipModal
        visible={rxSlipModalVisible}
        onClose={() => setRxSlipModalVisible(false)}
        slip={selectedRxSlip}
        onOpenExternalDispense={() => {
          setRxSlipModalVisible(false);
          setExternalDispenseModalVisible(true);
        }}
      />

      {/* Record External Dispense Modal (Path B) */}
      <RecordExternalDispenseModal
        visible={externalDispenseModalVisible}
        onClose={() => setExternalDispenseModalVisible(false)}
        consultationId={targetConsultationId || ''}
        prescriptionNumber={targetPrescriptionNumber}
        onSuccess={handleExternalDispenseSuccess}
      />

      {/* Attach External Physical Document Modal (School Clinic / 80/20) */}
      <Modal raw visible={uploadDocModalVisible} transparent animationType="slide" onClose={() => setUploadDocModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 500 }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Attach External Physical Document</ThemedText>
              <Pressable onPress={() => setUploadDocModalVisible(false)} hitSlop={theme.spacing.sm}>
                <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
            <ThemedText style={styles.modalSub}>
              Ingest scanned physical documents (paper COR, outside Chest X-Ray films, lab sheets, or med certs) directly into {selectedPatient?.fullName}'s profile.
            </ThemedText>

            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              <View>
                <ThemedText style={styles.inputLabel}>Document Title *</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Chest X-ray (outside clinic)"
                  placeholderTextColor={theme.colors.textMuted}
                  value={docTitle}
                  onChangeText={setDocTitle}
                />
              </View>

              <ValidatedDateInput
                label="Document Date (YYYY-MM-DD)"
                required
                value={docDate}
                onChangeText={setDocDate}
                boundaryMode="pastOrToday"
                placeholder="YYYY-MM-DD"
              />

              <View>
                <ThemedText style={styles.inputLabel}>Document / Record Classification</ThemedText>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { key: 'OutsideChestXRay', label: 'Chest X-Ray' },
                    { key: 'CertificateOfRegistration', label: 'Paper COR' },
                    { key: 'MedicalCertificate', label: 'Outside MedCert' },
                    { key: 'LabResult', label: 'Lab Sheet' },
                    { key: 'Other', label: 'Other' },
                  ].map((t) => (
                    <Pressable
                      key={t.key}
                      style={[styles.formatChip, docRecordType === t.key && styles.formatChipActive]}
                      onPress={() => setDocRecordType(t.key)}
                    >
                      <ThemedText style={[styles.formatChipText, docRecordType === t.key && styles.formatChipTextActive]}>
                        {t.label}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Ingestion Source / Format</ThemedText>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['PDF', 'Photo'] as const).map((fmt) => (
                    <Pressable
                      key={fmt}
                      style={[styles.formatChip, docFileType === fmt && styles.formatChipActive]}
                      onPress={() => setDocFileType(fmt)}
                    >
                      <ThemedText style={[styles.formatChipText, docFileType === fmt && styles.formatChipTextActive]}>
                        {fmt === 'PDF' ? 'Scanned PDF' : 'Flatbed / Camera Scan'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>File Attachment (PDF, JPEG, PNG)</ThemedText>
                {pickedDocFile ? (
                  <View style={styles.pickedFileBox}>
                    <View style={styles.pickedFileInfo}>
                      <Icon
                        name={pickedDocFile.name.toLowerCase().endsWith('.pdf') ? 'file' : 'paperclip'}
                        size={theme.sizes.iconMd}
                        color={theme.colors.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText variant="captionBold" color={theme.colors.text} numberOfLines={1}>
                          {pickedDocFile.name}
                        </ThemedText>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          {pickedDocFile.size ? `${(pickedDocFile.size / 1024).toFixed(1)} KB` : 'Ready to upload'}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable style={styles.changeFileBtn} onPress={handlePickDocument}>
                        <ThemedText variant="captionBold" color={theme.colors.primary}>Change</ThemedText>
                      </Pressable>
                      <Pressable style={styles.removeFileBtn} onPress={() => setPickedDocFile(null)}>
                        <ThemedText variant="captionBold" color={theme.colors.emergencyText}>Clear</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={styles.pickFileBtn} onPress={handlePickDocument}>
                    <Icon name="upload" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    <ThemedText variant="captionBold" color={theme.colors.primary}>
                      Select Document File (PDF, JPEG, PNG)
                    </ThemedText>
                  </Pressable>
                )}
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Clinical Review Findings & Notes</ThemedText>
                <TextInput
                  style={[styles.textInput, { height: 60 }]}
                  multiline
                  placeholder="e.g. Clean chest PA film, no active pulmonary disease seen."
                  placeholderTextColor={theme.colors.textMuted}
                  value={docNotes}
                  onChangeText={setDocNotes}
                />
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 }}>
              <Pressable
                style={styles.cancelModalBtn}
                onPress={() => setUploadDocModalVisible(false)}
                disabled={uploadingDoc}
              >
                <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={styles.confirmAttachBtn}
                onPress={handleUploadDocument}
                disabled={uploadingDoc}
              >
                {uploadingDoc ? (
                  <ActivityIndicator color={theme.colors.textInverted} />
                ) : (
                  <ThemedText style={styles.confirmAttachText}>Save & Attach to Profile</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Standalone PhilHealth Patient Profile Modal (Offline & Walk-In Capable) */}
      <PhilHealthProfileModal
        visible={philHealthProfileModalVisible}
        onClose={() => {
          setPhilHealthProfileModalVisible(false);
          setSelectedPatientForProfile(null);
        }}
        patient={selectedPatientForProfile}
        onSaved={handlePhilHealthProfileSaved}
      />

      {/* Walk-In Check-In & Room Routing Modal */}
      <Modal
        visible={!!checkInModalPatient}
        onClose={() => !checkingInPatientId && setCheckInModalPatient(null)}
        title="Walk-In Check-In & Routing"
        subtitle={
          checkInModalPatient
            ? `Queue ${checkInModalPatient.fullName} (${checkInModalPatient.patientCode}) and optionally assign a doctor or room`
            : ''
        }
        maxWidth={540}
        footer={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setCheckInModalPatient(null)}
              disabled={!!checkingInPatientId}
            />
            <Button
              title="Confirm Check-In"
              icon="check"
              onPress={handleConfirmQueueCheckIn}
              loading={!!checkingInPatientId}
            />
          </>
        }
      >
        <View style={{ gap: theme.spacing.md }}>
          {/* Harmonized Attending Doctor & Room Selector */}
          <QueueRoutingSelector
            selectedDoctorId={checkInDoctorId}
            onSelectDoctor={setCheckInDoctorId}
            selectedRoomId={checkInRoomId}
            onSelectRoom={setCheckInRoomId}
            activeDoctors={activeDoctors}
            activeRooms={activeRooms}
            formatStaffName={formatStaffName}
          />

          {/* Visit Type Picker */}
          <View style={{ gap: theme.spacing.xs }}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Visit Type / Purpose
            </ThemedText>
            <View style={styles.visitTypeGrid}>
              {VISIT_TYPE_OPTIONS.map((opt) => {
                const isSelected = checkInVisitType === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    onPress={() => setCheckInVisitType(opt.key)}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={[
                      styles.visitTypeChip,
                      isSelected ? styles.visitTypeChip_selected : null,
                    ]}
                  >
                    {isSelected && (
                      <IconSlot
                        value="check"
                        size={12}
                        color={theme.colors.primary}
                      />
                    )}
                    <ThemedText
                      variant="smallBold"
                      color={isSelected ? theme.colors.primary : theme.colors.text}
                    >
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Priority Picker */}
          <View style={{ gap: theme.spacing.xs }}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Queue Priority
            </ThemedText>
            <View style={styles.priorityGrid}>
              {(
                [
                  {
                    key: 'Routine',
                    label: 'Routine',
                    icon: 'check',
                  },
                  {
                    key: 'Urgent',
                    label: 'Urgent',
                    icon: 'clock',
                  },
                  {
                    key: 'Emergency',
                    label: 'Emergency (STAT)',
                    icon: 'emergency',
                  },
                ] as const
              ).map((prio) => {
                const isSelected = checkInPriority === prio.key;
                const isEmergency = prio.key === 'Emergency';
                const isUrgent = prio.key === 'Urgent';

                const chipStyle = [
                  styles.priorityChip,
                  !isEmergency && !isUrgent && (isSelected ? styles.priorityChip_routine_selected : styles.priorityChip_routine),
                  isUrgent && (isSelected ? styles.priorityChip_urgent_selected : styles.priorityChip_urgent),
                  isEmergency && (isSelected ? styles.priorityChip_emergency_selected : styles.priorityChip_emergency),
                ];

                const textColor = isEmergency
                  ? theme.colors.emergencyText
                  : isUrgent
                  ? theme.colors.urgentText
                  : isSelected
                  ? theme.colors.routineText
                  : theme.colors.text;

                const iconColor = isEmergency
                  ? theme.colors.emergencyText
                  : isUrgent
                  ? theme.colors.urgentText
                  : isSelected
                  ? theme.colors.routineText
                  : theme.colors.textMuted;

                return (
                  <Pressable
                    key={prio.key}
                    accessibilityRole="button"
                    accessibilityLabel={prio.label}
                    onPress={() => setCheckInPriority(prio.key)}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={chipStyle}
                  >
                    {(isSelected || isUrgent || isEmergency) && (
                      <IconSlot
                        value={isSelected ? 'check' : prio.icon}
                        size={13}
                        color={iconColor}
                      />
                    )}
                    <ThemedText variant="smallBold" color={textColor}>
                      {prio.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Chief Complaint */}
          <Input
            label="Chief Complaint / Reason for Visit"
            value={checkInComplaint}
            onChangeText={setCheckInComplaint}
            placeholder="e.g. Fever and cough for 2 days, annual physical exam"
          />
        </View>
      </Modal>

      {/* Active Queue Ticket Conflict Modal */}
      <QueueConflictModal
        visible={!!conflictModal?.visible}
        onDismiss={() => setConflictModal(null)}
        onViewInQueue={() => {
          setConflictModal(null);
          navigation.navigate('Dashboard');
        }}
        error={conflictModal?.error}
        patientName={conflictModal?.patientName}
      />
    </ScrollView>
  </ResponsiveLayout>
);
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    width: '100%',
    paddingBottom: theme.spacing['4xl'],
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
  },
  offlineBannerText: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing.xs,
  },
  offlineFailedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
  },
  searchInput: {
    width: '100%',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  infiniteScrollFooter: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  loadingMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  endOfListText: {
    fontStyle: 'italic',
    paddingVertical: theme.spacing.sm,
  },
  skeletonWrap: {
    padding: theme.spacing.lg,
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
  },
  virtualListContainer: {
    width: '100%',
  },
  cardRowDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
    width: '100%',
    marginBottom: theme.spacing.lg,
  },
  cardRowMobile: {
    flexDirection: 'column',
    width: '100%',
    marginBottom: theme.spacing.lg,
  },
  cardRowPlaceholder: {
    flexBasis: '48.8%',
    width: '48.8%',
    maxWidth: '49%',
  },
  tableCard: {
    padding: 0,
    overflow: 'hidden',
  },
  tableScrollContent: {
    flexGrow: 1,
  },
  tableInner: {
    width: '100%',
    minWidth: 920,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    width: '100%',
    maxWidth: 720,
    maxHeight: '95%',
    alignSelf: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalSub: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputLabel: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    minHeight: theme.sizes.controlMd,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSizes.md,
    color: theme.colors.text,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    minHeight: theme.sizes.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  saveBtnText: {
    color: theme.colors.textInverted,
    fontSize: theme.fontSizes.md,
    fontWeight: '700',
  },
  chartSummaryBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
  },
  chartMetric: {
    flex: 1,
    alignItems: 'center',
  },
  chartMetricVal: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  chartMetricLabel: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
  },
  chartSection: {
    gap: 6,
  },
  chartSectionTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  historyCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    gap: 4,
  },
  labCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 6,
    marginBottom: 8,
  },
  orderNumberText: {
    fontSize: theme.fontSizes.md,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  orderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.sm,
  },
  statusBadgePending: {
    backgroundColor: theme.colors.warningBg,
  },
  statusBadgeCompleted: {
    backgroundColor: theme.colors.successBg,
  },
  orderStatusText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.text,
  },
  testChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  testChip: {
    backgroundColor: theme.colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  testChipText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.primaryDark,
  },
  externalResultBanner: {
    backgroundColor: theme.colors.purpleBg,
    padding: 8,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.purpleBorder,
    gap: 2,
    marginTop: 4,
  },
  externalResultTitle: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.purpleText,
  },
  externalResultMeta: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.purple,
  },
  verifiedPathologistBanner: {
    backgroundColor: theme.colors.successBg,
    padding: 8,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
    gap: 2,
    marginTop: 4,
  },
  verifiedPathologistTitle: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.successText,
  },
  verifiedPathologistImpression: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.successText,
    fontStyle: 'italic',
  },
  labActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  viewSlipBtn: {
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  viewSlipBtnText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  attachResultBtn: {
    backgroundColor: theme.colors.infoBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  attachResultBtnText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.infoText,
  },
  slipHeader: {
    alignItems: 'center',
    gap: 2,
    marginBottom: 8,
  },
  slipClinicName: {
    fontSize: theme.fontSizes.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  slipClinicMeta: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
  },
  slipDivider: {
    height: 1,
    backgroundColor: theme.colors.surfaceHighlight,
    width: '100%',
    marginVertical: 6,
  },
  slipTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  slipOrderNo: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  slipSectionBox: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: 10,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 3,
  },
  slipSectionHeading: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  slipBodyText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.text,
  },
  slipTestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slipTestName: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.text,
  },
  slipTestCat: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
  },
  slipQrBox: {
    backgroundColor: theme.colors.surfaceMuted,
    padding: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    alignItems: 'center',
    gap: 4,
  },
  slipQrTitle: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.text,
  },
  slipQrHelp: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  qrPlaceholder: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    padding: 12,
    borderRadius: theme.radii.md,
    marginVertical: 6,
    alignItems: 'center',
  },
  qrCodeText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  qrPayloadText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  uploadUrlNotice: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.info,
    textAlign: 'center',
  },
  closeSlipBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
  },
  closeSlipBtnText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  formatChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  formatChipActive: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.info,
  },
  formatChipText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  formatChipTextActive: {
    color: theme.colors.infoText,
  },
  cancelModalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  cancelModalText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  confirmAttachBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
  },
  confirmAttachText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  pickedFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
  },
  pickedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  changeFileBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  removeFileBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
  },
  pickFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  categoryPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  categoryPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  categoryPillText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  categoryPillTextActive: {
    color: theme.colors.textInverted,
  },
  institutionalBox: {
    backgroundColor: theme.colors.infoBg,
    borderWidth: 1,
    borderColor: theme.colors.infoBorder,
    borderRadius: theme.radii.md,
    padding: 12,
    gap: 10,
  },
  institutionalBoxTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.infoText,
  },
  institutionalBanner: {
    backgroundColor: theme.colors.infoBg,
    borderWidth: 1,
    borderColor: theme.colors.infoBorder,
    borderRadius: theme.radii.md,
    padding: 12,
    gap: 8,
  },
  institutionalBannerTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.infoText,
  },
  institutionalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  institutionalItem: {
    minWidth: '45%',
    flex: 1,
  },
  institutionalLabel: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  institutionalValue: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.text,
  },
  addDocBtn: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  addDocBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  attachmentCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: 12,
    gap: 8,
  },
  attachmentTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.text,
  },
  attachmentMeta: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  attachmentNotes: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  attBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
  },
  attBadgeVerified: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  attBadgePending: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  attBadgeRejected: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  attBadgeText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
  },
  attBadgeTextVerified: {
    color: theme.colors.successText,
  },
  attBadgeTextPending: {
    color: theme.colors.warningText,
  },
  attBadgeTextRejected: {
    color: theme.colors.emergencyText,
  },
  verifiedMetaBox: {
    backgroundColor: theme.colors.successBg,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
    padding: 8,
    borderRadius: theme.radii.sm,
  },
  verifiedMetaText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.successText,
    fontWeight: '600',
  },
  attActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  verifyBtn: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  verifyBtnText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  rejectBtn: {
    backgroundColor: theme.colors.emergency,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  rejectBtnText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  viewDocBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 4,
  },
  viewDocBtnText: {
    color: theme.colors.textInverted,
    fontWeight: '700',
    fontSize: theme.fontSizes.xs,
  },
  allergySectionCard: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm + 4,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.xs,
  },
  allergySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  allergySectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  triageRoutingBox: {
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm + 4,
    gap: theme.spacing.xs,
  },
  triageRoutingTitle: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dualActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
  },
  secondaryRegisterBtn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryRegisterBtnText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.sm,
    fontWeight: '600',
  },
  primaryTriageBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triageBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  primaryTriageBtnText: {
    color: theme.colors.onPrimary,
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  formSectionBox: {
    gap: theme.spacing.xs,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  additionalConditionsWrap: {
    marginTop: theme.spacing.xs,
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.full || 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  quickChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  sponsorCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  sponsorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  relationshipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  relationshipChip: {
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relationshipChip_selected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
  },
  visitTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  visitTypeChip: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
  },
  visitTypeChip_selected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  priorityChip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  priorityChip_routine: {
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
  },
  priorityChip_routine_selected: {
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.routine,
    borderWidth: 1.5,
  },
  priorityChip_urgent: {
    borderColor: theme.colors.urgentBorder,
    backgroundColor: theme.colors.surface,
  },
  priorityChip_urgent_selected: {
    backgroundColor: theme.colors.urgentBg,
    borderColor: theme.colors.urgent,
    borderWidth: 1.5,
  },
  priorityChip_emergency: {
    borderColor: theme.colors.emergencyBorder,
    backgroundColor: theme.colors.surface,
  },
  priorityChip_emergency_selected: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergency,
    borderWidth: 1.5,
  },
});
