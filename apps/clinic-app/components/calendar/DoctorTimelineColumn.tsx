import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import { AppointmentCard } from './AppointmentCard';
import type {
  DoctorShiftOverlay,
  CalendarTimeSlot,
  ExtendedAppointmentItem,
} from './types';
import { evaluateDoctorAvailabilityForSlot } from './calendarUtils';

export interface DoctorTimelineColumnProps {
  doctor: DoctorShiftOverlay;
  dateString: string;
  cellDate: Date;
  slots: CalendarTimeSlot[];
  appointments: ExtendedAppointmentItem[];
  onSelectSlot?: (date: Date, timeStr: string, doctorId: string) => void;
  onSelectAppointment: (appointment: ExtendedAppointmentItem) => void;
}

export function DoctorTimelineColumn({
  doctor,
  dateString,
  cellDate,
  slots,
  appointments,
  onSelectSlot,
  onSelectAppointment,
}: DoctorTimelineColumnProps) {
  const isDoctorOnLeave = !!doctor.leave;

  return (
    <View
      data-testid={`doctor-col-${doctor.doctorId}`}
      testID={`doctor-col-${doctor.doctorId}`}
      data-is-on-duty={String(doctor.isOnDuty)}
      style={styles.columnContainer}
    >
      {/* Doctor Header */}
      <View
        data-testid="doctor-col-header"
        testID="doctor-col-header"
        style={styles.header}
      >
        <ThemedText
          data-testid="doctor-name"
          variant="smallBold"
          color={theme.colors.text}
          numberOfLines={1}
        >
          {doctor.doctorName}
        </ThemedText>

        {doctor.roomName ? (
          <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
            {doctor.roomName}
          </ThemedText>
        ) : null}

        {isDoctorOnLeave ? (
          <View
            data-testid="doctor-leave-badge"
            style={styles.leaveBadge}
          >
            <ThemedText
              variant="caption"
              color={theme.colors.emergencyText}
              style={{ fontWeight: '700' }}
            >
              ({doctor.leave?.reason || 'On Leave'})
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Slots */}
      {slots.map((slot) => {
        const avail = evaluateDoctorAvailabilityForSlot(
          dateString,
          slot.timeStr,
          doctor
        );
        const appt = appointments.find(
          (a) =>
            a.doctorId === doctor.doctorId &&
            a.scheduledAt.startsWith(dateString) &&
            a.scheduledAt.includes(`T${slot.timeStr}:`)
        );

        let slotBg: string = theme.colors.surface;
        if (avail.status === 'Leave') {
          slotBg = theme.colors.surfaceMuted;
        } else if (avail.status === 'Break') {
          slotBg = theme.colors.warningBg;
        } else if (!avail.isAvailable) {
          slotBg = theme.colors.surfaceMuted;
        }

        return (
          <Pressable
            key={slot.timeStr}
            data-testid={`day-slot-${doctor.doctorId}-${slot.timeStr}`}
            testID={`day-slot-${doctor.doctorId}-${slot.timeStr}`}
            data-slot-status={avail.status}
            accessibilityRole="button"
            accessibilityLabel={`${doctor.doctorName} ${slot.timeStr}: ${
              appt
                ? appt.patientName
                : avail.status === 'Break'
                ? 'Break'
                : avail.status === 'Leave'
                ? 'On Leave'
                : avail.isAvailable
                ? 'Available'
                : 'Off Duty'
            }`}
            onPress={() => {
              if (appt) {
                onSelectAppointment(appt);
              } else if (avail.isAvailable && onSelectSlot) {
                onSelectSlot(cellDate, slot.timeStr, doctor.doctorId);
              }
            }}
            style={({ pressed }) => [
              styles.slotCell,
              { backgroundColor: slotBg },
              pressed && avail.isAvailable && !appt && styles.pressed,
            ]}
          >
            {appt ? (
              <AppointmentCard
                appointment={appt}
                variant="timeline"
                onSelect={onSelectAppointment}
              />
            ) : avail.status === 'Break' ? (
              <View style={styles.overlayWrapper}>
                <ThemedText
                  data-testid="break-overlay"
                  variant="caption"
                  color={theme.colors.warningText}
                  style={styles.overlayText}
                >
                  {avail.reason || 'Lunch Break'}
                </ThemedText>
              </View>
            ) : avail.status === 'Leave' ? (
              <View style={styles.overlayWrapper}>
                <ThemedText
                  data-testid="leave-overlay"
                  variant="caption"
                  color={theme.colors.textMuted}
                  style={styles.overlayText}
                >
                  {doctor.leave?.reason || 'On Leave'}
                </ThemedText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  columnContainer: {
    flex: 1,
    minWidth: 150,
    borderRightWidth: theme.sizes.borderWidth,
    borderRightColor: theme.colors.borderLight,
  },
  header: {
    height: 52,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  leaveBadge: {
    marginTop: 2,
    paddingHorizontal: 4,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.emergencyBg,
  },
  slotCell: {
    height: 48,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    padding: 2,
    justifyContent: 'center',
  },
  overlayWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  overlayText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
});

export default DoctorTimelineColumn;
