import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Linking, Pressable } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  ThemedText,
  Badge,
  BadgeVariant,
  Button,
  Card,
  CardHeader,
  CardContent,
  StatCard,
  ProgressBar,
  Input,
  Modal,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonList,
  SkeletonStat,
  Icon,
} from '@ui';
import SegmentedControl from '@ui/SegmentedControl';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { useClinic } from '@context/ClinicContext';
import { useStaff, formatStaffName } from '@context/StaffContext';
import QueueRoutingSelector from '../../components/queue/QueueRoutingSelector';
import { Alert, notify } from '@utils/feedback';
import { openDocument } from '../../services/documentOpener';
import {
  TrendLineChart,
  TenderDonutChart,
  MorbidityDistributionChart,
  WorkloadBarChart,
} from '../../components/analytics';
import { getPortalBaseUrl } from '../../services/runtimeConfig';
import { resolveTenantContext } from '@shared/safe';
import {
  clinicService,
  PatientQueueItem,
  ClinicPatient,
  PediatricZScoreResult,
  QueueMetrics,
  QueueStatus,
  QueuePriority,
  RecordTriageRequest,
  ClinicAnalytics,
  DailyEodReport,
  MorbidityReport,
  TaxDiscountAuditReport,
  DoctorSharesReport,
} from '../../services/clinicService';
import ForceEodConfirmationModal from '../../components/queue/ForceEodConfirmationModal';

type DashboardTab = 'QUEUE' | 'ANALYTICS' | 'REPORTS';
type ReportType = 'DAILY_EOD' | 'MORBIDITY' | 'TAX_DISCOUNT' | 'DOCTOR_SHARES';
type QueueFilter = 'ALL' | 'Waiting' | 'Triaged' | 'InConsultation' | 'OnHold' | 'NoShow' | 'Completed';

const PRIORITY_OPTIONS: QueuePriority[] = ['Routine', 'Urgent', 'Emergency'];

const peso = (value?: number | null) =>
  `₱${(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const parseOptionalInt = (value: string): number | undefined => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseOptionalFloat = (value: string): number | undefined => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const waitingMinutes = (checkInTime: string): number | null => {
  const started = new Date(checkInTime).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.round((Date.now() - started) / 60000));
};

const priorityVariant = (priority: QueuePriority): BadgeVariant => {
  switch (priority) {
    case 'Emergency':
      return 'emergency';
    case 'Urgent':
      return 'urgent';
    default:
      return 'routine';
  }
};

const statusBadge = (status: QueueStatus): { label: string; variant: BadgeVariant; icon?: string } => {
  switch (status) {
    case 'Waiting':
      return { label: 'Waiting', variant: 'warning' };
    case 'Triaged':
      return { label: 'Triaged', variant: 'success' };
    case 'InConsultation':
      return { label: 'In consultation', variant: 'purple' };
    case 'OnHold':
      return { label: 'On hold', variant: 'warning', icon: 'clock' };
    case 'NoShow':
      return { label: 'No show', variant: 'neutral', icon: 'alertCircle' };
    case 'Cancelled':
      return { label: 'Cancelled', variant: 'neutral', icon: 'close' };
    case 'PendingProcedure':
      return { label: 'Procedure bay', variant: 'urgent' };
    case 'ReEvaluation':
      return { label: 'Re-evaluation', variant: 'emergency' };
    case 'Completed':
      return { label: 'Completed', variant: 'neutral' };
    default:
      return { label: status, variant: 'neutral' };
  }
};

type MeasurementPosture = 'STANDING' | 'RECUMBENT';

const getZScoreBadgeVariant = (category?: string): BadgeVariant => {
  if (!category) return 'neutral';
  const c = category.toLowerCase();
  if (c.includes('severely') || c.includes('obese')) return 'emergency';
  if (c.includes('moderately') || c.includes('overweight') || c.includes('stunted') || c.includes('wasted')) return 'warning';
  if (c.includes('normal')) return 'success';
  return 'info';
};

interface TriageForm {
  bpSys: string;
  bpDia: string;
  hr: string;
  rr: string;
  temp: string;
  spo2: string;
  height: string;
  weight: string;
  pain: string;
  visualAcuityLeft: string;
  visualAcuityRight: string;
  headCircumference: string;
  midUpperArmCircumference: string;
  posture: MeasurementPosture;
  notes: string;
  priority: QueuePriority;
  preAssessmentNotes: string;
  preAssessmentRemarks: string;
}

const EMPTY_TRIAGE: TriageForm = {
  bpSys: '',
  bpDia: '',
  hr: '',
  rr: '',
  temp: '',
  spo2: '',
  height: '',
  weight: '',
  pain: '',
  visualAcuityLeft: '',
  visualAcuityRight: '',
  headCircumference: '',
  midUpperArmCircumference: '',
  posture: 'STANDING',
  notes: '',
  priority: 'Routine',
  preAssessmentNotes: '',
  preAssessmentRemarks: '',
};

function DataRow({ label, value, emphasize }: { label: string; value: string | number; emphasize?: boolean }) {
  return (
    <View style={styles.dataRow}>
      <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.dataLabel}>
        {label}
      </ThemedText>
      <ThemedText variant={emphasize ? 'bodyBold' : 'body'}>{value}</ThemedText>
    </View>
  );
}

function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <Card>
      <CardContent>
        <SkeletonList rows={rows} />
      </CardContent>
    </Card>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { facilityName, letterhead, settings, rooms } = useClinic();
  const { current: currentStaff, currentName, staff: staffList } = useStaff();
  const activeDoctors = useMemo(
    () => (staffList || []).filter((s) => s.role === 'Doctor' && s.isActive),
    [staffList]
  );
  const activeRooms = useMemo(
    () => (rooms || []).filter((r) => r.isActive),
    [rooms]
  );
  const [reassignModalItem, setReassignModalItem] = useState<PatientQueueItem | null>(null);
  const [reassignDoctorId, setReassignDoctorId] = useState<string>('');
  const [reassignRoomId, setReassignRoomId] = useState<string>('');
  const [savingReassignment, setSavingReassignment] = useState<boolean>(false);

  const handleOpenTvDisplay = useCallback(() => {
    const portalBase = getPortalBaseUrl();
    const ctx = resolveTenantContext();
    const tenantSlug = ctx.tenantSlug || settings?.tenantSlug || settings?.tenantId || 'clinic';
    const facilitySlug = ctx.facilitySlug || settings?.facilitySlug || 'main';
    const tvUrl = `${portalBase}/queue-display/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(facilitySlug)}`;

    if (typeof window !== 'undefined' && window.open) {
      window.open(tvUrl, '_blank');
    } else {
      Linking.openURL(tvUrl).catch(() => {
        notify.error('Could not open TV display.');
      });
    }
  }, [settings]);

  const [activeTab, setActiveTab] = useState<DashboardTab>('QUEUE');
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [queue, setQueue] = useState<PatientQueueItem[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<ClinicAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('ALL');
  const [showForceEodModal, setShowForceEodModal] = useState(false);

  // Nurse triage modal state
  const [triageItem, setTriageItem] = useState<PatientQueueItem | null>(null);
  const [triagePatient, setTriagePatient] = useState<ClinicPatient | null>(null);
  const [zScorePreview, setZScorePreview] = useState<PediatricZScoreResult | null>(null);
  const [triage, setTriage] = useState<TriageForm>(EMPTY_TRIAGE);
  const [savingTriage, setSavingTriage] = useState(false);

  // Statutory reports and analytics state
  const [reportType, setReportType] = useState<ReportType>('DAILY_EOD');
  const [eodReport, setEodReport] = useState<DailyEodReport | null>(null);
  const [morbidityReport, setMorbidityReport] = useState<MorbidityReport | null>(null);
  const [taxReport, setTaxReport] = useState<TaxDiscountAuditReport | null>(null);
  const [doctorSharesReport, setDoctorSharesReport] = useState<DoctorSharesReport | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsStartDate, setAnalyticsStartDate] = useState('');
  const [analyticsEndDate, setAnalyticsEndDate] = useState('');
  const [reportsStartDate, setReportsStartDate] = useState('');
  const [reportsEndDate, setReportsEndDate] = useState('');
  const [eodDate, setEodDate] = useState('');

  const loadData = useCallback(async () => {
    const [
      [metricsData, metricsErr],
      [queueData, queueErr],
      [analyticsData, analyticsErr],
      [eodData, eodErr],
      [morbidityData, morbidityErr],
      [taxData, taxErr],
      [sharesData, sharesErr],
    ] = await Promise.all([
      clinicService.getQueueMetrics(),
      clinicService.getQueue(),
      clinicService.getClinicAnalytics(),
      clinicService.getDailyEodReport(),
      clinicService.getMorbidityReport(),
      clinicService.getTaxDiscountAuditReport(),
      clinicService.getDoctorSharesReport(),
    ]);

    setMetrics(metricsData ?? null);
    setQueue(queueData ?? null);
    setQueueError(queueErr || metricsErr ? (queueErr ?? metricsErr)?.message ?? 'Request failed' : null);

    setAnalytics(analyticsData ?? null);
    setAnalyticsError(analyticsErr ? analyticsErr.message : null);

    setEodReport(eodData ?? null);
    setMorbidityReport(morbidityData ?? null);
    setTaxReport(taxData ?? null);
    setDoctorSharesReport(sharesData ?? null);
    const reportErr = eodErr ?? morbidityErr ?? taxErr ?? sharesErr;
    setReportsError(reportErr ? reportErr.message : null);
  }, []);

  const loadAnalytics = useCallback(async (start?: string, end?: string) => {
    setAnalyticsLoading(true);
    const [
      [analyticsData, analyticsErr],
      [morbidityData, morbidityErr],
    ] = await Promise.all([
      clinicService.getClinicAnalytics(start || undefined, end || undefined),
      clinicService.getMorbidityReport(start || undefined, end || undefined),
    ]);
    setAnalytics(analyticsData ?? null);
    setAnalyticsError(analyticsErr ? analyticsErr.message : null);
    if (morbidityData) setMorbidityReport(morbidityData);
    if (morbidityErr && !analyticsErr) setAnalyticsError(morbidityErr.message);
    setAnalyticsLoading(false);
  }, []);

  const loadReports = useCallback(async (type: ReportType, start?: string, end?: string, date?: string) => {
    setReportsError(null);
    if (type === 'DAILY_EOD') {
      const [data, err] = await clinicService.getDailyEodReport(date || undefined);
      setEodReport(data ?? null);
      if (err) setReportsError(err.message);
    } else if (type === 'MORBIDITY') {
      const [data, err] = await clinicService.getMorbidityReport(start || undefined, end || undefined);
      setMorbidityReport(data ?? null);
      if (err) setReportsError(err.message);
    } else if (type === 'TAX_DISCOUNT') {
      const [data, err] = await clinicService.getTaxDiscountAuditReport(start || undefined, end || undefined);
      setTaxReport(data ?? null);
      if (err) setReportsError(err.message);
    } else if (type === 'DOCTOR_SHARES') {
      const [data, err] = await clinicService.getDoctorSharesReport(start || undefined, end || undefined);
      setDoctorSharesReport(data ?? null);
      if (err) setReportsError(err.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const loadMetrics = useCallback(async () => {
    const [metricsData] = await clinicService.getQueueMetrics();
    if (metricsData) setMetrics(metricsData);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const retry = useCallback(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const requireStaff = (action: string): boolean => {
    if (currentStaff) return true;
    Alert.alert('Choose who is working', `Select your name under "Working as" before you ${action}.`);
    return false;
  };

  // Queue actions
  const handleCallPatient = async (item: PatientQueueItem) => {
    const doctorId = currentStaff?.id ?? item.doctorId;
    const doctorName = currentName || item.doctorName;
    if (!doctorId && !doctorName) {
      requireStaff('call a patient');
      return;
    }

    const roomId = currentStaff?.assignedRoomId ?? item.roomId ?? undefined;
    const roomOrStation = currentStaff?.assignedRoomName ?? item.roomOrStation ?? undefined;

    setActioningId(item.id);
    const [, err] = await clinicService.callQueueItem(
      item.id,
      doctorId,
      doctorName,
      roomOrStation,
      roomId,
    );
    setActioningId(null);

    if (err) {
      notify.error(err.message || 'Could not call the patient.');
      return;
    }

    setQueue((prev) =>
      (prev ?? []).map((q) =>
        q.id === item.id
          ? {
              ...q,
              status: 'InConsultation' as QueueStatus,
              calledTime: new Date().toISOString(),
              doctorId: doctorId ?? q.doctorId,
              doctorName: doctorName ?? q.doctorName,
              roomId: roomId ?? q.roomId,
              roomOrStation: roomOrStation ?? q.roomOrStation,
            }
          : q
      )
    );
  };

  const handleOpenTriage = async (item: PatientQueueItem) => {
    setTriageItem(item);
    setTriage({ ...EMPTY_TRIAGE, priority: item.priority, notes: item.chiefComplaint ?? '' });
    setZScorePreview(null);
    setTriagePatient(null);
    const [patientData] = await clinicService.getPatientById(item.patientId);
    if (patientData) {
      setTriagePatient(patientData);
      if (typeof patientData.age === 'number' && patientData.age < 2) {
        setTriage((prev) => ({ ...prev, posture: 'RECUMBENT' }));
      }
    }
  };

  const handlePutOnHold = async (item: PatientQueueItem) => {
    setActioningId(item.id);
    const [, err] = await clinicService.putOnHold(item.id);
    setActioningId(null);
    if (err) {
      notify.error(err.message || 'Could not put patient on hold.');
      return;
    }
    notify.info(`${item.patientName} put on hold.`);
    setQueue((prev) =>
      (prev ?? []).map((q) => (q.id === item.id ? { ...q, status: 'OnHold' as QueueStatus } : q))
    );
    loadMetrics();
  };

  const handleMarkNoShow = (item: PatientQueueItem) => {
    Alert.alert(
      'Mark as No-Show?',
      `Mark ${item.patientName} (Ticket ${item.queueNumber}) as no-show? This records their departure timestamp.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark No-Show',
          style: 'destructive',
          onPress: async () => {
            setActioningId(item.id);
            const [, err] = await clinicService.markNoShow(item.id);
            setActioningId(null);
            if (err) {
              notify.error(err.message || 'Could not mark patient as no-show.');
              return;
            }
            notify.info(`${item.patientName} marked as no-show.`);
            setQueue((prev) =>
              (prev ?? []).map((q) =>
                q.id === item.id
                  ? {
                      ...q,
                      status: 'NoShow' as QueueStatus,
                      completedTime: new Date().toISOString(),
                    }
                  : q
              )
            );
            loadMetrics();
          },
        },
      ]
    );
  };

  const handleCancelVisit = (item: PatientQueueItem) => {
    Alert.alert(
      'Cancel Visit?',
      `Cancel queue visit for ${item.patientName} (Ticket ${item.queueNumber})? This marks the patient as Left Without Being Seen (LWBS).`,
      [
        { text: 'Keep In Line', style: 'cancel' },
        {
          text: 'Cancel Visit',
          style: 'destructive',
          onPress: async () => {
            setActioningId(item.id);
            const [, err] = await clinicService.cancelQueueTicket(item.id, 'Patient left / LWBS');
            setActioningId(null);
            if (err) {
              notify.error(err.message || 'Could not cancel queue visit.');
              return;
            }
            notify.info(`Visit cancelled for ${item.patientName}.`);
            setQueue((prev) =>
              (prev ?? []).map((q) =>
                q.id === item.id
                  ? {
                      ...q,
                      status: 'Cancelled' as QueueStatus,
                      completedTime: new Date().toISOString(),
                    }
                  : q
              )
            );
            loadMetrics();
          },
        },
      ]
    );
  };

  const handleReactivate = async (item: PatientQueueItem) => {
    setActioningId(item.id);
    const [, err] = await clinicService.reactivateQueueItem(item.id);
    setActioningId(null);
    if (err) {
      notify.error(err.message || 'Could not reactivate queue ticket.');
      return;
    }
    notify.success(`${item.patientName} restored to waiting line.`);
    setQueue((prev) =>
      (prev ?? []).map((q) => (q.id === item.id ? { ...q, status: 'Waiting' as QueueStatus } : q))
    );
    loadMetrics();
  };

  const handleOpenReassign = (item: PatientQueueItem) => {
    setReassignModalItem(item);
    const docId = item.doctorId ?? '';
    setReassignDoctorId(docId);
    if (docId) {
      const doc = activeDoctors.find((d) => d.id === docId);
      const docRooms = doc?.assignedRoomIds ?? (doc?.assignedRoomId ? [doc.assignedRoomId] : []);
      setReassignRoomId(item.roomId ?? (docRooms[0] ?? ''));
    } else {
      setReassignRoomId(item.roomId ?? '');
    }
  };

  const handleSaveReassignment = async () => {
    if (!reassignModalItem || savingReassignment) return;
    setSavingReassignment(true);
    const chosenDoctor = reassignDoctorId ? activeDoctors.find((d) => d.id === reassignDoctorId) : undefined;
    const chosenRoom = reassignRoomId ? activeRooms.find((r) => r.id === reassignRoomId) : undefined;

    const [, err] = await clinicService.reassignQueueItem(reassignModalItem.id, {
      doctorId: chosenDoctor?.id,
      doctorName: chosenDoctor ? formatStaffName(chosenDoctor) : undefined,
      roomId: chosenRoom?.id,
      roomOrStation: chosenRoom?.name,
    });
    setSavingReassignment(false);

    if (err) {
      notify.error(err.message || 'Could not assign doctor/room to this ticket.');
      return;
    }

    const assignedDocLabel = chosenDoctor ? formatStaffName(chosenDoctor) : 'Unassigned';
    notify.success(`${reassignModalItem.patientName} assigned to ${assignedDocLabel}.`);
    setQueue((prev) =>
      (prev ?? []).map((q) =>
        q.id === reassignModalItem.id
          ? {
              ...q,
              doctorId: chosenDoctor?.id,
              doctorName: chosenDoctor ? formatStaffName(chosenDoctor) : undefined,
              roomId: chosenRoom?.id,
              roomOrStation: chosenRoom?.name,
            }
          : q
      )
    );
    setReassignModalItem(null);
  };

  const isPediatric = useMemo(() => {
    if (!triagePatient) return false;
    if (typeof triagePatient.age === 'number') {
      return triagePatient.age <= 5;
    }
    if (triagePatient.dateOfBirth) {
      const dob = new Date(triagePatient.dateOfBirth);
      const diffMs = Date.now() - dob.getTime();
      const ageYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
      return ageYears <= 5.1;
    }
    return false;
  }, [triagePatient]);

  useEffect(() => {
    if (!triageItem || !triagePatient || !isPediatric) {
      setZScorePreview(null);
      return;
    }
    const heightCm = parseOptionalFloat(triage.height);
    const weightKg = parseOptionalFloat(triage.weight);
    if (!heightCm || !weightKg || !triagePatient.dateOfBirth || !triagePatient.gender) {
      setZScorePreview(null);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      const [res] = await clinicService.calculatePediatricZScore({
        dateOfBirth: triagePatient.dateOfBirth,
        gender: triagePatient.gender,
        lengthOrHeightCm: heightCm,
        weightKg,
        isMeasuredRecumbent: triage.posture === 'RECUMBENT',
      });
      if (active) {
        setZScorePreview(res ?? null);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [triage.height, triage.weight, triage.posture, triagePatient, isPediatric, triageItem]);

  const setTriageField = <K extends keyof TriageForm>(key: K, value: TriageForm[K]) =>
    setTriage((prev) => ({ ...prev, [key]: value }));

  const handleSaveTriage = async () => {
    if (!triageItem) return;
    if (!requireStaff('record vitals')) return;

    const systolicBp = parseOptionalInt(triage.bpSys);
    const diastolicBp = parseOptionalInt(triage.bpDia);
    const heartRateBpm = parseOptionalInt(triage.hr);
    const respiratoryRateBreathsPerMin = parseOptionalInt(triage.rr);
    const temperatureCelsius = parseOptionalFloat(triage.temp);
    const oxygenSaturationPercent = parseOptionalInt(triage.spo2);
    const heightCm = parseOptionalFloat(triage.height);
    const weightKg = parseOptionalFloat(triage.weight);
    const painScore = parseOptionalInt(triage.pain);
    const visualAcuityLeft = triage.visualAcuityLeft.trim() || undefined;
    const visualAcuityRight = triage.visualAcuityRight.trim() || undefined;
    const headCircumferenceCm = parseOptionalFloat(triage.headCircumference);
    const midUpperArmCircumferenceCm = parseOptionalFloat(triage.midUpperArmCircumference);

    const hasAnyVital = [
      systolicBp,
      diastolicBp,
      heartRateBpm,
      respiratoryRateBreathsPerMin,
      temperatureCelsius,
      oxygenSaturationPercent,
      heightCm,
      weightKg,
      painScore,
      headCircumferenceCm,
      midUpperArmCircumferenceCm,
    ].some((v) => v !== undefined) || !!visualAcuityLeft || !!visualAcuityRight;
    if (!hasAnyVital) {
      Alert.alert('No vitals entered', 'Enter at least one vital sign before saving.');
      return;
    }

    const bmi =
      heightCm && weightKg ? Math.round((weightKg / ((heightCm / 100) * (heightCm / 100))) * 10) / 10 : undefined;

    const payload: RecordTriageRequest = {
      nurseId: currentStaff?.id,
      recordedByNurseName: currentName,
      systolicBp,
      diastolicBp,
      heartRateBpm,
      temperatureCelsius,
      respiratoryRateBreathsPerMin,
      oxygenSaturationPercent,
      heightCm,
      weightKg,
      painScore,
      notes: triage.notes,
      visualAcuityLeft,
      visualAcuityRight,
      headCircumferenceCm,
      midUpperArmCircumferenceCm,
      isMeasuredRecumbent: triage.posture === 'RECUMBENT',
      zScoreWeightForAge: zScorePreview?.weightForAgeZScore,
      zScoreLengthForAge: zScorePreview?.heightForAgeZScore,
      zScoreWeightForLength: zScorePreview?.weightForHeightZScore,
      philHealthZScoreCategory: zScorePreview?.philHealthZScoreCategory,
      philHealthZScoreCode: zScorePreview?.philHealthZScoreCode,
      preAssessmentNotes: triage.preAssessmentNotes.trim() || undefined,
      preAssessmentRemarks: triage.preAssessmentRemarks.trim() || undefined,
      triageAcuityReason: triage.priority,
    };

    setSavingTriage(true);
    const [, err] = await clinicService.recordTriage(triageItem.id, payload);
    setSavingTriage(false);

    if (err) {
      notify.error(err.message || 'Could not save vitals.');
      return;
    }

    const summaryParts: string[] = [];
    if (systolicBp !== undefined && diastolicBp !== undefined) summaryParts.push(`BP ${systolicBp}/${diastolicBp}`);
    if (heartRateBpm !== undefined) summaryParts.push(`HR ${heartRateBpm}`);
    if (respiratoryRateBreathsPerMin !== undefined) summaryParts.push(`RR ${respiratoryRateBreathsPerMin}/min`);
    if (temperatureCelsius !== undefined) summaryParts.push(`Temp ${temperatureCelsius}°C`);
    if (oxygenSaturationPercent !== undefined) summaryParts.push(`SpO2 ${oxygenSaturationPercent}%`);
    if (bmi !== undefined) summaryParts.push(`BMI ${bmi}`);
    if (zScorePreview?.philHealthZScoreCategory) summaryParts.push(`Z: ${zScorePreview.philHealthZScoreCategory}`);
    const summary = summaryParts.join(' • ');

    setQueue((prev) =>
      (prev ?? []).map((q) =>
        q.id === triageItem.id
          ? {
              ...q,
              status: 'Triaged' as QueueStatus,
              priority: triage.priority,
              hasVitals: true,
              vitalsSummary: summary || q.vitalsSummary,
              chiefComplaint: triage.notes || q.chiefComplaint,
            }
          : q
      )
    );
    notify.success('Vitals saved.');
    setTriageItem(null);
    setTriagePatient(null);
    setZScorePreview(null);
  };

  const queueCounts = useMemo(() => {
    const items = queue ?? [];
    const count = (status: QueueStatus) => items.filter((q) => q.status === status).length;
    return {
      ALL: items.length,
      Waiting: count('Waiting'),
      Triaged: count('Triaged'),
      InConsultation: count('InConsultation'),
      OnHold: count('OnHold'),
      NoShow: count('NoShow'),
      Completed: count('Completed'),
    };
  }, [queue]);

  const filteredQueue = useMemo(
    () => (queue ?? []).filter((item) => queueFilter === 'ALL' || item.status === queueFilter),
    [queue, queueFilter]
  );

  const reportTitle: Record<ReportType, string> = {
    DAILY_EOD: 'Daily end-of-day report',
    MORBIDITY: 'Morbidity report',
    TAX_DISCOUNT: 'Senior / PWD discount audit',
    DOCTOR_SHARES: 'Doctor shares',
  };

  const getCurrentReportPdfUrl = useCallback((): string => {
    switch (reportType) {
      case 'DAILY_EOD':
        return clinicService.getDailyEodPdfUrl(eodDate || eodReport?.reportDate);
      case 'MORBIDITY':
        return clinicService.getMorbidityPdfUrl(
          reportsStartDate || morbidityReport?.startDate,
          reportsEndDate || morbidityReport?.endDate
        );
      case 'TAX_DISCOUNT':
        return clinicService.getTaxDiscountsPdfUrl(
          reportsStartDate || taxReport?.startDate,
          reportsEndDate || taxReport?.endDate
        );
      case 'DOCTOR_SHARES':
        return clinicService.getDoctorSharesPdfUrl(
          reportsStartDate || doctorSharesReport?.startDate,
          reportsEndDate || doctorSharesReport?.endDate
        );
    }
  }, [reportType, eodDate, eodReport, reportsStartDate, reportsEndDate, morbidityReport, taxReport, doctorSharesReport]);

  const handleExportReportPdf = useCallback(async (customUrl?: string) => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    const url = customUrl || getCurrentReportPdfUrl();
    try {
      const opened = await openDocument(url);
      if (!opened) {
        notify.error('Unable to open document. Please check popup permissions.');
      }
    } catch (err: any) {
      notify.error(err?.message ?? 'Failed to stream vector PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [isExportingPdf, getCurrentReportPdfUrl]);

  const handleExportAnalyticsPdf = useCallback(async () => {
    const url = clinicService.getAnalyticsPdfUrl(
      analyticsStartDate || undefined,
      analyticsEndDate || undefined
    );
    await handleExportReportPdf(url);
  }, [analyticsStartDate, analyticsEndDate, handleExportReportPdf]);

  const currentReportReady =
    (reportType === 'DAILY_EOD' && !!eodReport) ||
    (reportType === 'MORBIDITY' && !!morbidityReport) ||
    (reportType === 'TAX_DISCOUNT' && !!taxReport) ||
    (reportType === 'DOCTOR_SHARES' && !!doctorSharesReport);

  // ------------------------------------------------------------------
  // Tab: live queue
  // ------------------------------------------------------------------
  const renderQueue = () => {
    const showSkeleton = loading && !queue;
    const maxFlow = Math.max(metrics?.totalCheckedIn ?? 0, 1);
    const completionRate = metrics ? (metrics.completedToday / maxFlow) * 100 : 0;

    return (
      <View style={styles.section}>
        <View style={styles.statRow}>
          {showSkeleton ? (
            <>
              <SkeletonStat style={styles.statItem} />
              <SkeletonStat style={styles.statItem} />
              <SkeletonStat style={styles.statItem} />
              <SkeletonStat style={styles.statItem} />
            </>
          ) : metrics ? (
            <>
              <StatCard style={styles.statItem} label="In queue" value={metrics.inQueue} icon="clock" />
              <StatCard
                style={styles.statItem}
                label="Urgent"
                value={metrics.urgentTriage}
                icon="alert"
                valueColor={metrics.urgentTriage > 0 ? theme.colors.emergency : undefined}
              />
              <StatCard
                style={styles.statItem}
                label="Completed today"
                value={metrics.completedToday}
                icon="checkCircle"
                valueColor={theme.colors.success}
              />
              <StatCard style={styles.statItem} label="Checked in today" value={metrics.totalCheckedIn} icon="patients" />
            </>
          ) : null}
        </View>

        {metrics ? (
          <Card>
            <CardContent style={styles.progressBlock}>
              <View style={styles.rowBetween}>
                <ThemedText variant="bodyBold">Visits completed</ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  {metrics.completedToday} of {metrics.totalCheckedIn} checked in
                </ThemedText>
              </View>
              <ProgressBar progress={completionRate} color={theme.colors.success} />
            </CardContent>
          </Card>
        ) : null}

        <View style={styles.queueActionsRow}>
          <View style={styles.queueFilterWrap}>
            <SegmentedControl<QueueFilter>
              value={queueFilter}
              onChange={setQueueFilter}
              options={[
                { value: 'ALL', label: 'All', count: queueCounts.ALL },
                { value: 'Waiting', label: 'Waiting', count: queueCounts.Waiting },
                { value: 'Triaged', label: 'Triaged', count: queueCounts.Triaged },
                { value: 'InConsultation', label: 'In consultation', count: queueCounts.InConsultation },
                { value: 'OnHold', label: 'On hold', count: queueCounts.OnHold },
                { value: 'NoShow', label: 'No show', count: queueCounts.NoShow },
                { value: 'Completed', label: 'Completed', count: queueCounts.Completed },
              ]}
            />
          </View>
          <View style={styles.queueButtonsWrap}>
            <Button
              title="Open TV Board"
              variant="outline"
              icon="maximize"
              size="sm"
              onPress={handleOpenTvDisplay}
            />
            <Button
              title="Force EOD / Close Day"
              variant="outline"
              icon="clock"
              size="sm"
              onPress={() => setShowForceEodModal(true)}
            />
          </View>
        </View>

        {showSkeleton ? (
          <LoadingBlock rows={4} />
        ) : queueError && !queue ? (
          <ErrorState title="Unable to load the queue" message={queueError} onRetry={retry} />
        ) : filteredQueue.length === 0 ? (
          <Card>
            <EmptyState
              icon="patients"
              title={queueFilter === 'ALL' ? 'No patients in the queue' : 'No patients match this filter'}
              description={
                queueFilter === 'ALL'
                  ? 'Patients appear here once they are checked in.'
                  : 'Try another status filter.'
              }
              actionTitle={queueFilter === 'ALL' ? 'Register a patient' : undefined}
              onAction={queueFilter === 'ALL' ? () => navigation.navigate('Patients', { openRegister: true }) : undefined}
            />
          </Card>
        ) : (
          filteredQueue.map((item) => {
            const badge = statusBadge(item.status);
            const isActioning = actioningId === item.id;
            const canCall = item.status === 'Waiting' || item.status === 'Triaged';
            const isCompleted = item.status === 'Completed';
            const canTriage = !isCompleted && item.status !== 'Cancelled' && item.status !== 'NoShow';

            // Wait time calculation for all active waiting patients
            const isWaitingState = item.status === 'Waiting' || item.status === 'Triaged' || item.status === 'OnHold';
            const waited = isWaitingState ? waitingMinutes(item.checkInTime) : null;
            const isOverdueWait = waited !== null && waited > 60;

            // Direct action eligibility
            const canHold = item.status === 'Waiting' || item.status === 'Triaged';
            const canNoShow = item.status === 'Waiting' || item.status === 'Triaged' || item.status === 'OnHold';
            const canCancel = item.status !== 'Completed' && item.status !== 'Cancelled' && item.status !== 'NoShow';
            const canReactivate = item.status === 'OnHold' || item.status === 'NoShow';

            return (
              <Card key={item.id}>
                <CardContent style={styles.queueItem}>
                  <View style={styles.queueHeader}>
                    <Badge label={item.queueNumber} variant={priorityVariant(item.priority)} />
                    <View style={styles.queueTitle}>
                      <ThemedText variant="bodyBold">{item.patientName}</ThemedText>
                      <ThemedText
                        variant="small"
                        color={isOverdueWait ? theme.colors.emergencyText : theme.colors.textSecondary}
                      >
                        {item.doctorName ? item.doctorName : 'Unassigned'}
                        {item.priority !== 'Routine' ? ` • ${item.priority}` : ''}
                        {waited !== null ? ` • waiting ${waited} min` : ''}
                      </ThemedText>
                    </View>
                    <View style={styles.badgeRow}>
                      {item.roomOrStation ? (
                        <Badge label={item.roomOrStation} variant="outline" size="sm" icon="clinic" />
                      ) : null}
                      {isOverdueWait ? (
                        <Badge label="Waiting > 60m" variant="emergency" icon="alert" />
                      ) : null}
                      <Badge label={badge.label} variant={badge.variant} icon={badge.icon} />
                    </View>
                  </View>

                  {item.chiefComplaint ? (
                    <ThemedText variant="body" color={theme.colors.textSecondary}>
                      {item.chiefComplaint}
                    </ThemedText>
                  ) : null}

                  {item.hasVitals && item.vitalsSummary ? (
                    <View style={styles.vitalsStrip}>
                      <ThemedText variant="small" color={theme.colors.primaryDark}>
                        {item.vitalsSummary}
                      </ThemedText>
                    </View>
                  ) : canTriage ? (
                    <View style={styles.pendingStrip}>
                      <ThemedText variant="small" color={theme.colors.warningText}>
                        Vitals not recorded yet
                      </ThemedText>
                    </View>
                  ) : null}

                  <View style={styles.actionRow}>
                    {canTriage ? (
                      <Button
                        title={item.hasVitals ? 'Update vitals' : 'Record vitals'}
                        variant="outline"
                        size="sm"
                        icon="activity"
                        onPress={() => handleOpenTriage(item)}
                      />
                    ) : null}
                    {item.status !== 'Completed' && item.status !== 'Cancelled' && item.status !== 'NoShow' ? (
                      item.doctorName ? (
                        <Button
                          title="Reassign"
                          variant="ghost"
                          size="sm"
                          icon="refresh"
                          onPress={() => handleOpenReassign(item)}
                        />
                      ) : (
                        <Button
                          title="Assign doctor"
                          variant="outline"
                          size="sm"
                          icon="userCheck"
                          onPress={() => handleOpenReassign(item)}
                        />
                      )
                    ) : null}
                    {canCall ? (
                      <Button
                        title="Call patient"
                        variant="primary"
                        size="sm"
                        icon="arrowRight"
                        loading={isActioning}
                        disabled={isActioning}
                        onPress={() => handleCallPatient(item)}
                      />
                    ) : null}
                    {item.status !== 'Cancelled' && item.status !== 'NoShow' ? (
                      <Button
                        title="Examine"
                        variant="secondary"
                        size="sm"
                        icon="consultations"
                        onPress={() =>
                          navigation.navigate('Consultations', {
                            patientId: item.patientId,
                            patientName: item.patientName,
                            queueId: item.id,
                          })
                        }
                      />
                    ) : null}
                    {canHold ? (
                      <Button
                        title="Put on hold"
                        variant="outline"
                        size="sm"
                        icon="clock"
                        loading={isActioning}
                        disabled={isActioning}
                        onPress={() => handlePutOnHold(item)}
                      />
                    ) : null}
                    {canReactivate ? (
                      <Button
                        title="Re-activate"
                        variant="primary"
                        size="sm"
                        icon="refresh"
                        loading={isActioning}
                        disabled={isActioning}
                        onPress={() => handleReactivate(item)}
                      />
                    ) : null}
                    {canNoShow ? (
                      <Button
                        title="No-show"
                        variant="outline"
                        size="sm"
                        icon="alertCircle"
                        loading={isActioning}
                        disabled={isActioning}
                        onPress={() => handleMarkNoShow(item)}
                      />
                    ) : null}
                    {canCancel ? (
                      <Button
                        title="Cancel visit"
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        loading={isActioning}
                        disabled={isActioning}
                        onPress={() => handleCancelVisit(item)}
                      />
                    ) : null}
                    {isCompleted ? (
                      <Button
                        title="Bill visit"
                        variant="success"
                        size="sm"
                        icon="billing"
                        onPress={() =>
                          navigation.navigate('Billing', {
                            patientId: item.patientId,
                            patientName: item.patientName,
                          })
                        }
                      />
                    ) : null}
                  </View>
                </CardContent>
              </Card>
            );
          })
        )}
      </View>
    );
  };

  // ------------------------------------------------------------------
  // Tab: analytics
  // ------------------------------------------------------------------
  const renderAnalytics = () => {
    if ((loading || analyticsLoading) && !analytics) {
      return (
        <View style={styles.section}>
          <View style={styles.statRow}>
            <SkeletonStat style={styles.statItem} />
            <SkeletonStat style={styles.statItem} />
            <SkeletonStat style={styles.statItem} />
            <SkeletonStat style={styles.statItem} />
          </View>
          <LoadingBlock rows={5} />
        </View>
      );
    }
    if (!analytics) {
      return (
        <ErrorState
          title="Unable to load analytics"
          message={analyticsError ?? 'No analytics are available yet.'}
          onRetry={() => loadAnalytics(analyticsStartDate, analyticsEndDate)}
        />
      );
    }

    return (
      <View style={styles.section}>
        {/* Top Controls: Date Range Filters & 1-Click PDF Actions */}
        <View style={styles.analyticsHeaderRow}>
          <View style={styles.dateRangePickerRow}>
            <View style={styles.dateInputWrap}>
              <Input
                label="Start Date"
                placeholder="YYYY-MM-DD"
                value={analyticsStartDate}
                onChangeText={setAnalyticsStartDate}
              />
            </View>
            <View style={styles.dateInputWrap}>
              <Input
                label="End Date"
                placeholder="YYYY-MM-DD"
                value={analyticsEndDate}
                onChangeText={setAnalyticsEndDate}
              />
            </View>
            <View style={styles.applyButtonWrap}>
              <Button
                title={analyticsLoading ? 'Filtering...' : 'Apply Filter'}
                variant="outline"
                size="sm"
                icon="refresh"
                disabled={analyticsLoading}
                onPress={() => loadAnalytics(analyticsStartDate, analyticsEndDate)}
              />
            </View>
          </View>
          <View style={styles.reportActionsRow}>
            <Button
              title={isExportingPdf ? 'Exporting...' : 'Export Analytics PDF'}
              variant="outline"
              size="sm"
              icon="download"
              disabled={isExportingPdf}
              onPress={handleExportAnalyticsPdf}
              accessibilityLabel="Export analytics vector PDF"
            />
            <Button
              title={isExportingPdf ? 'Preparing...' : 'Print'}
              variant="primary"
              size="sm"
              icon="print"
              disabled={isExportingPdf}
              onPress={handleExportAnalyticsPdf}
              accessibilityLabel="Print analytics vector PDF"
            />
          </View>
        </View>

        {/* KPI Stat Cards */}
        <View style={styles.statRow}>
          <StatCard
            style={styles.statItem}
            label="Gross billings"
            value={peso(analytics.totalGrossRevenue)}
            subtext="Before discounts"
            icon="billing"
          />
          <StatCard
            style={styles.statItem}
            label="Net collections"
            value={peso(analytics.totalCollections)}
            subtext="Received payments"
            icon="cash"
            valueColor={theme.colors.success}
          />
          <StatCard
            style={styles.statItem}
            label="Senior / PWD discounts"
            value={peso(analytics.seniorDiscountsGiven + analytics.pwdDiscountsGiven)}
            icon="tag"
            valueColor={theme.colors.warningText}
          />
          <StatCard
            style={styles.statItem}
            label="Unpaid balances"
            value={peso(analytics.totalUnpaidBalances)}
            icon="receipt"
            valueColor={analytics.totalUnpaidBalances > 0 ? theme.colors.emergency : undefined}
          />
        </View>

        <View style={styles.statRow}>
          <StatCard
            style={styles.statItem}
            label="Average wait"
            value={`${analytics.flow.averageWaitMinutes.toFixed(1)} min`}
            icon="timer"
          />
          <StatCard
            style={styles.statItem}
            label="Average consultation"
            value={`${analytics.flow.averageConsultMinutes.toFixed(1)} min`}
            icon="clock"
          />
          <StatCard
            style={styles.statItem}
            label="Average ticket"
            value={peso(analytics.averageTicketSize)}
            icon="receipt"
          />
        </View>

        {/* 1. TrendLineChart: Daily Revenue vs Patient Volume Trend */}
        <Card>
          <CardHeader
            title="Revenue & Patient Volume Trend"
            subtitle={`${analytics.startDate} to ${analytics.endDate}`}
          />
          <CardContent>
            <TrendLineChart
              data={analytics.revenueTrend}
              loading={analyticsLoading}
              error={analyticsError}
              onRetry={() => loadAnalytics(analyticsStartDate, analyticsEndDate)}
            />
          </CardContent>
        </Card>

        {/* 2. Responsive 2-Column: TenderDonutChart & WorkloadBarChart */}
        <View style={styles.twoCol}>
          <Card style={styles.col}>
            <CardHeader title="Payment Tender Collection Shares" />
            <CardContent>
              <TenderDonutChart
                data={analytics.tenderShares}
                loading={analyticsLoading}
                error={analyticsError}
                onRetry={() => loadAnalytics(analyticsStartDate, analyticsEndDate)}
              />
            </CardContent>
          </Card>

          <Card style={styles.col}>
            <CardHeader title="Physician Encounters & Workload" />
            <CardContent>
              <WorkloadBarChart
                data={analytics.doctorStats}
                loading={analyticsLoading}
                error={analyticsError}
                onRetry={() => loadAnalytics(analyticsStartDate, analyticsEndDate)}
              />
            </CardContent>
          </Card>
        </View>

        {/* 3. MorbidityDistributionChart: Top ICD-10 Conditions with Demographic Age Cohorts */}
        <Card>
          <CardHeader
            title="Top ICD-10 Morbidity Distribution"
            subtitle={`${morbidityReport?.startDate ?? analytics.startDate} to ${morbidityReport?.endDate ?? analytics.endDate}`}
          />
          <CardContent>
            <MorbidityDistributionChart
              data={morbidityReport?.diseases ?? (analytics.topDiagnoses as any) ?? []}
              loading={analyticsLoading}
              error={analyticsError}
              onRetry={() => loadAnalytics(analyticsStartDate, analyticsEndDate)}
            />
          </CardContent>
        </Card>

        {/* 4. Top Services Breakdown */}
        <Card>
          <CardHeader title="Top Services Billed" />
          <CardContent style={styles.listGap}>
            {analytics.topServices.length === 0 ? (
              <ThemedText variant="body" color={theme.colors.textMuted}>
                No services billed in this period.
              </ThemedText>
            ) : (
              analytics.topServices.map((service) => (
                <View key={`${service.itemType}-${service.itemName}`} style={styles.rowBetween}>
                  <ThemedText variant="body" style={styles.flexFill}>
                    {service.itemName}
                  </ThemedText>
                  <ThemedText variant="smallBold">{service.quantity}</ThemedText>
                </View>
              ))
            )}
          </CardContent>
        </Card>
      </View>
    );
  };

  // ------------------------------------------------------------------
  // Tab: statutory reports
  // ------------------------------------------------------------------
  const renderReportBody = () => {
    if (loading && !currentReportReady) return <LoadingBlock rows={6} />;
    if (!currentReportReady) {
      return (
        <ErrorState
          title="Report unavailable"
          message={reportsError ?? 'This report could not be generated.'}
          onRetry={retry}
        />
      );
    }

    if (reportType === 'DAILY_EOD' && eodReport) {
      return (
        <Card>
          <CardHeader
            title={reportTitle.DAILY_EOD}
            subtitle={eodReport.reportDate}
            rightAction={
              <Button
                title="Export Daily EOD PDF"
                variant="outline"
                size="sm"
                icon="download"
                disabled={isExportingPdf}
                onPress={() =>
                  handleExportReportPdf(
                    clinicService.getDailyEodPdfUrl(eodDate || eodReport.reportDate)
                  )
                }
                accessibilityLabel="Export Daily EOD PDF"
              />
            }
          />
          <CardContent style={styles.listGap}>
            <DataRow label="Checked in" value={eodReport.totalCheckedIn} />
            <DataRow label="Walk-ins" value={eodReport.totalWalkIns} />
            <DataRow label="Appointments" value={eodReport.totalAppointments} />
            <DataRow label="Completed visits" value={eodReport.totalCompletedVisits} />
            <DataRow label="Still waiting or in consultation" value={eodReport.totalWaitingOrInConsultation} />
            <View style={styles.divider} />
            <DataRow label="Gross amount" value={peso(eodReport.totalGrossAmount)} />
            <DataRow label="Discounts" value={peso(eodReport.totalDiscountsGiven)} />
            <DataRow label="Senior discounts" value={peso(eodReport.totalSeniorDiscounts)} />
            <DataRow label="PWD discounts" value={peso(eodReport.totalPwdDiscounts)} />
            <DataRow label="PhilHealth covered" value={peso(eodReport.totalPhilHealthCovered)} />
            <DataRow label="Net amount" value={peso(eodReport.totalNetAmount)} emphasize />
            <DataRow label="Amount collected" value={peso(eodReport.totalAmountCollected)} emphasize />
            <DataRow label="Cash in drawer" value={peso(eodReport.cashInDrawer)} />
            <DataRow label="Unpaid balances" value={peso(eodReport.totalUnpaidBalances)} />
            {eodReport.collectionsByMethod.length > 0 ? <View style={styles.divider} /> : null}
            {eodReport.collectionsByMethod.map((method) => (
              <DataRow
                key={method.method}
                label={`${method.method} (${method.transactionCount})`}
                value={peso(method.totalAmount)}
              />
            ))}
            <View style={styles.divider} />
            <DataRow label="Procedures performed" value={eodReport.totalProceduresPerformed} />
            <DataRow label="Lab orders issued" value={eodReport.totalLabOrdersIssued} />
            <DataRow label="Prescriptions written" value={eodReport.totalPrescriptionsWritten} />
            <DataRow label="Dangerous drug prescriptions" value={eodReport.totalDangerousDrugPrescriptions} />
          </CardContent>
        </Card>
      );
    }

    if (reportType === 'MORBIDITY' && morbidityReport) {
      return (
        <Card>
          <CardHeader
            title={reportTitle.MORBIDITY}
            subtitle={`${morbidityReport.startDate} to ${morbidityReport.endDate}`}
            rightAction={
              <Button
                title="Export Morbidity PDF"
                variant="outline"
                size="sm"
                icon="download"
                disabled={isExportingPdf}
                onPress={() =>
                  handleExportReportPdf(
                    clinicService.getMorbidityPdfUrl(
                      reportsStartDate || morbidityReport.startDate,
                      reportsEndDate || morbidityReport.endDate
                    )
                  )
                }
                accessibilityLabel="Export Morbidity PDF"
              />
            }
          />
          <CardContent style={styles.listGap}>
            <DataRow label="Encounters reviewed" value={morbidityReport.totalEncountersReviewed} />
            <DataRow label="Diagnoses recorded" value={morbidityReport.totalDiagnosesRecorded} />
            <View style={styles.divider} />
            {morbidityReport.diseases.length === 0 ? (
              <ThemedText variant="body" color={theme.colors.textMuted}>
                No diagnoses recorded in this period.
              </ThemedText>
            ) : (
              morbidityReport.diseases.map((disease) => (
                <View key={disease.icd10Code} style={styles.rowBetween}>
                  <View style={styles.flexFill}>
                    <ThemedText variant="body">
                      {disease.rank}. {disease.description}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {disease.icd10Code} • children {disease.pediatricCases} • adults {disease.adultCases} • seniors{' '}
                      {disease.seniorCases}
                    </ThemedText>
                  </View>
                  <ThemedText variant="smallBold">
                    {disease.totalCases} • {disease.percentageOfTotal.toFixed(1)}%
                  </ThemedText>
                </View>
              ))
            )}
          </CardContent>
        </Card>
      );
    }

    if (reportType === 'TAX_DISCOUNT' && taxReport) {
      return (
        <Card>
          <CardHeader
            title={reportTitle.TAX_DISCOUNT}
            subtitle={`${taxReport.startDate} to ${taxReport.endDate}`}
            rightAction={
              <Button
                title="Export Tax Audit PDF"
                variant="outline"
                size="sm"
                icon="download"
                disabled={isExportingPdf}
                onPress={() =>
                  handleExportReportPdf(
                    clinicService.getTaxDiscountsPdfUrl(
                      reportsStartDate || taxReport.startDate,
                      reportsEndDate || taxReport.endDate
                    )
                  )
                }
                accessibilityLabel="Export Tax Audit PDF"
              />
            }
          />
          <CardContent style={styles.listGap}>
            <DataRow label="Invoices audited" value={taxReport.totalInvoicesAudited} />
            <DataRow label="Gross sales" value={peso(taxReport.totalGrossSales)} />
            <DataRow label="Senior discounts" value={peso(taxReport.totalSeniorDiscounts)} />
            <DataRow label="PWD discounts" value={peso(taxReport.totalPwdDiscounts)} />
            <DataRow label="VAT exempted" value={peso(taxReport.totalVatExempted)} />
            <DataRow label="Net collections" value={peso(taxReport.totalNetCollections)} emphasize />
            <View style={styles.divider} />
            {taxReport.items.length === 0 ? (
              <ThemedText variant="body" color={theme.colors.textMuted}>
                No discounted invoices in this period.
              </ThemedText>
            ) : (
              taxReport.items.map((row) => (
                <View key={row.invoiceNumber} style={styles.rowBetween}>
                  <View style={styles.flexFill}>
                    <ThemedText variant="body">{row.patientName}</ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {row.invoiceNumber} • {row.discountType}
                      {row.identificationCardNumber ? ` • ID ${row.identificationCardNumber}` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText variant="smallBold">{peso(row.discountAmount)}</ThemedText>
                </View>
              ))
            )}
          </CardContent>
        </Card>
      );
    }

    if (reportType === 'DOCTOR_SHARES' && doctorSharesReport) {
      return (
        <Card>
          <CardHeader
            title={reportTitle.DOCTOR_SHARES}
            subtitle={`${doctorSharesReport.startDate} to ${doctorSharesReport.endDate}`}
            rightAction={
              <Button
                title="Export Doctor Shares PDF"
                variant="outline"
                size="sm"
                icon="download"
                disabled={isExportingPdf}
                onPress={() =>
                  handleExportReportPdf(
                    clinicService.getDoctorSharesPdfUrl(
                      reportsStartDate || doctorSharesReport.startDate,
                      reportsEndDate || doctorSharesReport.endDate
                    )
                  )
                }
                accessibilityLabel="Export Doctor Shares PDF"
              />
            }
          />
          <CardContent style={styles.listGap}>
            <DataRow label="Clinic encounters" value={doctorSharesReport.totalClinicEncounters} />
            <DataRow label="Gross revenue" value={peso(doctorSharesReport.totalClinicGrossRevenue)} />
            <DataRow label="Physician shares" value={peso(doctorSharesReport.totalPhysicianShares)} />
            <DataRow label="Facility share" value={peso(doctorSharesReport.totalFacilityShares)} emphasize />
            <View style={styles.divider} />
            {doctorSharesReport.doctorShares.length === 0 ? (
              <ThemedText variant="body" color={theme.colors.textMuted}>
                No doctor activity in this period.
              </ThemedText>
            ) : (
              doctorSharesReport.doctorShares.map((doctor) => (
                <View key={doctor.doctorId} style={styles.rowBetween}>
                  <View style={styles.flexFill}>
                    <ThemedText variant="body">{doctor.doctorName}</ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {doctor.totalEncounters} visits • gross {peso(doctor.totalGrossGenerated)}
                    </ThemedText>
                  </View>
                  <ThemedText variant="smallBold">{peso(doctor.estimatedPhysicianShare)}</ThemedText>
                </View>
              ))
            )}
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  const renderReports = () => (
    <View style={styles.section}>
      <View style={styles.reportsHeaderRow}>
        <View style={styles.segmentedWrap}>
          <SegmentedControl<ReportType>
            value={reportType}
            onChange={setReportType}
            options={[
              { value: 'DAILY_EOD', label: 'End of day' },
              { value: 'MORBIDITY', label: 'Morbidity' },
              { value: 'TAX_DISCOUNT', label: 'Discount audit' },
              { value: 'DOCTOR_SHARES', label: 'Doctor shares' },
            ]}
          />
        </View>
        <View style={styles.reportActionsRow}>
          <Button
            title={isExportingPdf ? 'Exporting...' : 'Export PDF'}
            variant="outline"
            size="sm"
            icon="download"
            disabled={!currentReportReady || isExportingPdf}
            onPress={() => handleExportReportPdf()}
            accessibilityLabel="Export report vector PDF"
          />
          <Button
            title={isExportingPdf ? 'Preparing...' : 'Print'}
            variant="primary"
            size="sm"
            icon="print"
            disabled={!currentReportReady || isExportingPdf}
            onPress={() => handleExportReportPdf()}
            accessibilityLabel="Print report vector PDF"
          />
        </View>
      </View>

      {/* Date Filter Bar for Reports */}
      <View style={styles.dateRangePickerRow}>
        {reportType === 'DAILY_EOD' ? (
          <View style={styles.dateInputWrap}>
            <Input
              label="Report Date"
              placeholder="YYYY-MM-DD"
              value={eodDate}
              onChangeText={setEodDate}
            />
          </View>
        ) : (
          <>
            <View style={styles.dateInputWrap}>
              <Input
                label="Start Date"
                placeholder="YYYY-MM-DD"
                value={reportsStartDate}
                onChangeText={setReportsStartDate}
              />
            </View>
            <View style={styles.dateInputWrap}>
              <Input
                label="End Date"
                placeholder="YYYY-MM-DD"
                value={reportsEndDate}
                onChangeText={setReportsEndDate}
              />
            </View>
          </>
        )}
        <View style={styles.applyButtonWrap}>
          <Button
            title="Apply Date"
            variant="outline"
            size="sm"
            icon="refresh"
            onPress={() => {
              if (reportType === 'DAILY_EOD') {
                loadReports('DAILY_EOD', undefined, undefined, eodDate);
              } else {
                loadReports(reportType, reportsStartDate, reportsEndDate);
              }
            }}
          />
        </View>
      </View>

      {renderReportBody()}
    </View>
  );

  const triageNumberField = (
    label: string,
    key: keyof TriageForm,
    options?: { keyboardType?: 'numeric' | 'decimal-pad'; placeholder?: string }
  ) => (
    <View style={styles.formCell}>
      <Input
        label={label}
        value={triage[key] as string}
        onChangeText={(text) => setTriageField(key, text as never)}
        keyboardType={options?.keyboardType ?? 'numeric'}
        placeholder={options?.placeholder}
      />
    </View>
  );

  return (
    <ResponsiveLayout
      headerTitle="Dashboard"
      actions={[
        {
          id: 'new-patient',
          label: 'New patient',
          shortLabel: 'New',
          icon: 'plus' as const,
          variant: 'primary' as const,
          primary: true,
          onPress: () => navigation.navigate('Patients', { openRegister: true }),
        },
      ]}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        <SegmentedControl<DashboardTab>
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'QUEUE', label: 'Live queue' },
            { value: 'ANALYTICS', label: 'Analytics' },
            { value: 'REPORTS', label: 'Reports' },
          ]}
        />

        {activeTab === 'QUEUE' ? renderQueue() : null}
        {activeTab === 'ANALYTICS' ? renderAnalytics() : null}
        {activeTab === 'REPORTS' ? renderReports() : null}
      </ScrollView>

      {/* Triage / vitals */}
      <Modal
        visible={!!triageItem}
        onClose={() => {
          setTriageItem(null);
          setTriagePatient(null);
          setZScorePreview(null);
        }}
        title="Record vitals"
        subtitle={
          triageItem
            ? `${triageItem.queueNumber} • ${triageItem.patientName}${
                triagePatient ? ` (${triagePatient.age}yo ${triagePatient.gender})` : ''
              }`
            : undefined
        }
        maxWidth={580}
        footer={
          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={() => {
                setTriageItem(null);
                setTriagePatient(null);
                setZScorePreview(null);
              }}
              disabled={savingTriage}
            />
            <Button title="Save vitals" variant="primary" onPress={handleSaveTriage} loading={savingTriage} />
          </View>
        }
      >
        <View style={styles.triageSectionHeader}>
          <Icon name="heartPulse" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Standard Vital Signs
          </ThemedText>
        </View>

        <View style={styles.formGrid}>
          {triageNumberField('Systolic BP (mmHg)', 'bpSys')}
          {triageNumberField('Diastolic BP (mmHg)', 'bpDia')}
          {triageNumberField('Heart rate (bpm)', 'hr')}
          {triageNumberField('Respiratory rate (/min)', 'rr')}
          {triageNumberField('Temperature (°C)', 'temp', { keyboardType: 'decimal-pad' })}
          {triageNumberField('SpO2 (%)', 'spo2')}
          {triageNumberField('Pain score (0-10)', 'pain')}
        </View>

        <View style={styles.triageSectionHeader}>
          <Icon name="activity" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Anthropometrics & Growth
          </ThemedText>
        </View>

        <View style={styles.formGrid}>
          {triageNumberField('Height / Length (cm)', 'height', { keyboardType: 'decimal-pad' })}
          {triageNumberField('Weight (kg)', 'weight', { keyboardType: 'decimal-pad' })}
          {isPediatric ? (
            <>
              {triageNumberField('Head circumference (cm)', 'headCircumference', { keyboardType: 'decimal-pad' })}
              {triageNumberField('MUAC (cm)', 'midUpperArmCircumference', { keyboardType: 'decimal-pad' })}
            </>
          ) : null}
        </View>

        {isPediatric ? (
          <View style={styles.postureSection}>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Measurement Posture (WHO adjustment: +0.7cm standing under 24m, -0.7cm recumbent &ge;24m)
            </ThemedText>
            <SegmentedControl<MeasurementPosture>
              value={triage.posture}
              onChange={(val) => setTriageField('posture', val)}
              options={[
                { value: 'STANDING', label: 'Standing height' },
                { value: 'RECUMBENT', label: 'Recumbent length (lying)' },
              ]}
            />
          </View>
        ) : null}

        {/* Live WHO Z-score chip preview badge */}
        {isPediatric && zScorePreview ? (
          <View style={styles.zScoreCard}>
            <View style={styles.zScoreHeader}>
              <View style={styles.zScoreTitleRow}>
                <Icon name="baby" size={16} color={theme.colors.primary} />
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  Live WHO Pediatric Growth & Z-Score
                </ThemedText>
              </View>
              {zScorePreview.philHealthZScoreCategory ? (
                <Badge
                  label={zScorePreview.philHealthZScoreCategory}
                  variant={getZScoreBadgeVariant(zScorePreview.philHealthZScoreCategory)}
                />
              ) : null}
            </View>
            <View style={styles.zScorePillsRow}>
              <View style={styles.zScorePill}>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Weight-for-Age (WAZ)
                </ThemedText>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  {zScorePreview.weightForAgeZScore != null ? `${zScorePreview.weightForAgeZScore} SD` : '—'}
                </ThemedText>
              </View>
              <View style={styles.zScorePill}>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Length/Height-for-Age (HAZ)
                </ThemedText>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  {zScorePreview.heightForAgeZScore != null ? `${zScorePreview.heightForAgeZScore} SD` : '—'}
                </ThemedText>
              </View>
              <View style={styles.zScorePill}>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Weight-for-Length (WHZ)
                </ThemedText>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  {zScorePreview.weightForHeightZScore != null ? `${zScorePreview.weightForHeightZScore} SD` : '—'}
                </ThemedText>
              </View>
            </View>
            {zScorePreview.interpretation ? (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {zScorePreview.interpretation} • Age: {zScorePreview.ageInMonths} mo • Adj: {zScorePreview.adjustedLengthHeightCm} cm
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        <View style={styles.triageSectionHeader}>
          <Icon name="eye" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Visual Acuity (Snellen)
          </ThemedText>
        </View>

        <View style={styles.formGrid}>
          <View style={styles.formCell}>
            <Input
              label="Left eye (OS)"
              value={triage.visualAcuityLeft}
              onChangeText={(text) => setTriageField('visualAcuityLeft', text)}
              placeholder="e.g. 20/20"
            />
          </View>
          <View style={styles.formCell}>
            <Input
              label="Right eye (OD)"
              value={triage.visualAcuityRight}
              onChangeText={(text) => setTriageField('visualAcuityRight', text)}
              placeholder="e.g. 20/20"
            />
          </View>
        </View>

        {/* Nursing Pre-Assessment & Acuity */}
        <View style={styles.triageSectionHeader}>
          <Icon name="consultations" size={16} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Nursing Pre-Assessment & Acuity
          </ThemedText>
        </View>

        <View style={styles.prioritySection}>
          <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: 4 }}>
            Triage Priority
          </ThemedText>
          <SegmentedControl<QueuePriority>
            value={triage.priority}
            onChange={(value) => setTriageField('priority', value)}
            options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))}
          />
        </View>

        {/* Clinical Observation Quick Chips */}
        <View style={styles.chipsSection}>
          <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: 4 }}>
            Pre-assessment Observations (tap to add to remarks)
          </ThemedText>
          <View style={styles.chipsRow}>
            {[
              'Alert & Oriented',
              'Mild Distress',
              'Acute Dyspnea',
              'Severe Pain',
              'Wheelchair Bound',
              'Fall Risk',
              'Ambulatory with Assist',
            ].map((chip) => {
              const isActive = triage.preAssessmentRemarks.includes(chip);
              return (
                <Pressable
                  key={chip}
                  onPress={() => {
                    if (isActive) {
                      const updated = triage.preAssessmentRemarks
                        .split(' • ')
                        .filter((c) => c.trim() !== chip)
                        .join(' • ');
                      setTriageField('preAssessmentRemarks', updated);
                    } else {
                      const updated = triage.preAssessmentRemarks.trim()
                        ? `${triage.preAssessmentRemarks.trim()} • ${chip}`
                        : chip;
                      setTriageField('preAssessmentRemarks', updated);
                    }
                  }}
                  style={[styles.observationChip, isActive && styles.observationChipActive]}
                >
                  <View style={styles.chipContent}>
                    {isActive ? (
                      <Icon name="check" size={12} color={theme.colors.primaryDark} />
                    ) : (
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        +
                      </ThemedText>
                    )}
                    <ThemedText
                      variant="caption"
                      color={isActive ? theme.colors.primaryDark : theme.colors.textSecondary}
                    >
                      {chip}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input
          label="Pre-assessment remarks (optional)"
          placeholder="Nurse initial observations, mobility, patient status..."
          value={triage.preAssessmentRemarks}
          onChangeText={(text) => setTriageField('preAssessmentRemarks', text)}
        />

        <Input
          label="Pre-assessment notes (optional)"
          placeholder="Detailed clinical triage notes for physician handoff..."
          value={triage.preAssessmentNotes}
          onChangeText={(text) => setTriageField('preAssessmentNotes', text)}
          multiline
          numberOfLines={2}
        />

        <Input
          label="Chief complaint / notes"
          value={triage.notes}
          onChangeText={(text) => setTriageField('notes', text)}
          multiline
          numberOfLines={2}
        />
      </Modal>



      <ForceEodConfirmationModal
        visible={showForceEodModal}
        onClose={() => setShowForceEodModal(false)}
        activeTicketCount={
          (queueCounts.Waiting ?? 0) + (queueCounts.Triaged ?? 0) + (queueCounts.OnHold ?? 0)
        }
        onSuccess={retry}
      />

      {/* Reassign / Assign Doctor & Room Modal */}
      <Modal
        visible={!!reassignModalItem}
        onClose={() => !savingReassignment && setReassignModalItem(null)}
        title={reassignModalItem?.doctorName ? 'Reassign Doctor & Room' : 'Assign Doctor & Room'}
        subtitle={
          reassignModalItem
            ? `Ticket ${reassignModalItem.queueNumber} · ${reassignModalItem.patientName}`
            : ''
        }
        maxWidth={540}
        footer={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setReassignModalItem(null)}
              disabled={savingReassignment}
            />
            <Button
              title="Save Assignment"
              icon="check"
              onPress={handleSaveReassignment}
              loading={savingReassignment}
            />
          </>
        }
      >
        <View style={{ gap: theme.spacing.md }}>
          <QueueRoutingSelector
            selectedDoctorId={reassignDoctorId}
            onSelectDoctor={setReassignDoctorId}
            selectedRoomId={reassignRoomId}
            onSelectRoom={setReassignRoomId}
            activeDoctors={activeDoctors}
            activeRooms={activeRooms}
            formatStaffName={formatStaffName}
          />
        </View>
      </Modal>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
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
  section: {
    gap: theme.spacing.lg,
  },
  queueActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  queueFilterWrap: {
    flex: 1,
    minWidth: 320,
  },
  queueButtonsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  statItem: {
    flexGrow: 1,
    flexBasis: 160,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  progressBlock: {
    gap: theme.spacing.sm,
  },
  queueItem: {
    gap: theme.spacing.md,
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  queueTitle: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  vitalsStrip: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  pendingStrip: {
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  listGap: {
    gap: theme.spacing.md,
  },
  flexFill: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  twoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
  },
  col: {
    flexGrow: 1,
    flexBasis: 320,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  trendLabel: {
    width: 64,
  },
  trendBar: {
    flex: 1,
  },
  trendValue: {
    width: 96,
    textAlign: 'right',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  dataLabel: {
    flex: 1,
  },
  divider: {
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.border,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  formCell: {
    flexGrow: 1,
    flexBasis: 150,
  },
  triageSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  postureSection: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  zScoreCard: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  zScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  zScoreTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  zScorePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  zScorePill: {
    flexGrow: 1,
    flexBasis: 100,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  prioritySection: {
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.md,
  },
  chipsSection: {
    marginVertical: theme.spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  observationChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  observationChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  analyticsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  dateRangePickerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    flex: 1,
  },
  dateInputWrap: {
    minWidth: 140,
    flex: 1,
  },
  applyButtonWrap: {
    paddingBottom: 2,
  },
  reportsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  segmentedWrap: {
    flex: 1,
    minWidth: 320,
  },
  reportActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
