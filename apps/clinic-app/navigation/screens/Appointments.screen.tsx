import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useNavigation, type StaticScreenProps } from '@react-navigation/native';
import { notify } from '@utils/feedback';
import {
  ThemedText,
  Badge,
  Button,
  Input,
  Card,
  Icon,
  Modal,
  EmptyState,
  ErrorState,
  SkeletonList,
  ValidatedDateInput,
  validateDateString,
  TimeInput,
  ServiceSelect,
} from '@ui';
import type { BadgeVariant } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { useClinic } from '../../context/ClinicContext';
import PatientSearchResultRow, {
  parseConfiguredSearchFields,
} from '../../components/patient/PatientSearchResultRow';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import QueueRoutingSelector from '../../components/queue/QueueRoutingSelector';
import {
  clinicService,
  getManilaTodayStr,
  AppointmentItem,
  AppointmentStatus,
  ClinicPatient,
  ClinicCustomFieldDefinition,
  GetAppointmentsOptions,
} from '../../services/clinicService';
import { SlotPicker } from '../../components/roster/SlotPicker';
import { DoctorRosterCalendarModal } from '../../components/roster/DoctorRosterCalendarModal';
import QueueConflictModal from '../../components/queue/QueueConflictModal';
import {
  CalendarHeader,
  CalendarSkeleton,
  MonthView,
  WeekView,
  DayView,
  AgendaView,
  AppointmentInspectionModal,
  AppointmentRescheduleModal,
  getManilaTodayStr,
  toDateString,
  parseDateOnly,
  formatDateString,
  getDaysInMonth,
  type CalendarViewMode,
  type ExtendedAppointmentItem,
  type DoctorShiftOverlay,
} from '../../components/calendar';

export type AppointmentsRouteParams = {
  patientId?: string;
  patientName?: string;
  patientCode?: string;
  date?: string;
  view?: CalendarViewMode;
  tab?: string;
  appointmentId?: string;
};

export type AppointmentsScreenProps = StaticScreenProps<AppointmentsRouteParams | undefined>;

export function buildPreselectedPatientFromRoute(
  params?: AppointmentsRouteParams | null
): ClinicPatient | null {
  const id = params?.patientId?.trim();
  const fullName = params?.patientName?.trim();
  if (!id || !fullName) return null;
  return {
    id,
    tenantId: '',
    clinicId: '',
    patientCode: params?.patientCode?.trim() ?? '',
    firstName: '',
    lastName: '',
    fullName,
    dateOfBirth: '',
    age: 0,
    gender: '',
    contactNumber: '',
    verificationStatus: 'Verified',
    createdAt: '',
  };
}

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'Confirmed', label: 'Confirmed' },
  { key: 'CheckedIn', label: 'Checked in' },
  { key: 'Pending', label: 'Pending' },
];

export function formatTime(isoString?: string): string {
  if (!isoString) return '--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDay(isoString?: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Two hours from now, as editable form values. */
export function defaultSlot(): { date: string; time: string } {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:00`,
  };
}

function getStatusBadge(status: AppointmentStatus): { variant: BadgeVariant; label: string } {
  switch (status) {
    case 'CheckedIn':
      return { variant: 'success', label: 'Checked in' };
    case 'InConsultation':
      return { variant: 'purple', label: 'In consultation' };
    case 'Completed':
      return { variant: 'neutral', label: 'Completed' };
    case 'Pending':
      return { variant: 'warning', label: 'Pending' };
    case 'Cancelled':
      return { variant: 'emergency', label: 'Cancelled' };
    case 'Confirmed':
    default:
      return { variant: 'primary', label: 'Confirmed' };
  }
}

export interface AppointmentBookedSuccessViewProps {
  appointment: AppointmentItem;
}

export function AppointmentBookedSuccessView({ appointment }: AppointmentBookedSuccessViewProps) {
  return (
    <View style={styles.successContainer} testID="appointment-booked-success-view">
      <View style={styles.successBanner}>
        <Icon name="checkCircle" size={theme.sizes.iconLg} color={theme.colors.successText} />
        <View style={styles.flexFill}>
          <ThemedText variant="bodyBold" color={theme.colors.successText}>
            Appointment confirmed for {appointment.patientName}
          </ThemedText>
          <ThemedText variant="small" color={theme.colors.successText}>
            The appointment has been added to the clinic schedule.
          </ThemedText>
        </View>
      </View>

      <View style={styles.successSummaryCard}>
        <View style={styles.successSummaryRow}>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Patient
          </ThemedText>
          <ThemedText variant="bodyBold">{appointment.patientName}</ThemedText>
        </View>
        <View style={styles.successSummaryRow}>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Date & Time
          </ThemedText>
          <ThemedText variant="bodyBold" color={theme.colors.primary}>
            {[formatDay(appointment.scheduledAt), formatTime(appointment.scheduledAt)]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
        </View>
        <View style={styles.successSummaryRow}>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Attending physician
          </ThemedText>
          <ThemedText variant="body">
            {appointment.doctorName || 'Any available provider'}
          </ThemedText>
        </View>
        {appointment.serviceType ? (
          <View style={styles.successSummaryRow}>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Service type
            </ThemedText>
            <ThemedText variant="body">{appointment.serviceType}</ThemedText>
          </View>
        ) : null}
        {appointment.reason ? (
          <View style={styles.successSummaryRow}>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Reason for visit
            </ThemedText>
            <ThemedText variant="body">{appointment.reason}</ThemedText>
          </View>
        ) : null}
      </View>

      <ThemedText variant="small" color={theme.colors.textSecondary}>
        Would you like to book a new appointment or close this dialog?
      </ThemedText>
    </View>
  );
}

export default function AppointmentsScreen({ route }: Partial<AppointmentsScreenProps> = {}) {
  const navigation = useNavigation<any>();
  const incomingPatientId = route?.params?.patientId;
  const incomingPatientName = route?.params?.patientName;
  const incomingPatientCode = route?.params?.patientCode;
  const initialPreselected = useMemo(
    () =>
      buildPreselectedPatientFromRoute({
        patientId: incomingPatientId,
        patientName: incomingPatientName,
        patientCode: incomingPatientCode,
      }),
    // Only evaluate initial preselected state on first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const isCheckingInRef = useRef(false);
  const [conflictModal, setConflictModal] = useState<{
    visible: boolean;
    error?: any;
    patientName?: string;
  } | null>(null);
  const { staff } = useStaff();
  const { settings, rooms } = useClinic();
  const doctors = staff.filter((s) => s.role === 'Doctor');
  const activeDoctors = useMemo(() => staff.filter((s) => s.role === 'Doctor' && s.isActive), [staff]);
  const activeRooms = useMemo(() => (rooms || []).filter((r) => r.isActive), [rooms]);
  const [customFieldDefs, setCustomFieldDefs] = useState<ClinicCustomFieldDefinition[]>([]);

  useEffect(() => {
    clinicService.getCustomFields('ClinicPatient').then(([defs]) => {
      if (defs) setCustomFieldDefs(defs);
    });
  }, []);

  const configuredSearchFields = useMemo(
    () => parseConfiguredSearchFields(settings?.patientSearchDisplayFieldsJson),
    [settings?.patientSearchDisplayFieldsJson]
  );

  const [appointments, setAppointments] = useState<AppointmentItem[]>(
    () => (route?.params as any)?.initialAppointments ?? []
  );
  const [loading, setLoading] = useState(
    () => (route?.params as any)?.initialLoading ?? true
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [checkInAppointment, setCheckInAppointment] = useState<AppointmentItem | null>(null);
  const [checkInDoctorId, setCheckInDoctorId] = useState<string>('');
  const [checkInRoomId, setCheckInRoomId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Calendar View & Navigation State
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() =>
    (route?.params?.view as CalendarViewMode) || 'month'
  );
  const [currentDate, setCurrentDate] = useState<string>(() =>
    route?.params?.date || getManilaTodayStr()
  );
  const [calendarDoctorId, setCalendarDoctorId] = useState<string | null>(null);
  const [inspectedAppointment, setInspectedAppointment] = useState<ExtendedAppointmentItem | null>(
    () => {
      const apt = (route?.params as any)?.appointment;
      if (apt) return apt;
      const initialApts: AppointmentItem[] = (route?.params as any)?.initialAppointments ?? [];
      const aptId = route?.params?.appointmentId;
      if (aptId) {
        return initialApts.find((a) => a.id === aptId) || null;
      }
      return null;
    }
  );
  const [rescheduleAppointment, setRescheduleAppointment] = useState<ExtendedAppointmentItem | null>(
    () => (route?.params as any)?.rescheduleAppointment || null
  );

  const currentDateObj = useMemo(() => {
    const { year, month, day } = parseDateOnly(currentDate);
    return new Date(year, month - 1, day, 12, 0, 0);
  }, [currentDate]);

  const doctorOverlays: DoctorShiftOverlay[] = useMemo(() => {
    return activeDoctors.map((doc) => {
      const room = doc.assignedRoomIds?.[0]
        ? activeRooms.find((r) => r.id === doc.assignedRoomIds?.[0])
        : activeRooms.find((r) => r.id === (doc as any).assignedRoomId);
      return {
        doctorId: doc.id,
        doctorName: formatStaffName(doc),
        isOnDuty: true,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        breaks: [{ start: '12:00', end: '13:00', description: 'Lunch Break' }],
        roomName: room?.name,
      };
    });
  }, [activeDoctors, activeRooms]);

  // Booking Modal State
  const [bookModalVisible, setBookModalVisible] = useState<boolean>(() => Boolean(initialPreselected));
  const [bookedAppointment, setBookedAppointment] = useState<AppointmentItem | null>(null);
  const [rosterModalVisible, setRosterModalVisible] = useState(
    () => route?.params?.tab === 'roster'
  );
  const [booking, setBooking] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<ClinicPatient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [formPatient, setFormPatient] = useState<ClinicPatient | null>(() => initialPreselected);
  const [formDoctorId, setFormDoctorId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState<string>(() => (initialPreselected ? defaultSlot().date : ''));
  const [formTime, setFormTime] = useState<string>(() => (initialPreselected ? defaultSlot().time : ''));
  const [formServiceTypes, setFormServiceTypes] = useState<string[]>(['Consultation']);
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const fetchAppointments = useCallback(async () => {
    const options: GetAppointmentsOptions = {};

    if (calendarDoctorId) {
      options.doctorId = calendarDoctorId;
    }

    const { year, month, day } = parseDateOnly(currentDate);

    if (viewMode === 'month') {
      const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
      const firstDayOfWeek = firstOfMonth.getUTCDay(); // 0 = Sun
      const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstDayOfWeek));
      const gridEnd = new Date(gridStart.getTime() + 41 * 86400000);
      options.startDate = `${gridStart.getUTCFullYear()}-${pad(gridStart.getUTCMonth() + 1)}-${pad(gridStart.getUTCDate())}`;
      options.endDate = `${gridEnd.getUTCFullYear()}-${pad(gridEnd.getUTCMonth() + 1)}-${pad(gridEnd.getUTCDate())}`;
    } else if (viewMode === 'week') {
      const current = new Date(year, month - 1, day, 12, 0, 0);
      const dayOfWeek = current.getDay();
      const startOfWeek = new Date(current.getTime() - dayOfWeek * 86400000);
      const endOfWeek = new Date(startOfWeek.getTime() + 6 * 86400000);
      options.startDate = toDateString(startOfWeek);
      options.endDate = toDateString(endOfWeek);
    } else if (viewMode === 'day') {
      options.date = currentDate;
    } else if (viewMode === 'agenda') {
      if (statusFilter && statusFilter !== 'ALL') {
        options.status = statusFilter as AppointmentStatus;
      }
    }

    const [data, err] = await clinicService.getAppointments(options);
    if (err) {
      setLoadError(err.message || 'Unable to load appointments.');
      return;
    }
    setAppointments(data ?? []);
    setLoadError(null);
  }, [viewMode, currentDate, calendarDoctorId, statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchAppointments().finally(() => setLoading(false));
  }, [fetchAppointments]);

  // Debounced patient lookup for the booking form.
  useEffect(() => {
    const term = patientSearch.trim();
    if (formPatient || term.length < 2) {
      setPatientResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearchingPatients(true);
      const [data, err] = await clinicService.getPatients(term);
      setSearchingPatients(false);
      if (err) {
        notify.error(err.message || 'Unable to search patients.');
        setPatientResults([]);
        return;
      }
      setPatientResults((data ?? []).slice(0, 5));
    }, 300);
    return () => clearTimeout(handle);
  }, [patientSearch, formPatient]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  }, [fetchAppointments]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    fetchAppointments().finally(() => setLoading(false));
  }, [fetchAppointments]);

  const resetForm = useCallback(() => {
    setPatientSearch('');
    setPatientResults([]);
    setFormPatient(null);
    setFormDoctorId(null);
    setFormServiceTypes(['Consultation']);
    setFormReason('');
    setFormNotes('');
  }, []);

  const openBookModal = useCallback((preselectedPatient?: ClinicPatient | null) => {
    const slot = defaultSlot();
    const validPatient =
      preselectedPatient &&
      typeof preselectedPatient === 'object' &&
      typeof preselectedPatient.id === 'string' &&
      typeof preselectedPatient.fullName === 'string'
        ? preselectedPatient
        : null;

    setBookedAppointment(null);
    setPatientSearch('');
    setPatientResults([]);
    setFormPatient(validPatient);
    setFormDoctorId(null);
    setFormDate(slot.date);
    setFormTime(slot.time);
    setFormServiceTypes(['Consultation']);
    setFormReason('');
    setFormNotes('');
    setBookModalVisible(true);
  }, []);

  const closeBookModal = useCallback(() => {
    setBookModalVisible(false);
    setBookedAppointment(null);
    resetForm();
  }, [resetForm]);

  // Arriving from "Book appointment" on the Patient Directory: preselect the patient and open the modal.
  useEffect(() => {
    if (!incomingPatientId) return;

    const preselected = buildPreselectedPatientFromRoute({
      patientId: incomingPatientId,
      patientName: incomingPatientName,
      patientCode: incomingPatientCode,
    });

    if (preselected) {
      openBookModal(preselected);
      navigation.setParams?.({
        patientId: undefined,
        patientName: undefined,
        patientCode: undefined,
      });
      return;
    }

    let cancelled = false;
    (async () => {
      const [patient, err] = await clinicService.getPatientById(incomingPatientId);
      if (cancelled) return;
      navigation.setParams?.({
        patientId: undefined,
        patientName: undefined,
        patientCode: undefined,
      });
      if (patient) {
        openBookModal(patient);
      } else {
        notify.error(err?.message || 'Could not load the selected patient for booking.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [incomingPatientId, incomingPatientName, incomingPatientCode, navigation, openBookModal]);

  // Deep-link from Global Search Quick Action: quick-action-roster
  useEffect(() => {
    if (route?.params?.tab === 'roster') {
      setRosterModalVisible(true);
      navigation.setParams?.({ tab: undefined });
    }
  }, [route?.params?.tab, navigation]);

  // Deep-link from Global Search Provider: appointmentId
  useEffect(() => {
    const aptId = route?.params?.appointmentId;
    if (!aptId) return;
    const match = appointments.find((a) => a.id === aptId);
    if (match) {
      setInspectedAppointment(match);
      navigation.setParams?.({ appointmentId: undefined });
    } else if (!loading) {
      clinicService.getAppointments().then(([allApts]) => {
        const found = allApts?.find((a) => a.id === aptId);
        if (found) {
          setInspectedAppointment(found);
          navigation.setParams?.({ appointmentId: undefined });
        }
      });
    }
  }, [route?.params?.appointmentId, appointments, loading, navigation]);

  // Deep-link / route param: date
  useEffect(() => {
    if (route?.params?.date && route.params.date !== currentDate) {
      setCurrentDate(route.params.date);
    }
  }, [route?.params?.date]);

  // Deep-link / route param: view
  useEffect(() => {
    if (route?.params?.view && route.params.view !== viewMode) {
      setViewMode(route.params.view as CalendarViewMode);
    }
  }, [route?.params?.view]);

  const handlePrev = useCallback(() => {
    const { year, month, day } = parseDateOnly(currentDate);
    if (viewMode === 'month') {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const maxDays = getDaysInMonth(prevYear, prevMonth);
      setCurrentDate(formatDateString(prevYear, prevMonth, Math.min(day, maxDays)));
    } else if (viewMode === 'week') {
      const d = new Date(year, month - 1, day - 7, 12, 0, 0);
      setCurrentDate(toDateString(d));
    } else {
      const d = new Date(year, month - 1, day - 1, 12, 0, 0);
      setCurrentDate(toDateString(d));
    }
  }, [currentDate, viewMode]);

  const handleNext = useCallback(() => {
    const { year, month, day } = parseDateOnly(currentDate);
    if (viewMode === 'month') {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const maxDays = getDaysInMonth(nextYear, nextMonth);
      setCurrentDate(formatDateString(nextYear, nextMonth, Math.min(day, maxDays)));
    } else if (viewMode === 'week') {
      const d = new Date(year, month - 1, day + 7, 12, 0, 0);
      setCurrentDate(toDateString(d));
    } else {
      const d = new Date(year, month - 1, day + 1, 12, 0, 0);
      setCurrentDate(toDateString(d));
    }
  }, [currentDate, viewMode]);

  const handleToday = useCallback(() => {
    setCurrentDate(getManilaTodayStr());
  }, []);

  const handleSelectDate = useCallback((d: Date) => {
    setCurrentDate(toDateString(d));
    if (viewMode === 'month') {
      setViewMode('day');
    }
  }, [viewMode]);

  const handleSelectSlot = useCallback(
    (date: Date, timeStr: string, doctorId?: string) => {
      const dateStr = toDateString(date);
      setBookedAppointment(null);
      setPatientSearch('');
      setPatientResults([]);
      setFormPatient(null);
      setFormDoctorId(doctorId || null);
      setFormDate(dateStr);
      setFormTime(timeStr);
      setFormServiceTypes(['Consultation']);
      setFormReason('');
      setFormNotes('');
      setBookModalVisible(true);
    },
    []
  );

  const handleBookAppointment = async () => {
    if (!formPatient) {
      notify.error('Select a patient for this appointment.');
      return;
    }
    const dateCheck = validateDateString(formDate, { boundaryMode: 'futureOrToday' });
    if (!dateCheck.isValid) {
      notify.error(dateCheck.errorMessage || 'Enter a valid appointment date (today or in the future).');
      return;
    }
    const scheduled = new Date(`${formDate}T${formTime}`);
    if (isNaN(scheduled.getTime())) {
      notify.error('Enter a valid date (YYYY-MM-DD) and time (HH:MM).');
      return;
    }
    const doctor = doctors.find((d) => d.id === formDoctorId);

    setBooking(true);
    const [newApt, err] = await clinicService.createAppointment({
      patientId: formPatient.id,
      patientName: formPatient.fullName,
      doctorId: doctor?.id,
      doctorName: doctor ? formatStaffName(doctor) : undefined,
      scheduledAt: scheduled.toISOString(),
      serviceType: formServiceTypes.join(', ').trim() || undefined,
      reason: formReason.trim() || 'General Consultation',
      notes: formNotes.trim() || undefined,
    });
    setBooking(false);

    if (err || !newApt) {
      notify.error(err?.message || 'The appointment could not be booked. Please try again.');
      return;
    }

    setAppointments((prev) => [newApt, ...prev]);
    setBookedAppointment(newApt);
    notify.success(`Appointment booked for ${formPatient.fullName}.`);
    resetForm();
  };

  const handleCancelAppointment = async (item: AppointmentItem) => {
    const [, err] = await clinicService.cancelAppointment(item.id, 'Cancelled by clinic desk');
    if (err) {
      notify.error(err.message || 'The appointment could not be cancelled.');
      return;
    }
    setAppointments((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, status: 'Cancelled' as AppointmentStatus } : a))
    );
    notify.success(`Appointment for ${item.patientName} was cancelled.`);
  };

  const handleOpenCheckInModal = (item: AppointmentItem) => {
    setCheckInAppointment(item);
    const docId = item.doctorId ?? '';
    setCheckInDoctorId(docId);
    if (docId) {
      const doc = activeDoctors.find((d) => d.id === docId);
      const docRooms = doc?.assignedRoomIds ?? (doc?.assignedRoomId ? [doc.assignedRoomId] : []);
      setCheckInRoomId(docRooms[0] ?? '');
    } else {
      setCheckInRoomId('');
    }
  };

  const handleConfirmAppointmentCheckIn = async () => {
    if (!checkInAppointment || isCheckingInRef.current || checkingInId) return;
    const item = checkInAppointment;
    isCheckingInRef.current = true;
    setCheckingInId(item.id);

    const chosenDoctor = checkInDoctorId ? activeDoctors.find((d) => d.id === checkInDoctorId) : undefined;
    const chosenRoom = checkInRoomId ? activeRooms.find((r) => r.id === checkInRoomId) : undefined;

    try {
      const isUrgent = item.reason?.toLowerCase().includes('chest') || item.reason?.toLowerCase().includes('pain');
      const [queueItem, err] = await clinicService.checkInPatient({
        patientId: item.patientId,
        patientName: item.patientName,
        appointmentId: item.id,
        doctorId: chosenDoctor?.id,
        doctorName: chosenDoctor ? formatStaffName(chosenDoctor) : undefined,
        roomId: chosenRoom?.id,
        roomOrStation: chosenRoom?.name,
        priority: isUrgent ? 'Urgent' : 'Routine',
        chiefComplaint: item.reason ?? 'General Consultation',
        queueDate: getManilaTodayStr(),
      });

      if (err) {
        if (
          err.status === 409 ||
          err.errorCode === 'CONFLICT' ||
          err.errorCode === 'active_queue_ticket_exists'
        ) {
          setCheckInAppointment(null);
          setConflictModal({
            visible: true,
            error: err,
            patientName: item.patientName,
          });
          return;
        }
        notify.error(err.message || `Could not check in ${item.patientName}. Please try again.`);
        return;
      }

      setCheckInAppointment(null);
      setAppointments((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'CheckedIn' as AppointmentStatus } : a))
      );
      notify.success(
        queueItem?.queueNumber
          ? `${item.patientName} checked in. Queue number ${queueItem.queueNumber}.`
          : `${item.patientName} checked in.`
      );
    } finally {
      isCheckingInRef.current = false;
      setCheckingInId(null);
    }
  };

  const renderCalendarView = () => {
    if (loading && !refreshing) {
      return <CalendarSkeleton viewMode={viewMode} />;
    }
    if (loadError) {
      return (
        <ErrorState
          title="Unable to load clinic calendar"
          message={loadError}
          onRetry={retryLoad}
        />
      );
    }

    switch (viewMode) {
      case 'month':
        return (
          <MonthView
            currentDate={currentDateObj}
            appointments={appointments}
            isLoading={false}
            error={null}
            onRetry={retryLoad}
            onSelectDate={handleSelectDate}
            onSelectAppointment={(appt) => setInspectedAppointment(appt)}
          />
        );
      case 'week':
        return (
          <WeekView
            currentDate={currentDateObj}
            appointments={appointments}
            isLoading={false}
            error={null}
            onRetry={retryLoad}
            onSelectDate={handleSelectDate}
            onSelectSlot={handleSelectSlot}
            onSelectAppointment={(appt) => setInspectedAppointment(appt)}
          />
        );
      case 'day':
        return (
          <DayView
            currentDate={currentDateObj}
            appointments={appointments}
            isLoading={false}
            error={null}
            onRetry={retryLoad}
            onSelectDate={handleSelectDate}
            onSelectSlot={handleSelectSlot}
            onSelectAppointment={(appt) => setInspectedAppointment(appt)}
            activeDoctorId={calendarDoctorId || undefined}
            doctorOverlays={doctorOverlays}
          />
        );
      case 'agenda':
      default:
        return (
          <AgendaView
            currentDate={currentDateObj}
            appointments={appointments}
            isLoading={false}
            error={null}
            onRetry={retryLoad}
            onSelectDate={handleSelectDate}
            onSelectSlot={handleSelectSlot}
            onSelectAppointment={(appt) => setInspectedAppointment(appt)}
            onCheckIn={handleOpenCheckInModal}
            onReschedule={(appt) => setRescheduleAppointment(appt)}
            onCancel={handleCancelAppointment}
          />
        );
    }
  };

  return (
    <ResponsiveLayout
      headerTitle="Appointments"
      actions={[
        {
          id: 'rosters',
          label: 'Doctor Rosters',
          shortLabel: 'Rosters',
          icon: 'calendar' as const,
          variant: 'outline' as const,
          onPress: () => setRosterModalVisible(true),
        },
        {
          id: 'book',
          label: 'Book appointment',
          shortLabel: 'Book',
          icon: 'plus' as const,
          variant: 'primary' as const,
          primary: true,
          onPress: () => openBookModal(null),
        },
      ]}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        <CalendarHeader
          viewMode={viewMode}
          currentDate={currentDateObj}
          onViewModeChange={setViewMode}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
          onSelectDate={handleSelectDate}
          activeDoctorId={calendarDoctorId || undefined}
          onDoctorChange={(docId) => setCalendarDoctorId(docId || null)}
          doctors={activeDoctors.map((d) => ({ id: d.id, name: formatStaffName(d) }))}
        />

        {renderCalendarView()}
      </ScrollView>

      {/* Book Appointment Modal */}
      <Modal
        visible={bookModalVisible}
        onClose={closeBookModal}
        title={bookedAppointment ? 'Appointment booked' : 'Book appointment'}
        testID="book-appointment-modal"
        footer={
          bookedAppointment ? (
            <View style={styles.modalFooter}>
              <Button title="Close" variant="secondary" onPress={closeBookModal} />
              <Button
                title="Book new appointment"
                variant="primary"
                icon="plus"
                onPress={() => openBookModal(null)}
              />
            </View>
          ) : (
            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="secondary" onPress={closeBookModal} />
              <Button title="Confirm and schedule" loading={booking} onPress={handleBookAppointment} />
            </View>
          )
        }
      >
        {bookedAppointment ? (
          <AppointmentBookedSuccessView appointment={bookedAppointment} />
        ) : (
          <>
            {formPatient ? (
              <View style={styles.selectedPatient} testID="selected-patient-summary">
                <View style={styles.flexFill}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Patient
                  </ThemedText>
                  <ThemedText variant="bodyBold">{formPatient.fullName}</ThemedText>
                  {formPatient.patientCode ? (
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {formPatient.patientCode}
                    </ThemedText>
                  ) : null}
                </View>
                <Button
                  size="sm"
                  variant="secondary"
                  title="Change"
                  onPress={() => {
                    setFormPatient(null);
                    setPatientSearch('');
                  }}
                />
              </View>
            ) : (
              <View style={styles.patientSearch}>
                <Input
                  label="Patient"
                  required
                  leftIcon="search"
                  placeholder="Search by name or patient code"
                  value={patientSearch}
                  onChangeText={setPatientSearch}
                />
                {searchingPatients ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Searching...
                  </ThemedText>
                ) : null}
                {patientResults.map((p) => (
                  <PatientSearchResultRow
                    key={p.id}
                    patient={p}
                    configuredFieldKeys={configuredSearchFields}
                    customFieldDefs={customFieldDefs}
                    onPress={() => {
                      setFormPatient(p);
                      setPatientResults([]);
                    }}
                  />
                ))}
                {!searchingPatients && patientSearch.trim().length >= 2 && patientResults.length === 0 ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    No matching patients.
                  </ThemedText>
                ) : null}
              </View>
            )}

            {doctors.length > 0 ? (
              <View style={styles.fieldGroup}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Attending physician
                </ThemedText>
                <View style={styles.chipRow}>
                  <Button
                    size="sm"
                    variant={formDoctorId === null ? 'primary' : 'secondary'}
                    title="Any"
                    onPress={() => setFormDoctorId(null)}
                  />
                  {doctors.map((d) => (
                    <Button
                      key={d.id}
                      size="sm"
                      variant={formDoctorId === d.id ? 'primary' : 'secondary'}
                      title={formatStaffName(d)}
                      onPress={() => setFormDoctorId(d.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.fieldRow}>
              <View style={styles.flexFill}>
                <ValidatedDateInput
                  label="Appointment Date"
                  placeholder="YYYY-MM-DD"
                  value={formDate}
                  onChangeText={setFormDate}
                  boundaryMode="futureOrToday"
                />
              </View>
              <View style={styles.flexFill}>
                <TimeInput label="Selected Time" placeholder="HH:MM" value={formTime} onChangeText={setFormTime} />
              </View>
            </View>

            {formDoctorId ? (
              <SlotPicker
                doctorId={formDoctorId}
                date={formDate}
                selectedSlot={formTime}
                onSelectSlot={(slot) => {
                  const parts = slot.startTime.split(':');
                  const hhmm = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : slot.startTime;
                  setFormTime(hhmm);
                }}
              />
            ) : null}

            <ServiceSelect
              label="Service type"
              selectedServices={formServiceTypes}
              onChangeServices={setFormServiceTypes}
            />

            <Input
              label="Reason for visit"
              placeholder="Reason or chief complaint"
              value={formReason}
              onChangeText={setFormReason}
            />

            <Input
              label="Notes"
              placeholder="Optional"
              value={formNotes}
              onChangeText={setFormNotes}
              multiline
            />
          </>
        )}
      </Modal>

      {/* Doctor Roster & Schedule Modal */}
      <DoctorRosterCalendarModal
        visible={rosterModalVisible}
        onClose={() => setRosterModalVisible(false)}
        doctors={doctors}
        initialDoctorId={formDoctorId || doctors[0]?.id}
        onAddStaff={() => {
          setRosterModalVisible(false);
          navigation.navigate('Settings', { tab: 'staff', openAddStaff: true });
        }}
      />

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

      {/* Appointment Arrival & Check-In Routing Modal */}
      <Modal
        visible={!!checkInAppointment}
        onClose={() => !checkingInId && setCheckInAppointment(null)}
        title="Check In Appointment"
        subtitle={
          checkInAppointment
            ? `Arrival check-in for ${checkInAppointment.patientName} - confirm attending doctor and room assignment`
            : ''
        }
        maxWidth={540}
        footer={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setCheckInAppointment(null)}
              disabled={!!checkingInId}
            />
            <Button
              title="Confirm Check-In"
              icon="check"
              onPress={handleConfirmAppointmentCheckIn}
              loading={!!checkingInId}
            />
          </>
        }
      >
        <View style={{ gap: theme.spacing.md }}>
          <QueueRoutingSelector
            selectedDoctorId={checkInDoctorId}
            onSelectDoctor={setCheckInDoctorId}
            selectedRoomId={checkInRoomId}
            onSelectRoom={setCheckInRoomId}
            activeDoctors={activeDoctors}
            activeRooms={activeRooms}
            formatStaffName={formatStaffName}
          />
        </View>
      </Modal>

      {/* Appointment Inspection Modal */}
      <AppointmentInspectionModal
        visible={!!inspectedAppointment}
        appointment={inspectedAppointment}
        onClose={() => setInspectedAppointment(null)}
        onCheckIn={(appt) => {
          setInspectedAppointment(null);
          handleOpenCheckInModal(appt);
        }}
        onReschedule={(appt) => {
          setInspectedAppointment(null);
          setRescheduleAppointment(appt);
        }}
        onCancel={(appt) => {
          setInspectedAppointment(null);
          handleCancelAppointment(appt);
        }}
      />

      {/* Appointment Reschedule Modal */}
      <AppointmentRescheduleModal
        visible={!!rescheduleAppointment}
        appointment={rescheduleAppointment}
        onClose={() => setRescheduleAppointment(null)}
        onSuccess={(updated) => {
          setAppointments((prev) =>
            prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
          );
          setRescheduleAppointment(null);
          fetchAppointments();
        }}
      />
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surfaceMuted,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  flexFill: {
    flex: 1,
    minWidth: 0,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  list: {
    gap: theme.spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  timeColumn: {
    width: theme.sizes.sidebarCollapsedWidth + theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  infoColumn: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  actionColumn: {
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  cancelBtn: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
    borderRadius: theme.radii.sm,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  selectedPatient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
  patientSearch: {
    gap: theme.spacing.sm,
  },
  resultRow: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
  },
  fieldGroup: {
    gap: theme.spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  successContainer: {
    gap: theme.spacing.md,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.successBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radii.md,
  },
  successSummaryCard: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
  successSummaryRow: {
    gap: theme.spacing.xs,
  },
});
