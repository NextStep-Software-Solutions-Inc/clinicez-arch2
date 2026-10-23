import React, { useState, useEffect } from 'react';
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
import { notify } from '../../utils/feedback';
import { clinicService } from '../../services/clinicService';
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
  onSubmitReschedule?: (newDate: string, newTime: string, reason: string) => void;
  conflictError?: string | null;
}

export function AppointmentRescheduleModal({
  visible,
  appointment,
  onClose,
  onSuccess,
  onSubmitReschedule,
  conflictError: externalConflictError,
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
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [internalConflictError, setInternalConflictError] = useState<string | null>(null);

  useEffect(() => {
    if (appointment) {
      const scheduled = appointment.scheduledAt || '';
      const { dateStr, timeStr } = getAppointmentLocalDateTime(scheduled);
      setNewDate(dateStr || scheduled.split('T')[0] || '');
      setNewTime(timeStr || '09:00');
      setReason('');
      setInternalConflictError(null);
    }
  }, [appointment, visible]);

  if (!visible || !appointment) {
    return null;
  }

  const activeConflict = externalConflictError || internalConflictError;

  const handleSubmit = async () => {
    if (!newDate || !newTime) return;

    if (onSubmitReschedule) {
      onSubmitReschedule(newDate, newTime, reason);
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
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

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
            <ThemedText
              data-testid="reschedule-title"
              variant="h3"
              color={theme.colors.text}
            >
              Reschedule for {appointment.patientName}
            </ThemedText>

            <Pressable
              data-testid="btn-cancel-reschedule"
              testID="btn-cancel-reschedule"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onClose}
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

            {/* Date Input */}
            <View style={styles.fieldGroup}>
              <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                New Date (YYYY-MM-DD)
              </ThemedText>
              <TextInput
                data-testid="reschedule-date-input"
                testID="reschedule-date-input"
                value={newDate}
                onChangeText={setNewDate}
                placeholder="2026-10-21"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
              />
            </View>

            {/* Time Input */}
            <View style={styles.fieldGroup}>
              <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                New Time (HH:MM)
              </ThemedText>
              <TextInput
                data-testid="reschedule-time-input"
                testID="reschedule-time-input"
                value={newTime}
                onChangeText={setNewTime}
                placeholder="10:30"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
              />
            </View>

            {/* Reason Input */}
            <View style={styles.fieldGroup}>
              <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                Reason for Rescheduling
              </ThemedText>
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
              accessibilityRole="button"
              onPress={onClose}
              disabled={loading}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSecondary,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText variant="smallBold" color={theme.colors.text}>
                Cancel
              </ThemedText>
            </Pressable>

            <Pressable
              data-testid="btn-confirm-reschedule"
              testID="btn-confirm-reschedule"
              accessibilityRole="button"
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
    maxWidth: 480,
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
  closeBtn: {
    padding: theme.spacing.xs,
  },
  body: {
    maxHeight: 400,
  },
  bodyContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
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
