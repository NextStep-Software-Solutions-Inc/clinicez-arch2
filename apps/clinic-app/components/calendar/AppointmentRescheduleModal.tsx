import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import CustomModal from '../ui/Modal';
import ValidatedDateInput from '../ui/ValidatedDateInput';
import TimeInput from '../ui/TimeInput';
import { SlotPicker } from '../roster/SlotPicker';
import { notify } from '../../utils/feedback';
import { clinicService } from '../../services/clinicService';
import { useStaff, formatStaffName } from '../../context/StaffContext';
import type { ExtendedAppointmentItem } from './types';
import {
  getAppointmentLocalDateTime,
  manilaDateTimeToUtcIso,
} from './calendarUtils';

export interface AppointmentRescheduleModalProps {
  visible: boolean;
  appointment: ExtendedAppointmentItem | null;
  onClose: () => void;
  onSuccess?: (updatedAppointment: ExtendedAppointmentItem) => void;
  onSubmitReschedule?: (newDate: string, newTime: string, reason: string, doctorId?: string) => void;
  conflictError?: string | null;
  doctors?: Array<{ id: string; name: string }>;
}

export function AppointmentRescheduleModal({
  visible,
  appointment,
  onClose,
  onSuccess,
  onSubmitReschedule,
  conflictError: externalConflictError,
  doctors,
}: AppointmentRescheduleModalProps) {
  const [newDate, setNewDate] = useState<string>(() => {
    if (!appointment?.scheduledAt) return '';
    const { dateStr } = getAppointmentLocalDateTime(appointment.scheduledAt);
    return dateStr || appointment.scheduledAt.split('T')[0] || '';
  });
  const [newTime, setNewTime] = useState<string>(() => {
    if (!appointment?.scheduledAt) return '09:00';
    const { timeStr } = getAppointmentLocalDateTime(appointment.scheduledAt);
    return timeStr || '09:00';
  });
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(
    () => appointment?.doctorId || null
  );
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [internalConflictError, setInternalConflictError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);

  const initialRef = useRef<{ date: string; time: string; doctorId: string | null; reason: string }>({
    date: '',
    time: '09:00',
    doctorId: null,
    reason: '',
  });

  useEffect(() => {
    if (appointment) {
      const scheduled = appointment.scheduledAt || '';
      const { dateStr, timeStr } = getAppointmentLocalDateTime(scheduled);
      const initDate = dateStr || scheduled.split('T')[0] || '';
      const initTime = timeStr || '09:00';
      const initDocId = appointment.doctorId || null;

      setNewDate(initDate);
      setNewTime(initTime);
      setSelectedDoctorId(initDocId);
      setReason('');
      setInternalConflictError(null);
      setShowDiscardConfirm(false);

      initialRef.current = {
        date: initDate,
        time: initTime,
        doctorId: initDocId,
        reason: '',
      };
    }
  }, [appointment, visible]);

  let staffDoctors: Array<{ id: string; name: string }> = [];
  try {
    const staffCtx = useStaff();
    if (staffCtx?.staff && Array.isArray(staffCtx.staff)) {
      staffDoctors = staffCtx.staff
        .filter((s) => s.role === 'Doctor' && s.isActive)
        .map((d) => ({ id: d.id, name: formatStaffName(d) }));
    }
  } catch {
    // Handled when outside StaffProvider
  }

  const doctorsList = useMemo(() => {
    if (doctors && doctors.length > 0) return doctors;
    if (staffDoctors.length > 0) return staffDoctors;
    if (appointment?.doctorId && appointment?.doctorName) {
      return [{ id: appointment.doctorId, name: appointment.doctorName }];
    }
    return [];
  }, [doctors, staffDoctors, appointment?.doctorId, appointment?.doctorName]);

  if (!visible || !appointment) {
    return null;
  }

  const activeConflict = externalConflictError || internalConflictError;

  const isDirty =
    newDate !== initialRef.current.date ||
    newTime !== initialRef.current.time ||
    selectedDoctorId !== initialRef.current.doctorId ||
    reason.trim() !== '';

  const handleRequestClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const currentScheduledInfo = appointment.scheduledAt
    ? getAppointmentLocalDateTime(appointment.scheduledAt)
    : null;

  const handleSubmit = async () => {
    if (!newDate || !newTime) return;

    if (onSubmitReschedule) {
      onSubmitReschedule(newDate, newTime, reason, selectedDoctorId || undefined);
      return;
    }

    setLoading(true);
    setInternalConflictError(null);

    const newScheduledAt = manilaDateTimeToUtcIso(newDate, newTime);
    const [result, err] = await clinicService.rescheduleAppointment(
      appointment.id,
      {
        newScheduledAt,
        durationMinutes: appointment.durationMinutes || 30,
        reason: reason.trim() || undefined,
        doctorId: selectedDoctorId || undefined,
      }
    );

    setLoading(false);

    if (err) {
      if (
        err.status === 409 ||
        err.message?.toLowerCase().includes('conflict') ||
        err.message?.toLowerCase().includes('already booked') ||
        err.errorCode === 'APPOINTMENT_COLLISION'
      ) {
        setInternalConflictError(
          'This time slot is already booked or conflicts with a physician break. Please choose another time.'
        );
      } else {
        notify.error(err.message || 'Failed to reschedule appointment.');
      }
      return;
    }

    if (result) {
      notify.success('Appointment rescheduled.');
      if (onSuccess) {
        onSuccess({
          ...appointment,
          ...result,
          scheduledAt: newScheduledAt,
          doctorId: selectedDoctorId || appointment.doctorId,
          doctorName:
            doctorsList.find((d) => d.id === selectedDoctorId)?.name ||
            appointment.doctorName,
        });
      }
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleRequestClose} />

        <View
          data-testid="appointment-reschedule-modal"
          testID="appointment-reschedule-modal"
          role="dialog"
          aria-modal={true}
          aria-label={`Reschedule appointment for ${appointment.patientName}`}
          style={styles.modalCard}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <ThemedText
                data-testid="reschedule-title"
                variant="h3"
                color={theme.colors.text}
              >
                Reschedule for {appointment.patientName}
              </ThemedText>
              {appointment.patientId ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Patient ID: {appointment.patientId}
                </ThemedText>
              ) : null}
            </View>

            <Pressable
              data-testid="btn-cancel-reschedule"
              testID="btn-cancel-reschedule"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={handleRequestClose}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name="close"
                size={theme.sizes.iconMd}
                color={theme.colors.textMuted}
              />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Current Appointment Snapshot */}
            {currentScheduledInfo ? (
              <View style={styles.currentSnapshot}>
                <View style={styles.snapshotRow}>
                  <Icon name="clock" size={theme.sizes.iconSm} color={theme.colors.primary} />
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    Currently scheduled:{' '}
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      {currentScheduledInfo.dateStr} at {currentScheduledInfo.formattedTime}
                    </ThemedText>
                  </ThemedText>
                </View>
                {appointment.doctorName ? (
                  <View style={styles.snapshotRow}>
                    <Icon name="user" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Physician:{' '}
                      <ThemedText variant="smallBold" color={theme.colors.text}>
                        {appointment.doctorName}
                      </ThemedText>
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Conflict Alert Banner */}
            {activeConflict ? (
              <View
                data-testid="conflict-alert"
                testID="conflict-alert"
                role="alert"
                style={styles.conflictAlert}
              >
                <Icon
                  name="alertCircle"
                  size={theme.sizes.iconSm}
                  color={theme.colors.emergency}
                />
                <ThemedText
                  variant="small"
                  color={theme.colors.emergencyText}
                  style={styles.conflictText}
                >
                  {activeConflict}
                </ThemedText>
              </View>
            ) : null}

            {/* Doctor Selection Chips (if doctors available) */}
            {doctorsList.length > 0 ? (
              <View style={styles.fieldGroup}>
                <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                  Attending Physician
                </ThemedText>
                <View style={styles.doctorChipsContainer}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedDoctorId(null)}
                    style={[
                      styles.doctorChip,
                      selectedDoctorId === null && styles.doctorChipSelected,
                    ]}
                  >
                    <ThemedText
                      variant="captionBold"
                      color={selectedDoctorId === null ? theme.colors.onPrimary : theme.colors.text}
                    >
                      Unassigned / Any
                    </ThemedText>
                  </Pressable>
                  {doctorsList.map((d) => {
                    const isSelected = selectedDoctorId === d.id;
                    return (
                      <Pressable
                        key={d.id}
                        accessibilityRole="button"
                        onPress={() => setSelectedDoctorId(d.id)}
                        style={[styles.doctorChip, isSelected && styles.doctorChipSelected]}
                      >
                        <ThemedText
                          variant="captionBold"
                          color={isSelected ? theme.colors.onPrimary : theme.colors.text}
                        >
                          {d.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Date & Time Picker Grid */}
            <View style={styles.dateTimeGrid}>
              <View style={styles.dateTimeCol}>
                <ValidatedDateInput
                  label="New Date (YYYY-MM-DD)"
                  value={newDate}
                  onChangeText={setNewDate}
                  placeholder="YYYY-MM-DD"
                  boundaryMode="futureOrToday"
                  testID="reschedule-date-container"
                  inputTestID="reschedule-date-input"
                />
              </View>
              <View style={styles.dateTimeCol}>
                <TimeInput
                  label="New Time (HH:MM)"
                  value={newTime}
                  onChangeText={setNewTime}
                  placeholder="HH:MM"
                  testID="reschedule-time-container"
                  inputTestID="reschedule-time-input"
                />
              </View>
            </View>

            {/* Doctor Schedule Time Slots */}
            {selectedDoctorId ? (
              <View style={styles.slotPickerSection}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.subHeading}>
                  Doctor Schedule Time Slots ({doctorsList.find((d) => d.id === selectedDoctorId)?.name || 'Selected Doctor'})
                </ThemedText>
                <SlotPicker
                  doctorId={selectedDoctorId}
                  date={newDate}
                  selectedSlot={newTime}
                  onSelectSlot={(slot) => {
                    const parts = slot.startTime.split(':');
                    const hhmm = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : slot.startTime;
                    setNewTime(hhmm);
                  }}
                />
              </View>
            ) : (
              <View style={styles.noDoctorNotice}>
                <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                <ThemedText variant="caption" color={theme.colors.textMuted} style={{ flex: 1 }}>
                  Select an attending physician above to view their available schedule slots, or set a custom time directly.
                </ThemedText>
              </View>
            )}

            {/* Reason Input with quick presets */}
            <View style={styles.fieldGroup}>
              <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                Reason for Rescheduling
              </ThemedText>
              <View style={styles.presetChipsRow}>
                {['Patient Request', 'Doctor Conflict', 'Emergency', 'Clinic Schedule Change'].map(
                  (preset) => {
                    const isSelected = reason === preset;
                    return (
                      <Pressable
                        key={preset}
                        accessibilityRole="button"
                        onPress={() => setReason(preset)}
                        style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                      >
                        <ThemedText
                          variant="caption"
                          color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                          style={isSelected ? { fontWeight: '700' } : undefined}
                        >
                          {preset}
                        </ThemedText>
                      </Pressable>
                    );
                  }
                )}
              </View>
              <TextInput
                data-testid="reschedule-reason-input"
                testID="reschedule-reason-input"
                value={reason}
                onChangeText={setReason}
                placeholder="Patient request, doctor conflict, emergency..."
                placeholderTextColor={theme.colors.textLight}
                style={[styles.input, styles.textArea]}
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              data-testid="btn-close-reschedule"
              testID="btn-cancel-reschedule"
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={handleRequestClose}
              disabled={loading}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSecondary,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText variant="smallBold" color={theme.colors.text}>
                Close
              </ThemedText>
            </Pressable>

            <Pressable
              data-testid="btn-confirm-reschedule"
              testID="btn-confirm-reschedule"
              accessibilityRole="button"
              accessibilityLabel="Save Reschedule"
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                loading && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.colors.onPrimary} />
              ) : (
                <ThemedText variant="smallBold" color={theme.colors.onPrimary}>
                  Save Reschedule
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Discard Confirmation Alert Dialog */}
      {showDiscardConfirm ? (
        <CustomModal
          visible={showDiscardConfirm}
          onClose={() => setShowDiscardConfirm(false)}
          title="Discard Changes?"
          maxWidth={440}
          testID="discard-reschedule-confirm-modal"
          footer={
            <>
              <Button
                title="Keep Editing"
                variant="ghost"
                testID="btn-abort-discard-reschedule"
                onPress={() => setShowDiscardConfirm(false)}
              />
              <Button
                title="Discard & Close"
                variant="danger"
                testID="btn-confirm-discard-reschedule"
                onPress={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
              />
            </>
          }
        >
          <View style={{ gap: theme.spacing.sm }}>
            <ThemedText variant="body" color={theme.colors.text}>
              You have unsaved changes to this appointment reschedule. Are you sure you want to discard your changes and close?
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.textMuted}>
              Any changes made to the new appointment date, time, and reason will not be saved.
            </ThemedText>
          </View>
        </CustomModal>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  headerTitleWrap: {
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  body: {
    maxHeight: 520,
  },
  bodyContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  currentSnapshot: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  snapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  conflictAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  conflictText: {
    flex: 1,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  doctorChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: 2,
  },
  doctorChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  doctorChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dateTimeGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  dateTimeCol: {
    flex: 1,
    minWidth: 0,
  },
  slotPickerSection: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  subHeading: {
    marginBottom: 2,
  },
  noDoctorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: 4,
  },
  presetChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  presetChipSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  input: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  btn: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
  },
  btnSecondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.75,
  },
});

export default AppointmentRescheduleModal;
