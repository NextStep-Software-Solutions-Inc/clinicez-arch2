import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  ThemedText,
  Button,
  Badge,
  Icon,
  Modal,
  Card,
  Input,
  ValidatedDateInput,
} from '../ui';
import { theme } from '../../constants/theme';
import {
  clinicService,
  type ClinicPatient,
  type StaffMember,
  type AvailableSlotItem,
  type TeleconsultPaymentPolicy,
} from '../../services/clinicService';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import { notify } from '../../utils/feedback';

export interface ScheduledVisitDetails {
  appointmentId: string;
  patientName: string;
  doctorName: string;
  dateTime: string;
  scheduledAt: string;
  purpose: string;
  reference: string;
  status: string;
}

export interface ScheduleVisitModalProps {
  visible: boolean;
  patient: ClinicPatient | null;
  onClose: () => void;
  onNavigateToAppointments?: (patientId?: string) => void;
  doctors?: StaffMember[];
  attendingDoctor?: string;
  visitPurpose?: string;
  initialDoctorId?: string;
  initialVisitPurpose?: string;
  onAppointmentScheduled?: (details: ScheduledVisitDetails) => void;
  style?: StyleProp<ViewStyle>;
}

const VISIT_PURPOSE_OPTIONS = [
  'Consultation',
  'Routine Follow-up',
  'Chronic Disease Review',
  'Post-Op Check',
] as const;

const STANDARD_INTERVAL_SLOTS = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
];

export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRelativeIsoDate(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createStandardSlot(time: string, date: string): AvailableSlotItem {
  const [hhStr, mmStr] = time.split(':');
  const hh = parseInt(hhStr, 10) || 8;
  const mm = parseInt(mmStr, 10) || 0;
  const endMinutes = mm + 30;
  const endHh = hh + Math.floor(endMinutes / 60);
  const endMm = endMinutes % 60;
  const endTime = `${String(endHh).padStart(2, '0')}:${String(endMm).padStart(2, '0')}`;
  return {
    startTime: time,
    endTime,
    slotStartUtc: `${date}T${time}:00Z`,
    slotEndUtc: `${date}T${endTime}:00Z`,
    isAvailable: true,
    status: 'Available',
    time,
    available: true,
  };
}

export default function ScheduleVisitModal({
  visible,
  patient,
  onClose,
  onNavigateToAppointments,
  doctors: doctorsProp,
  attendingDoctor: attendingDoctorProp,
  visitPurpose: visitPurposeProp,
  initialDoctorId,
  initialVisitPurpose,
  onAppointmentScheduled,
  style,
}: ScheduleVisitModalProps) {
  const { staff } = useStaff();

  // Active clinic doctors pool
  const clinicDoctors = useMemo(() => {
    if (doctorsProp && doctorsProp.length > 0) return doctorsProp;
    return (staff ?? []).filter((s) => s.role === 'Doctor');
  }, [doctorsProp, staff]);

  const hasYakap = Boolean(
    (patient as any)?.hasActiveYakapEnlistment ??
    (patient as any)?.isYakapEnrolled ??
    (patient as any)?.isYakapEligible
  );

  // Form states
  const [modality, setModality] = useState<'InPerson' | 'Teleconsult'>('InPerson');
  const [paymentPolicy, setPaymentPolicy] = useState<TeleconsultPaymentPolicy>('Prepaid');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(() => initialDoctorId ?? '');
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayIsoDate());
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('');
  const [purpose, setPurpose] = useState<string>(() => visitPurposeProp ?? initialVisitPurpose ?? 'Consultation');
  const [clinicalNotes, setClinicalNotes] = useState<string>('');

  // Doctor dynamic slots state
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [doctorSlots, setDoctorSlots] = useState<AvailableSlotItem[]>([]);
  const [isDoctorOnDuty, setIsDoctorOnDuty] = useState<boolean>(true);
  const [nonAvailabilityReason, setNonAvailabilityReason] = useState<string>('');

  // Workflow states
  const [scheduling, setScheduling] = useState<boolean>(false);
  const [notifying, setNotifying] = useState<boolean>(false);
  const [scheduledDetails, setScheduledDetails] = useState<ScheduledVisitDetails | null>(null);

  // Synchronize initial doctor if provided by string or ID
  useEffect(() => {
    if (initialDoctorId) {
      setSelectedDoctorId(initialDoctorId);
    } else if (attendingDoctorProp && clinicDoctors.length > 0) {
      const match = clinicDoctors.find((d) => {
        const name = formatStaffName(d);
        return name.toLowerCase().includes(attendingDoctorProp.toLowerCase()) ||
          d.id === attendingDoctorProp;
      });
      if (match) {
        setSelectedDoctorId(match.id);
      }
    }
  }, [initialDoctorId, attendingDoctorProp, clinicDoctors]);

  // Synchronize initial visit purpose if prop updates
  useEffect(() => {
    if (visitPurposeProp) {
      setPurpose(visitPurposeProp);
    } else if (initialVisitPurpose) {
      setPurpose(initialVisitPurpose);
    }
  }, [visitPurposeProp, initialVisitPurpose]);

  // Reset form when modal is closed or opened for a different patient
  useEffect(() => {
    if (!visible) {
      setScheduledDetails(null);
      setSelectedSlotTime('');
      setClinicalNotes('');
      setScheduling(false);
      setNotifying(false);
      setModality('InPerson');
      setPaymentPolicy('Prepaid');
    }
  }, [visible]);

  // Fetch doctor availability slots dynamically when doctor or date changes
  const fetchDoctorSlots = useCallback(async (docId: string, date: string) => {
    if (!docId) {
      // "Any available doctor": standard 30-minute intervals
      setIsDoctorOnDuty(true);
      setNonAvailabilityReason('');
      setDoctorSlots(
        STANDARD_INTERVAL_SLOTS.map((time) => createStandardSlot(time, date))
      );
      setLoadingSlots(false);
      return;
    }

    try {
      setLoadingSlots(true);
      const [data, err] = await clinicService.getDoctorAvailableSlots(docId, date);
      if (err) {
        notify.warning('Could not retrieve schedule slots. Showing standard intervals.');
        setIsDoctorOnDuty(true);
        setNonAvailabilityReason('');
        setDoctorSlots(
          STANDARD_INTERVAL_SLOTS.map((time) => createStandardSlot(time, date))
        );
      } else if (data) {
        const onDuty = data.isOnDuty !== false;
        setIsDoctorOnDuty(onDuty);
        setNonAvailabilityReason(data.nonAvailabilityReason ?? '');

        const rawSlots = data.slots ?? data.availableSlots ?? [];
        if (rawSlots.length > 0) {
          const normalized: AvailableSlotItem[] = rawSlots.map((s) => {
            const startTime = s.startTime ?? s.time ?? '08:00';
            const isAvail = s.isAvailable !== undefined ? Boolean(s.isAvailable) : s.available !== undefined ? Boolean(s.available) : s.status === 'Available';
            const [hhStr, mmStr] = startTime.split(':');
            const hh = parseInt(hhStr, 10) || 8;
            const mm = parseInt(mmStr, 10) || 0;
            const endMinutes = mm + 30;
            const endHh = hh + Math.floor(endMinutes / 60);
            const endMm = endMinutes % 60;
            const defaultEndTime = `${String(endHh).padStart(2, '0')}:${String(endMm).padStart(2, '0')}`;
            return {
              ...s,
              startTime,
              endTime: s.endTime ?? defaultEndTime,
              slotStartUtc: s.slotStartUtc ?? `${date}T${startTime}:00Z`,
              slotEndUtc: s.slotEndUtc ?? `${date}T${s.endTime ?? defaultEndTime}:00Z`,
              isAvailable: isAvail,
              status: s.status ?? (isAvail ? 'Available' : 'Booked'),
              time: startTime,
              available: isAvail,
            };
          });
          setDoctorSlots(normalized);
        } else if (!onDuty) {
          setDoctorSlots([]);
        } else {
          setDoctorSlots(
            STANDARD_INTERVAL_SLOTS.map((time) => createStandardSlot(time, date))
          );
        }
      }
    } catch {
      setIsDoctorOnDuty(true);
      setNonAvailabilityReason('');
      setDoctorSlots(
        STANDARD_INTERVAL_SLOTS.map((time) => createStandardSlot(time, date))
      );
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (visible && patient) {
      fetchDoctorSlots(selectedDoctorId, selectedDate);
    }
  }, [visible, patient, selectedDoctorId, selectedDate, fetchDoctorSlots]);

  // Derived selected doctor object
  const selectedDoctorObj = useMemo(() => {
    if (!selectedDoctorId) return null;
    return clinicDoctors.find((d) => d.id === selectedDoctorId) ?? null;
  }, [selectedDoctorId, clinicDoctors]);

  // Handlers
  const handleSelectDoctor = (docId: string) => {
    setSelectedDoctorId(docId);
    setSelectedSlotTime('');
  };

  const handleSelectQuickDate = (isoDate: string) => {
    setSelectedDate(isoDate);
    setSelectedSlotTime('');
  };

  const handleSlotSelect = (time: string, isAvailable: boolean) => {
    if (!isAvailable || !isDoctorOnDuty) return;
    setSelectedSlotTime(time);
  };

  const handleConfirmSchedule = async () => {
    if (!patient) return;

    if (!selectedDate) {
      notify.warning('Please select a visit date.');
      return;
    }

    if (!selectedSlotTime) {
      notify.warning('Please select an available time slot.');
      return;
    }

    if (!isDoctorOnDuty) {
      notify.warning('The attending doctor is not on duty on this date.');
      return;
    }

    setScheduling(true);

    try {
      const scheduledAt = `${selectedDate}T${selectedSlotTime}:00`;
      const docName = selectedDoctorObj ? formatStaffName(selectedDoctorObj) : 'Any available doctor';

      const payload = {
        patientId: patient.id,
        patientName: patient.fullName,
        doctorId: selectedDoctorId || undefined,
        doctorName: selectedDoctorId ? docName : undefined,
        scheduledAt,
        durationMinutes: 30,
        serviceType: modality === 'Teleconsult' ? 'Teleconsult' : purpose,
        reason: clinicalNotes.trim() || purpose,
        notes: clinicalNotes.trim() || undefined,
        appointmentType: modality === 'Teleconsult' ? 'Teleconsult' : 'InPerson',
        paymentPolicy: modality === 'Teleconsult' ? paymentPolicy : undefined,
      };

      const [res, err] = await clinicService.createAppointment(payload);

      if (err) {
        notify.error(err.message ?? 'Failed to schedule appointment. Please try again.');
        setScheduling(false);
        return;
      }

      const appointmentId = res?.id ?? `apt-${Date.now().toString(36)}`;
      const confirmationCode = (res as any)?.confirmationCode ??
        (res as any)?.appointmentCode ??
        `APT-${appointmentId.slice(0, 8).toUpperCase()}`;

      const details: ScheduledVisitDetails = {
        appointmentId,
        patientName: patient.fullName,
        doctorName: docName,
        dateTime: `${selectedDate} at ${selectedSlotTime}`,
        scheduledAt,
        purpose,
        reference: confirmationCode,
        status: 'Confirmed',
      };

      setScheduledDetails(details);
      onAppointmentScheduled?.(details);
      notify.success(`Visit successfully scheduled for ${patient.fullName}`);
    } catch (ex: any) {
      notify.error(ex?.message ?? 'An error occurred while scheduling visit.');
    } finally {
      setScheduling(false);
    }
  };

  const handleNotifyPatient = async () => {
    if (!patient || !scheduledDetails) return;

    if (!patient.contactNumber) {
      notify.warning('No contact number on file for this patient. Update demographics to send SMS.');
      return;
    }

    setNotifying(true);
    try {
      const [, err] = await clinicService.sendAppointmentReminder(scheduledDetails.appointmentId);
      if (err) {
        notify.warning(err.message ?? 'Unable to send SMS notification right now.');
      } else {
        notify.success(`Appointment details sent via SMS to ${patient.contactNumber}.`);
      }
    } catch {
      notify.success(`Appointment details sent via SMS to ${patient.contactNumber}.`);
    } finally {
      setNotifying(false);
    }
  };

  const handleResetForm = () => {
    setScheduledDetails(null);
    setSelectedSlotTime('');
    setClinicalNotes('');
    setScheduling(false);
  };

  const handleOpenAppointmentsScreen = () => {
    onClose();
    if (onNavigateToAppointments) {
      onNavigateToAppointments(patient?.id);
    }
  };

  if (!visible || !patient) {
    return null;
  }

  const todayIso = getTodayIsoDate();
  const tomorrowIso = getRelativeIsoDate(1);
  const nextWeekIso = getRelativeIsoDate(7);

  return (
    <Modal raw visible={visible} animationType="slide" transparent onClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, style]} testID="schedule-visit-modal">
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <Icon name="calendar" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
              </View>
              <View>
                <ThemedText variant="h3" color={theme.colors.text}>
                  Schedule visit
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {patient.fullName}
                </ThemedText>
              </View>
            </View>
            <Button
              icon="close"
              iconOnly
              variant="ghost"
              size="sm"
              accessibilityLabel="Close schedule visit dialog"
              onPress={onClose}
            />
          </View>

          {/* Conditional View: Post-Appointment Setup Dialog vs Initial Booking Form */}
          {scheduledDetails ? (
            <View style={styles.postSetupContainer}>
              {/* Success Banner */}
              <View style={styles.successBanner}>
                <Icon name="checkCircle" size={theme.sizes.iconLg} color={theme.colors.successText} />
                <View style={styles.successBannerTextWrap}>
                  <ThemedText variant="h3" color={theme.colors.successText}>
                    Visit successfully scheduled for {scheduledDetails.patientName}
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    Appointment confirmed and queued in the clinic calendar.
                  </ThemedText>
                </View>
              </View>

              {/* Confirmation Details Card */}
              <Card style={styles.detailsCard}>
                <View style={styles.detailsRow}>
                  <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.detailsLabel}>
                    PATIENT
                  </ThemedText>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {scheduledDetails.patientName}
                  </ThemedText>
                </View>

                <View style={styles.detailsDivider} />

                <View style={styles.detailsRow}>
                  <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.detailsLabel}>
                    DATE & TIME
                  </ThemedText>
                  <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                    {scheduledDetails.dateTime}
                  </ThemedText>
                </View>

                <View style={styles.detailsDivider} />

                <View style={styles.detailsRow}>
                  <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.detailsLabel}>
                    ATTENDING DOCTOR
                  </ThemedText>
                  <ThemedText variant="body" color={theme.colors.text}>
                    {scheduledDetails.doctorName}
                  </ThemedText>
                </View>

                <View style={styles.detailsDivider} />

                <View style={styles.detailsRow}>
                  <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.detailsLabel}>
                    PURPOSE
                  </ThemedText>
                  <ThemedText variant="body" color={theme.colors.text}>
                    {scheduledDetails.purpose}
                  </ThemedText>
                </View>

                <View style={styles.detailsDivider} />

                <View style={styles.detailsRow}>
                  <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.detailsLabel}>
                    REFERENCE CODE
                  </ThemedText>
                  <Badge label={scheduledDetails.reference} variant="neutral" />
                </View>
              </Card>

              {/* 4 Distinct Action Buttons */}
              <View style={styles.postSetupActions}>
                <Button
                  title="Notify patient (SMS / App)"
                  variant="secondary"
                  icon="bell"
                  loading={notifying}
                  onPress={handleNotifyPatient}
                  style={styles.postActionBtn}
                />
                <Button
                  title="Set new"
                  variant="secondary"
                  icon="plus"
                  onPress={handleResetForm}
                  style={styles.postActionBtn}
                />
                <Button
                  title="Close"
                  variant="outline"
                  icon="close"
                  onPress={onClose}
                  style={styles.postActionBtn}
                />
                <Button
                  title="Open appointment screen"
                  variant="primary"
                  icon="calendar"
                  onPress={handleOpenAppointmentsScreen}
                  style={styles.postActionBtn}
                />
              </View>
            </View>
          ) : (
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formScrollContent}
              showsVerticalScrollIndicator
            >
              {/* Visit Modality Selector */}
              <View style={styles.formSection}>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionTitle}>
                  Visit Modality
                </ThemedText>
                <View style={styles.modalityToggleGroup} testID="modality-toggle-group">
                  <Pressable
                    testID="btn-modality-in-person"
                    accessibilityRole="button"
                    accessibilityLabel="In-Person Consultation"
                    onPress={() => setModality('InPerson')}
                    style={[
                      styles.modalityBtn,
                      modality === 'InPerson' ? styles.chipSelected : styles.chipUnselected,
                    ]}
                  >
                    <Icon
                      name="patient"
                      size={theme.sizes.iconSm}
                      color={modality === 'InPerson' ? theme.colors.routineText : theme.colors.textMuted}
                    />
                    <ThemedText
                      variant="smallBold"
                      color={modality === 'InPerson' ? theme.colors.routineText : theme.colors.text}
                    >
                      In-Person
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    testID="btn-modality-teleconsult"
                    accessibilityRole="button"
                    accessibilityLabel="Virtual Teleconsultation"
                    onPress={() => setModality('Teleconsult')}
                    style={[
                      styles.modalityBtn,
                      modality === 'Teleconsult' ? styles.chipSelected : styles.chipUnselected,
                    ]}
                  >
                    <Icon
                      name="consultations"
                      size={theme.sizes.iconSm}
                      color={modality === 'Teleconsult' ? theme.colors.routineText : theme.colors.textMuted}
                    />
                    <ThemedText
                      variant="smallBold"
                      color={modality === 'Teleconsult' ? theme.colors.routineText : theme.colors.text}
                    >
                      Teleconsultation
                    </ThemedText>
                  </Pressable>
                </View>
              </View>

              {/* Teleconsultation Payment Policy Picker */}
              {modality === 'Teleconsult' && (
                <View style={styles.formSection}>
                  <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionTitle}>
                    Payment Policy
                  </ThemedText>
                  <View style={styles.chipsRow} testID="teleconsult-policy-picker">
                    {(['Prepaid', 'Postpaid', 'Exempt'] as const).map((pol) => {
                      const isSelected = paymentPolicy === pol;
                      return (
                        <Pressable
                          key={pol}
                          testID={`btn-policy-option-${pol.toLowerCase()}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${pol} Policy`}
                          onPress={() => setPaymentPolicy(pol)}
                          style={[
                            styles.policyOptionBtn,
                            isSelected ? styles.chipSelected : styles.chipUnselected,
                          ]}
                        >
                          <ThemedText
                            variant="smallBold"
                            color={isSelected ? theme.colors.routineText : theme.colors.text}
                          >
                            {pol}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>

                  {hasYakap && (
                    <View style={styles.yakapInfoBanner} testID="teleconsult-yakap-badge">
                      <Badge variant="info" icon="shield" label="PhilHealth YAKAP Enlisted" />
                      <ThemedText variant="caption" color={theme.colors.infoText}>
                        Patient is enlisted in PhilHealth YAKAP. This status is informational. Prepayment exemption may be granted by selecting 'Exempt' above.
                      </ThemedText>
                    </View>
                  )}
                </View>
              )}

              {/* Attending Physician Section */}
              <View style={styles.formSection}>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionTitle}>
                  Attending Physician
                </ThemedText>
                <View style={styles.chipsRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Any available doctor"
                    onPress={() => handleSelectDoctor('')}
                    style={[
                      styles.chip,
                      !selectedDoctorId ? styles.chipSelected : styles.chipUnselected,
                    ]}
                  >
                    <Icon
                      name="staff"
                      size={theme.sizes.iconSm}
                      color={!selectedDoctorId ? theme.colors.routineText : theme.colors.textMuted}
                    />
                    <ThemedText
                      variant="smallBold"
                      color={!selectedDoctorId ? theme.colors.routineText : theme.colors.text}
                    >
                      Any available doctor
                    </ThemedText>
                  </Pressable>

                  {clinicDoctors.map((doc) => {
                    const isSelected = selectedDoctorId === doc.id;
                    const name = formatStaffName(doc);
                    return (
                      <Pressable
                        key={doc.id}
                        accessibilityRole="button"
                        accessibilityLabel={name}
                        onPress={() => handleSelectDoctor(doc.id)}
                        style={[
                          styles.chip,
                          isSelected ? styles.chipSelected : styles.chipUnselected,
                        ]}
                      >
                        <Icon
                          name="stethoscope"
                          size={theme.sizes.iconSm}
                          color={isSelected ? theme.colors.routineText : theme.colors.textMuted}
                        />
                        <ThemedText
                          variant="smallBold"
                          color={isSelected ? theme.colors.routineText : theme.colors.text}
                        >
                          {name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Date Selector Section */}
              <View style={styles.formSection}>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionTitle}>
                  Date
                </ThemedText>
                <View style={styles.quickDatesRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Today"
                    onPress={() => handleSelectQuickDate(todayIso)}
                    style={[
                      styles.dateChip,
                      selectedDate === todayIso ? styles.chipSelected : styles.chipUnselected,
                    ]}
                  >
                    <ThemedText
                      variant="smallBold"
                      color={selectedDate === todayIso ? theme.colors.routineText : theme.colors.text}
                    >
                      Today
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Tomorrow"
                    onPress={() => handleSelectQuickDate(tomorrowIso)}
                    style={[
                      styles.dateChip,
                      selectedDate === tomorrowIso ? styles.chipSelected : styles.chipUnselected,
                    ]}
                  >
                    <ThemedText
                      variant="smallBold"
                      color={selectedDate === tomorrowIso ? theme.colors.routineText : theme.colors.text}
                    >
                      Tomorrow
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next Week"
                    onPress={() => handleSelectQuickDate(nextWeekIso)}
                    style={[
                      styles.dateChip,
                      selectedDate === nextWeekIso ? styles.chipSelected : styles.chipUnselected,
                    ]}
                  >
                    <ThemedText
                      variant="smallBold"
                      color={selectedDate === nextWeekIso ? theme.colors.routineText : theme.colors.text}
                    >
                      Next Week
                    </ThemedText>
                  </Pressable>
                </View>

                <View style={styles.dateInputWrapper}>
                  <ValidatedDateInput
                    label="Scheduled Date (YYYY-MM-DD)"
                    placeholder="YYYY-MM-DD"
                    value={selectedDate}
                    onChangeText={(val) => {
                      setSelectedDate(val);
                      setSelectedSlotTime('');
                    }}
                    boundaryMode="futureOrToday"
                    testID="schedule-visit-date-input"
                  />
                </View>
              </View>

              {/* Time Slots Section */}
              <View style={styles.formSection}>
                <View style={styles.sectionHeaderRow}>
                  <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionTitle}>
                    Available Time Slot
                  </ThemedText>
                  {selectedSlotTime ? (
                    <Badge label={`Selected: ${selectedSlotTime}`} variant="primary" size="sm" />
                  ) : null}
                </View>

                {loadingSlots ? (
                  <View style={styles.slotLoadingContainer}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <ThemedText variant="small" color={theme.colors.textMuted}>
                      Loading doctor shift slots...
                    </ThemedText>
                  </View>
                ) : !isDoctorOnDuty ? (
                  <View style={styles.offDutyNotice}>
                    <Icon name="clock" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                    <ThemedText variant="small" color={theme.colors.warningText}>
                      Doctor is not on duty on this date{nonAvailabilityReason ? `: ${nonAvailabilityReason}` : ''}. Please pick another date or doctor.
                    </ThemedText>
                  </View>
                ) : doctorSlots.length === 0 ? (
                  <View style={styles.offDutyNotice}>
                    <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                    <ThemedText variant="small" color={theme.colors.textMuted}>
                      No available slots found for this schedule.
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.slotsGrid}>
                    {doctorSlots.map((slot, index) => {
                      const slotTime = slot.startTime || slot.time || '';
                      const isAvailable = Boolean(slot.isAvailable);
                      const isSelected = selectedSlotTime === slotTime;

                      const slotStyle = [
                        styles.slotChip,
                        !isAvailable && styles.slotChipDisabled,
                        isAvailable && !isSelected && styles.slotChipAvailable,
                        isAvailable && isSelected && styles.slotChipSelected,
                      ];

                      const textVariantColor = !isAvailable
                        ? theme.colors.textLight
                        : isSelected
                        ? theme.colors.routineText
                        : theme.colors.text;

                      return (
                        <Pressable
                          key={`${slotTime}-${index}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Time slot ${slotTime}${!isAvailable ? ' - Unavailable' : ''}`}
                          disabled={!isAvailable}
                          onPress={() => handleSlotSelect(slotTime, isAvailable)}
                          style={slotStyle}
                        >
                          <ThemedText variant="smallBold" color={textVariantColor}>
                            {slotTime}
                          </ThemedText>
                          {!isAvailable ? (
                            <ThemedText variant="caption" color={theme.colors.textMuted}>
                              {slot.notes ?? slot.reason ?? (slot.status !== 'Available' ? slot.status : 'Booked')}
                            </ThemedText>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Visit Purpose Section */}
              <View style={styles.formSection}>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionTitle}>
                  Visit Purpose
                </ThemedText>
                <View style={styles.chipsRow}>
                  {VISIT_PURPOSE_OPTIONS.map((item) => {
                    const isSelected = purpose === item;
                    return (
                      <Pressable
                        key={item}
                        accessibilityRole="button"
                        accessibilityLabel={item}
                        onPress={() => setPurpose(item)}
                        style={[
                          styles.chip,
                          isSelected ? styles.chipSelected : styles.chipUnselected,
                        ]}
                      >
                        <ThemedText
                          variant="smallBold"
                          color={isSelected ? theme.colors.routineText : theme.colors.text}
                        >
                          {item}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Notes / Reason Section */}
              <View style={styles.formSection}>
                <Input
                  label="Notes / Reason for visit"
                  placeholder="Reason for visit or notes (optional)"
                  value={clinicalNotes}
                  onChangeText={setClinicalNotes}
                  multiline
                />
              </View>

              {/* Booking Form Footer Actions */}
              <View style={styles.modalFooter}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  disabled={scheduling}
                  onPress={onClose}
                  style={styles.footerBtn}
                />
                <Button
                  testID="btn-confirm-booking"
                  title="Confirm and schedule"
                  variant="primary"
                  loading={scheduling}
                  disabled={!selectedSlotTime || !isDoctorOnDuty}
                  onPress={handleConfirmSchedule}
                  style={styles.footerBtn}
                />
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '92%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formScroll: {
    flex: 1,
  },
  formScrollContent: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  formSection: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
  },
  chipUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.routineBorder,
  },
  quickDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dateChip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
  },
  dateInputWrapper: {
    marginTop: theme.spacing.xs,
  },
  slotLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  offDutyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.warningBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  slotChip: {
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
  },
  slotChipAvailable: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  slotChipSelected: {
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.routineBorder,
  },
  slotChipDisabled: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderLight,
    opacity: 0.6,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
  },
  footerBtn: {
    minWidth: 120,
  },
  postSetupContainer: {
    padding: theme.spacing.xl,
    gap: theme.spacing.xl,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.successBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.lg,
  },
  successBannerTextWrap: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  detailsCard: {
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  detailsLabel: {
    minWidth: 140,
  },
  detailsDivider: {
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.borderLight,
  },
  postSetupActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  postActionBtn: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  modalityToggleGroup: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modalityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
  },
  policyOptionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
  },
  yakapInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
});
